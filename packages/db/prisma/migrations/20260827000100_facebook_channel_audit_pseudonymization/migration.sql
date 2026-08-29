CREATE OR REPLACE FUNCTION pseudonymize_channel_audit(
  target_workspace_id UUID,
  target_channel_id UUID,
  target_ids TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF target_workspace_id IS DISTINCT FROM NULLIF(current_setting('app.workspace_id', true), '')::UUID THEN
    RAISE EXCEPTION 'tenant context mismatch';
  END IF;
  IF target_ids IS NULL
    OR cardinality(target_ids) = 0
    OR NOT target_channel_id::TEXT = ANY(target_ids)
    OR NOT EXISTS (
      SELECT 1
      FROM public.channels AS channel
      WHERE channel.id = target_channel_id
        AND channel.workspace_id = target_workspace_id
        AND channel.platform IN ('youtube', 'facebook')
        AND channel.state IN (
          'disconnecting'::public.channel_state,
          'reauthorization_required'::public.channel_state
        )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(target_ids) AS target(target_id)
      WHERE target.target_id <> target_channel_id::TEXT
        AND NOT EXISTS (
          SELECT 1
          FROM public.platform_executions AS execution
          JOIN public.platform_versions AS version
            ON version.id = execution.platform_version_id
          WHERE execution.id::TEXT = target.target_id
            AND execution.workspace_id = target_workspace_id
            AND version.workspace_id = target_workspace_id
            AND version.account_reference IN (
              'disconnected:' || target_channel_id::TEXT,
              'expired:' || target_channel_id::TEXT
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.publishing_intents AS intent
          WHERE intent.id::TEXT = target.target_id
            AND intent.workspace_id = target_workspace_id
            AND intent.account_references && ARRAY[
              'disconnected:' || target_channel_id::TEXT,
              'expired:' || target_channel_id::TEXT
            ]::TEXT[]
        )
    )
  THEN
    RAISE EXCEPTION 'invalid channel audit pseudonymization target';
  END IF;
  PERFORM set_config('app.audit_maintenance', 'pseudonymize', true);
  UPDATE public.audit_events
  SET metadata = '{}'::JSONB
  WHERE workspace_id = target_workspace_id
    AND target_id = ANY(target_ids);
END;
$$;

REVOKE ALL ON FUNCTION pseudonymize_channel_audit(UUID, UUID, TEXT[]) FROM PUBLIC, jingtang_app;
GRANT EXECUTE ON FUNCTION pseudonymize_channel_audit(UUID, UUID, TEXT[]) TO jingtang_worker;
