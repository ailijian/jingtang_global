CREATE OR REPLACE FUNCTION retry_channel_disconnect(
  target_workspace_id UUID,
  target_channel_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tenant_workspace_id UUID;
  updated_count INTEGER;
BEGIN
  tenant_workspace_id := NULLIF(current_setting('app.workspace_id', true), '')::UUID;
  IF tenant_workspace_id IS NULL OR tenant_workspace_id <> target_workspace_id THEN
    RAISE EXCEPTION 'tenant_context_required';
  END IF;

  UPDATE public.lifecycle_operations
  SET
    next_attempt_at = CURRENT_TIMESTAMP,
    failure_category = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE workspace_id = target_workspace_id
    AND channel_id = target_channel_id
    AND kind = 'channel_disconnect'::public.lifecycle_operation_kind
    AND state = 'retry'::public.lifecycle_operation_state;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    UPDATE public.channels
    SET revoke_failure_category = NULL
    WHERE id = target_channel_id
      AND workspace_id = target_workspace_id
      AND state = 'disconnecting'::public.channel_state;
  END IF;

  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION retry_channel_disconnect(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retry_channel_disconnect(UUID, UUID) TO jingtang_app;
