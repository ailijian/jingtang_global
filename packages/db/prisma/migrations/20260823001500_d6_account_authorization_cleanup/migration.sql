CREATE OR REPLACE FUNCTION list_account_authorized_channels_for_deletion(
  target_operation_id UUID,
  worker_id TEXT,
  generation BIGINT
)
RETURNS TABLE (user_id UUID, workspace_id UUID, channel_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id UUID;
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

  RETURN QUERY
  SELECT target_user_id, channel.workspace_id, channel.id
  FROM public.channels channel
  JOIN public.consent_records consent ON consent.id = channel.consent_record_id
  JOIN public.workspaces workspace ON workspace.id = channel.workspace_id
  WHERE consent.user_id = target_user_id
    AND channel.platform = 'youtube'
    AND workspace.lifecycle_state = 'active'::public.workspace_lifecycle_state
  ORDER BY channel.workspace_id, channel.id;
END;
$$;

CREATE OR REPLACE FUNCTION account_authorized_data_deletion_pending(
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
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'account deletion material unavailable';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.channels channel
    JOIN public.consent_records consent ON consent.id = channel.consent_record_id
    WHERE consent.user_id = target_user_id
      AND channel.platform = 'youtube'
  );
END;
$$;

REVOKE ALL ON FUNCTION list_account_authorized_channels_for_deletion(UUID, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_authorized_data_deletion_pending(UUID, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_account_authorized_channels_for_deletion(UUID, TEXT, BIGINT) TO jingtang_worker;
GRANT EXECUTE ON FUNCTION account_authorized_data_deletion_pending(UUID, TEXT, BIGINT) TO jingtang_worker;
