CREATE OR REPLACE FUNCTION prepare_account_identity_deletion(
  target_operation_id UUID,
  worker_id TEXT,
  generation BIGINT
)
RETURNS TABLE (user_id UUID, email TEXT, identity_subject TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id UUID;
  owned_workspace_id UUID;
BEGIN
  SELECT operation.subject_user_id
  INTO target_user_id
  FROM public.lifecycle_operations operation
  WHERE operation.id = target_operation_id
    AND operation.kind = 'account_deletion'::public.lifecycle_operation_kind
    AND operation.state = 'claimed'::public.lifecycle_operation_state
    AND operation.claimed_by = worker_id
    AND operation.claim_generation = generation
    AND operation.claimed_until > CURRENT_TIMESTAMP
  FOR UPDATE;
  IF target_user_id IS NULL THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_user_id::TEXT, 19));
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
    RAISE EXCEPTION 'account deletion requires owner transfer or workspace deletion';
  END IF;

  RETURN QUERY
  SELECT account.id, account.email::TEXT, account.cognito_subject::TEXT
  FROM public.users account
  WHERE account.id = target_user_id
    AND account.lifecycle_state = 'deletion_pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- Commit the ownership boundary before the irreversible identity-provider call.
  -- Retries remain idempotent because a deletion-pending account has no active access.
  DELETE FROM public.memberships membership WHERE membership.user_id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION prepare_account_identity_deletion(UUID, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prepare_account_identity_deletion(UUID, TEXT, BIGINT) TO jingtang_worker;

REVOKE ALL ON FUNCTION read_account_deletion_material(UUID, TEXT, BIGINT) FROM PUBLIC;
DROP FUNCTION read_account_deletion_material(UUID, TEXT, BIGINT);
