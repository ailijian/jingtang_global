ALTER TYPE public.lifecycle_operation_kind
  ADD VALUE IF NOT EXISTS 'token_key_retirement';

ALTER TABLE public.data_deletion_requests
  ADD COLUMN requester_reference VARCHAR(64);

UPDATE public.data_deletion_requests
SET requester_reference =
  md5('deletion-requester:' || requested_by_user_id::TEXT) ||
  md5('deletion-requester:v2:' || requested_by_user_id::TEXT)
WHERE requested_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_data_deletion_requester_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_reference TEXT;
BEGIN
  IF current_user = pg_catalog.pg_get_userbyid((
    SELECT proowner
    FROM pg_catalog.pg_proc
    WHERE oid = pg_catalog.to_regprocedure('public.protect_data_deletion_requester_reference()')
  )) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    expected_reference :=
      md5('deletion-requester:' || NEW.requested_by_user_id::TEXT) ||
      md5('deletion-requester:v2:' || NEW.requested_by_user_id::TEXT);
    IF NEW.requester_reference IS DISTINCT FROM expected_reference THEN
      RAISE EXCEPTION 'invalid data deletion requester reference';
    END IF;
  ELSIF NEW.requester_reference IS DISTINCT FROM OLD.requester_reference THEN
    RAISE EXCEPTION 'data deletion requester reference is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS data_deletion_requester_reference_guard
  ON public.data_deletion_requests;
CREATE TRIGGER data_deletion_requester_reference_guard
BEFORE INSERT OR UPDATE ON public.data_deletion_requests
FOR EACH ROW EXECUTE FUNCTION protect_data_deletion_requester_reference();

CREATE OR REPLACE FUNCTION read_workspace_data_deletion_status(
  target_reference TEXT,
  viewer_user_id UUID
)
RETURNS TABLE (deletion_state TEXT, failure_category TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT request.state::TEXT, request.failure_category::TEXT
  FROM public.data_deletion_requests request
  WHERE request.request_reference = target_reference
    AND request.requester_reference =
      md5('deletion-requester:' || viewer_user_id::TEXT) ||
      md5('deletion-requester:v2:' || viewer_user_id::TEXT)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION protect_data_deletion_requester_reference() FROM PUBLIC;
REVOKE ALL ON FUNCTION read_workspace_data_deletion_status(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION read_workspace_data_deletion_status(TEXT, UUID)
TO jingtang_app;

DROP FUNCTION public.claim_lifecycle_operation(TEXT, INTEGER);
CREATE FUNCTION public.claim_lifecycle_operation(
  worker_id TEXT,
  lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  id UUID,
  kind public.lifecycle_operation_kind,
  workspace_id UUID,
  channel_id UUID,
  subject_user_id UUID,
  actor_user_id UUID,
  request_reference TEXT,
  correlation_id UUID,
  requested_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  claim_generation BIGINT,
  attempt INTEGER,
  outcome JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.lifecycle_operations
  SET
    state = 'claimed'::public.lifecycle_operation_state,
    claimed_by = worker_id,
    claimed_until = CURRENT_TIMESTAMP + (lease_seconds * INTERVAL '1 second'),
    claim_generation = lifecycle_operations.claim_generation + 1,
    attempt = lifecycle_operations.attempt + 1,
    failure_category = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE lifecycle_operations.id = (
    SELECT candidate.id
    FROM public.lifecycle_operations candidate
    WHERE candidate.state IN (
      'pending'::public.lifecycle_operation_state,
      'retry'::public.lifecycle_operation_state,
      'claimed'::public.lifecycle_operation_state
    )
      AND candidate.next_attempt_at <= CURRENT_TIMESTAMP
      AND (
        candidate.state <> 'claimed'::public.lifecycle_operation_state
        OR candidate.claimed_until <= CURRENT_TIMESTAMP
      )
    ORDER BY candidate.next_attempt_at, candidate.requested_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING lifecycle_operations.id, lifecycle_operations.kind,
    lifecycle_operations.workspace_id, lifecycle_operations.channel_id,
    lifecycle_operations.subject_user_id, lifecycle_operations.actor_user_id,
    lifecycle_operations.request_reference::TEXT, lifecycle_operations.correlation_id,
    lifecycle_operations.requested_at, lifecycle_operations.deadline_at,
    lifecycle_operations.claim_generation, lifecycle_operations.attempt,
    lifecycle_operations.outcome
$$;

REVOKE ALL ON FUNCTION public.claim_lifecycle_operation(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lifecycle_operation(TEXT, INTEGER)
TO jingtang_worker;
