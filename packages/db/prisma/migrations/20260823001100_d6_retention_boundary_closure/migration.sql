-- A transient refresh failure may be retried, but the next claim must become
-- eligible no later than the Authorized Data deadline. This keeps backoff from
-- carrying an authorization cycle beyond its 30-day boundary.
CREATE OR REPLACE FUNCTION finish_lifecycle_operation(
  target_operation_id UUID,
  target_worker_id TEXT,
  target_generation BIGINT,
  final_state public.lifecycle_operation_state,
  final_outcome JSONB DEFAULT '{}'::JSONB,
  final_failure_category TEXT DEFAULT NULL,
  retry_after_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF final_state NOT IN (
    'completed'::public.lifecycle_operation_state,
    'retry'::public.lifecycle_operation_state,
    'dead'::public.lifecycle_operation_state
  ) THEN
    RAISE EXCEPTION 'invalid lifecycle completion state';
  END IF;
  UPDATE public.lifecycle_operations
  SET state = final_state,
      outcome = final_outcome,
      failure_category = final_failure_category,
      completed_at = CASE
        WHEN final_state IN ('completed'::public.lifecycle_operation_state, 'dead'::public.lifecycle_operation_state)
        THEN CURRENT_TIMESTAMP ELSE NULL END,
      next_attempt_at = CASE
        WHEN final_state = 'retry'::public.lifecycle_operation_state
          AND kind = 'authorized_data_retention'::public.lifecycle_operation_kind
        THEN LEAST(
          CURRENT_TIMESTAMP + (retry_after_seconds * INTERVAL '1 second'),
          deadline_at
        )
        WHEN final_state = 'retry'::public.lifecycle_operation_state
        THEN CURRENT_TIMESTAMP + (retry_after_seconds * INTERVAL '1 second')
        ELSE next_attempt_at END,
      claimed_by = NULL,
      claimed_until = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = target_operation_id
    AND state = 'claimed'::public.lifecycle_operation_state
    AND claimed_by = target_worker_id
    AND claim_generation = target_generation
    AND claimed_until > CURRENT_TIMESTAMP;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION finish_lifecycle_operation(
  UUID, TEXT, BIGINT, public.lifecycle_operation_state, JSONB, TEXT, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_lifecycle_operation(
  UUID, TEXT, BIGINT, public.lifecycle_operation_state, JSONB, TEXT, INTEGER
) TO jingtang_worker;
