INSERT INTO public.account_audit_events (
  subject_reference, actor_reference, action, target_type, target_id,
  result, correlation_id, metadata, occurred_at, recorded_at, retention_expires_at
)
SELECT
  md5('account:' || pending.user_id::TEXT) || md5('account:v2:' || pending.user_id::TEXT),
  md5('account:' || pending.user_id::TEXT) || md5('account:v2:' || pending.user_id::TEXT),
  pending.action,
  pending.target_type,
  md5('target:' || pending.target_id) || md5('target:v2:' || pending.target_id),
  pending.result,
  pending.correlation_id,
  pending.metadata,
  pending.occurred_at,
  pending.recorded_at,
  pending.occurred_at + INTERVAL '365 days'
FROM public.pending_identity_audit_events pending
WHERE pending.action IN ('identity.login', 'identity.logout', 'locale.changed')
ON CONFLICT (correlation_id, action, target_id) DO NOTHING;

-- Replace the worker function as part of the forward cutover so databases that
-- already applied the staging-table migration do not retain a stale PL/pgSQL body.
CREATE OR REPLACE FUNCTION complete_account_deletion(
  target_operation_id UUID,
  worker_id TEXT,
  generation BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id UUID;
  request_correlation_id UUID;
  subject_hash TEXT;
  owned_workspace_id UUID;
BEGIN
  SELECT operation.subject_user_id, operation.correlation_id
  INTO target_user_id, request_correlation_id
  FROM public.lifecycle_operations operation
  WHERE operation.id = target_operation_id
    AND operation.kind = 'account_deletion'::public.lifecycle_operation_kind
    AND operation.state = 'claimed'::public.lifecycle_operation_state
    AND operation.claimed_by = worker_id
    AND operation.claim_generation = generation
    AND operation.claimed_until > CURRENT_TIMESTAMP
  FOR UPDATE;
  IF target_user_id IS NULL THEN RETURN FALSE; END IF;

  FOR owned_workspace_id IN
    SELECT membership.workspace_id
    FROM public.memberships membership
    JOIN public.workspaces workspace ON workspace.id = membership.workspace_id
    WHERE membership.user_id = target_user_id
      AND membership.status = 'active'::public.membership_status
      AND membership.role = 'owner_admin'::public.role
      AND workspace.lifecycle_state = 'active'::public.workspace_lifecycle_state
    ORDER BY membership.workspace_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(owned_workspace_id::TEXT, 0));
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM public.memberships membership
    JOIN public.workspaces workspace ON workspace.id = membership.workspace_id
    WHERE membership.user_id = target_user_id
      AND membership.status = 'active'::public.membership_status
      AND membership.role = 'owner_admin'::public.role
      AND workspace.lifecycle_state = 'active'::public.workspace_lifecycle_state
      AND NOT EXISTS (
        SELECT 1
        FROM public.memberships successor
        JOIN public.users successor_user ON successor_user.id = successor.user_id
        WHERE successor.workspace_id = membership.workspace_id
          AND successor.user_id <> target_user_id
          AND successor.status = 'active'::public.membership_status
          AND successor.role = 'owner_admin'::public.role
          AND successor_user.lifecycle_state = 'active'
      )
  ) THEN
    RETURN FALSE;
  END IF;

  subject_hash := md5('account:' || target_user_id::TEXT) || md5('account:v2:' || target_user_id::TEXT);
  DELETE FROM public.sessions WHERE user_id = target_user_id;
  DELETE FROM public.memberships WHERE user_id = target_user_id;
  UPDATE public.users
  SET cognito_subject = 'deleted:' || subject_hash,
      email = 'deleted+' || target_user_id::TEXT || '@invalid.local',
      name = 'Deleted user',
      last_workspace_id = NULL,
      lifecycle_state = 'deleted',
      deleted_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = target_user_id AND lifecycle_state = 'deletion_pending';
  IF NOT FOUND THEN RETURN FALSE; END IF;

  INSERT INTO public.account_audit_events (
    subject_reference, actor_reference, action, target_type, target_id,
    result, correlation_id, metadata, occurred_at, retention_expires_at
  ) VALUES (
    subject_hash, subject_hash, 'account.deletion_completed', 'user',
    md5('target:' || target_user_id::TEXT) || md5('target:v2:' || target_user_id::TEXT),
    'success', request_correlation_id, '{}'::JSONB, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '365 days'
  );
  RETURN TRUE;
END;
$$;

DROP FUNCTION IF EXISTS assign_pending_identity_audit_events(UUID, UUID);
DROP TRIGGER IF EXISTS pending_identity_audit_assignment_only ON public.pending_identity_audit_events;
DROP FUNCTION IF EXISTS prevent_pending_identity_audit_rewrite();
DROP TABLE public.pending_identity_audit_events;
