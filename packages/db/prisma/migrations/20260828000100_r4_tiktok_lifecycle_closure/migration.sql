CREATE OR REPLACE FUNCTION prevent_submitted_platform_version_mutation()
RETURNS TRIGGER AS $$
DECLARE
  maintenance_mode TEXT := current_setting('app.platform_version_maintenance', true);
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.workspace_deletion_maintenance', true) = 'on'
    AND current_user = pg_catalog.pg_get_userbyid((
      SELECT "proowner" FROM pg_catalog.pg_proc
      WHERE "oid" = pg_catalog.to_regprocedure('public.delete_workspace_immutable_history(uuid,uuid)')
    ))
    AND OLD."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID
  THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "content_revisions"
    WHERE "id" = OLD."revision_id" AND "submitted_at" IS NOT NULL
  ) THEN
    IF TG_OP = 'UPDATE'
      AND maintenance_mode = 'authorized_data_cleanup'
      AND current_user = pg_catalog.pg_get_userbyid((
        SELECT "proowner" FROM pg_catalog.pg_proc
        WHERE "oid" = pg_catalog.to_regprocedure(
          'public.pseudonymize_platform_versions(uuid,uuid,platform,text,text,text)'
        )
      ))
      AND NEW."id" = OLD."id"
      AND NEW."workspace_id" = OLD."workspace_id"
      AND NEW."revision_id" = OLD."revision_id"
      AND NEW."platform" = OLD."platform"
      AND NEW."title" = OLD."title"
      AND NEW."description" = OLD."description"
      AND NEW."privacy_status" = OLD."privacy_status"
      AND NEW."made_for_kids" = OLD."made_for_kids"
      AND NEW."validation_status" = OLD."validation_status"
      AND NEW."created_at" = OLD."created_at"
      AND NEW."account_reference" ~ '^(disconnected|expired):[0-9a-f-]{36}$'
      AND NEW."account_display_name" IN (
        'Disconnected YouTube channel',
        'Expired YouTube authorization',
        'Disconnected Facebook Page',
        'Expired Facebook Page authorization',
        'Disconnected TikTok account',
        'Expired TikTok authorization'
      )
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'platform versions of submitted revisions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pseudonymize_platform_versions(
  target_workspace_id UUID,
  target_channel_id UUID,
  target_platform public.platform,
  target_account_reference TEXT,
  replacement_account_reference TEXT,
  replacement_account_display_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF target_workspace_id IS DISTINCT FROM NULLIF(current_setting('app.workspace_id', true), '')::UUID
    OR target_platform NOT IN (
      'youtube'::public.platform,
      'facebook'::public.platform,
      'tiktok'::public.platform
    )
    OR target_account_reference IS NULL
    OR target_account_reference = ''
    OR length(replacement_account_reference) > 255
    OR NOT EXISTS (
      SELECT 1 FROM public.channels AS channel
      WHERE channel.id = target_channel_id
        AND channel.workspace_id = target_workspace_id
        AND channel.platform = target_platform::TEXT
        AND channel.external_account_id = target_account_reference
        AND (
          (
            channel.state = 'disconnecting'::public.channel_state
            AND replacement_account_reference = 'disconnected:' || target_channel_id::TEXT
            AND replacement_account_display_name = CASE target_platform
              WHEN 'youtube'::public.platform THEN 'Disconnected YouTube channel'
              WHEN 'facebook'::public.platform THEN 'Disconnected Facebook Page'
              ELSE 'Disconnected TikTok account'
            END
          )
          OR (
            channel.state = 'reauthorization_required'::public.channel_state
            AND replacement_account_reference = 'expired:' || target_channel_id::TEXT
            AND replacement_account_display_name = CASE target_platform
              WHEN 'youtube'::public.platform THEN 'Expired YouTube authorization'
              WHEN 'facebook'::public.platform THEN 'Expired Facebook Page authorization'
              ELSE 'Expired TikTok authorization'
            END
          )
        )
    )
  THEN
    RAISE EXCEPTION 'invalid authorized-data replacement';
  END IF;
  PERFORM set_config('app.platform_version_maintenance', 'authorized_data_cleanup', true);
  UPDATE public.platform_versions
  SET account_reference = replacement_account_reference,
      account_display_name = replacement_account_display_name,
      updated_at = CURRENT_TIMESTAMP
  WHERE workspace_id = target_workspace_id
    AND platform = target_platform
    AND account_reference = target_account_reference;
END;
$$;

REVOKE ALL ON FUNCTION pseudonymize_platform_versions(UUID, UUID, public.platform, TEXT, TEXT, TEXT)
  FROM PUBLIC, jingtang_app;
GRANT EXECUTE ON FUNCTION pseudonymize_platform_versions(UUID, UUID, public.platform, TEXT, TEXT, TEXT)
  TO jingtang_worker;

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
        AND channel.platform IN ('youtube', 'facebook', 'tiktok')
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

CREATE OR REPLACE FUNCTION enqueue_due_lifecycle_operations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  INSERT INTO public.lifecycle_operations (
    kind, workspace_id, channel_id, dedupe_key, request_reference, correlation_id,
    requested_at, deadline_at, next_attempt_at, retention_expires_at
  )
  SELECT
    'authorized_data_retention'::public.lifecycle_operation_kind,
    channel.workspace_id,
    channel.id,
    'authorized_data_retention:' || channel.id::TEXT || ':' || channel.authorized_data_expires_at::TEXT,
    'ADR-' || upper(substr(md5(channel.id::TEXT || channel.authorized_data_expires_at::TEXT), 1, 20)),
    gen_random_uuid(), CURRENT_TIMESTAMP, channel.authorized_data_expires_at,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '365 days'
  FROM public.channels channel
  WHERE channel.platform IN ('youtube', 'facebook', 'tiktok')
    AND channel.state = 'connected'::public.channel_state
    AND channel.authorized_data_expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 day'
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  INSERT INTO public.lifecycle_operations (
    kind, workspace_id, channel_id, dedupe_key, request_reference, correlation_id,
    requested_at, deadline_at, next_attempt_at, retention_expires_at, outcome
  )
  SELECT
    'token_key_retirement'::public.lifecycle_operation_kind,
    candidate.workspace_id,
    candidate.channel_id,
    'token_key_retirement:' || md5(candidate.token_ciphertext_reference),
    'KEY-' || upper(substr(md5(candidate.id::TEXT), 1, 28)),
    gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '365 days',
    jsonb_build_object('key_reference', candidate.token_ciphertext_reference)
  FROM public.facebook_connection_candidates candidate
  WHERE candidate.expires_at <= CURRENT_TIMESTAMP
  ON CONFLICT (dedupe_key) DO NOTHING;

  DELETE FROM public.facebook_connection_candidates candidate
  WHERE candidate.expires_at <= CURRENT_TIMESTAMP
    AND EXISTS (
      SELECT 1 FROM public.lifecycle_operations operation
      WHERE operation.dedupe_key =
        'token_key_retirement:' || md5(candidate.token_ciphertext_reference)
    );

  DELETE FROM public.provider_data_deletion_requests request
  WHERE request.requested_at <= CURRENT_TIMESTAMP - INTERVAL '365 days';

  INSERT INTO public.lifecycle_operations (
    kind, dedupe_key, request_reference, correlation_id, requested_at,
    deadline_at, next_attempt_at, retention_expires_at
  ) VALUES (
    'retention_purge'::public.lifecycle_operation_kind,
    'retention_purge:' || CURRENT_DATE::TEXT,
    'RTP-' || replace(CURRENT_DATE::TEXT, '-', ''),
    gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '365 days'
  ) ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_due_lifecycle_operations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_due_lifecycle_operations() TO jingtang_worker;
