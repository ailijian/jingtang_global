ALTER TYPE public.platform ADD VALUE IF NOT EXISTS 'instagram';

CREATE TYPE public.provider_removal_state AS ENUM (
  'not_applicable',
  'pending_user_action',
  'confirmed'
);

CREATE TYPE public.provider_write_state AS ENUM (
  'not_started',
  'started',
  'succeeded',
  'ambiguous',
  'failed'
);

ALTER TABLE public.channels
  ADD COLUMN provider_removal_state public.provider_removal_state
  NOT NULL DEFAULT 'not_applicable';

ALTER TABLE public.platform_executions
  ADD COLUMN provider_create_state public.provider_write_state,
  ADD COLUMN provider_publish_state public.provider_write_state,
  ADD COLUMN provider_resource_id VARCHAR(255),
  ADD COLUMN provider_result_id VARCHAR(255);

ALTER TABLE public.platform_executions
  ADD CONSTRAINT instagram_provider_write_state_shape CHECK (
    (
      provider_create_state IS NULL
      AND provider_publish_state IS NULL
      AND provider_resource_id IS NULL
      AND provider_result_id IS NULL
    )
    OR (
      provider_create_state IS NOT NULL
      AND provider_publish_state IS NOT NULL
    )
  );

CREATE TABLE public.instagram_callback_correlations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  subject_correlation_hash CHAR(64) NOT NULL,
  state public.provider_removal_state NOT NULL DEFAULT 'not_applicable',
  confirmed_at TIMESTAMPTZ(3),
  retention_expires_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT instagram_callback_correlations_pkey PRIMARY KEY (id),
  CONSTRAINT instagram_callback_correlations_channel_id_key UNIQUE (channel_id),
  CONSTRAINT instagram_callback_correlations_subject_correlation_hash_key
    UNIQUE (subject_correlation_hash),
  CONSTRAINT instagram_callback_correlations_subject_hash_check
    CHECK (subject_correlation_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT instagram_callback_correlations_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT instagram_callback_correlations_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX instagram_callback_correlations_workspace_id_state_updated_at_idx
  ON public.instagram_callback_correlations(workspace_id, state, updated_at DESC);
CREATE INDEX instagram_callback_correlations_retention_expires_at_idx
  ON public.instagram_callback_correlations(retention_expires_at);

CREATE TABLE public.instagram_callback_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  replay_digest CHAR(64) NOT NULL,
  callback_kind VARCHAR(40) NOT NULL,
  received_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retention_expires_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT instagram_callback_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT instagram_callback_receipts_replay_digest_key UNIQUE (replay_digest),
  CONSTRAINT instagram_callback_receipts_replay_digest_check
    CHECK (replay_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT instagram_callback_receipts_kind_check
    CHECK (callback_kind IN ('deauthorization', 'data_deletion')),
  CONSTRAINT instagram_callback_receipts_correlation_id_fkey
    FOREIGN KEY (correlation_id) REFERENCES public.instagram_callback_correlations(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX instagram_callback_receipts_correlation_id_received_at_idx
  ON public.instagram_callback_receipts(correlation_id, received_at DESC);
CREATE INDEX instagram_callback_receipts_retention_expires_at_idx
  ON public.instagram_callback_receipts(retention_expires_at);

ALTER TABLE public.instagram_callback_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_callback_correlations FORCE ROW LEVEL SECURITY;
CREATE POLICY instagram_callback_correlation_tenant_isolation
  ON public.instagram_callback_correlations
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

ALTER TABLE public.instagram_callback_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_callback_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY instagram_callback_receipt_tenant_isolation
  ON public.instagram_callback_receipts
  USING (
    EXISTS (
      SELECT 1
      FROM public.instagram_callback_correlations correlation
      WHERE correlation.id = correlation_id
        AND correlation.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::UUID
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.instagram_callback_correlations correlation
      WHERE correlation.id = correlation_id
        AND correlation.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::UUID
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_callback_correlations TO jingtang_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_callback_receipts TO jingtang_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_callback_correlations TO jingtang_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_callback_receipts TO jingtang_worker;

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
        'Disconnected Instagram account',
        'Expired Instagram authorization',
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
      'instagram'::public.platform,
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
              WHEN 'instagram'::public.platform THEN 'Disconnected Instagram account'
              ELSE 'Disconnected TikTok account'
            END
          )
          OR (
            channel.state = 'reauthorization_required'::public.channel_state
            AND replacement_account_reference = 'expired:' || target_channel_id::TEXT
            AND replacement_account_display_name = CASE target_platform
              WHEN 'youtube'::public.platform THEN 'Expired YouTube authorization'
              WHEN 'facebook'::public.platform THEN 'Expired Facebook Page authorization'
              WHEN 'instagram'::public.platform THEN 'Expired Instagram authorization'
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
        AND channel.platform IN ('youtube', 'facebook', 'instagram', 'tiktok')
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

CREATE OR REPLACE FUNCTION pseudonymize_instagram_platform_versions(
  target_workspace_id UUID,
  target_channel_id UUID,
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
  PERFORM public.pseudonymize_platform_versions(
    target_workspace_id,
    target_channel_id,
    'instagram'::public.platform,
    target_account_reference,
    replacement_account_reference,
    replacement_account_display_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION pseudonymize_instagram_channel_audit(
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
  IF NOT EXISTS (
    SELECT 1 FROM public.channels channel
    WHERE channel.id = target_channel_id
      AND channel.workspace_id = target_workspace_id
      AND channel.platform = 'instagram'
  ) THEN
    RAISE EXCEPTION 'invalid instagram channel';
  END IF;
  PERFORM public.pseudonymize_channel_audit(target_workspace_id, target_channel_id, target_ids);
END;
$$;

REVOKE ALL ON FUNCTION pseudonymize_instagram_platform_versions(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION pseudonymize_instagram_channel_audit(UUID, UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pseudonymize_instagram_platform_versions(UUID, UUID, TEXT, TEXT, TEXT)
  TO jingtang_app, jingtang_worker;
GRANT EXECUTE ON FUNCTION pseudonymize_instagram_channel_audit(UUID, UUID, TEXT[])
  TO jingtang_app, jingtang_worker;

CREATE OR REPLACE FUNCTION enforce_instagram_provider_write_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  execution_platform public.platform;
BEGIN
  SELECT version.platform INTO execution_platform
  FROM public.platform_versions version
  WHERE version.id = NEW.platform_version_id;

  IF execution_platform IS DISTINCT FROM 'instagram'::public.platform THEN
    IF NEW.provider_create_state IS NOT NULL
      OR NEW.provider_publish_state IS NOT NULL
      OR NEW.provider_resource_id IS NOT NULL
      OR NEW.provider_result_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'provider write checkpoints are instagram-only';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.provider_create_state IS NOT DISTINCT FROM OLD.provider_create_state
    AND NEW.provider_publish_state IS NOT DISTINCT FROM OLD.provider_publish_state
    AND NEW.provider_resource_id IS NULL
    AND NEW.provider_result_id IS NULL
    AND (OLD.provider_resource_id IS NOT NULL OR OLD.provider_result_id IS NOT NULL)
    AND EXISTS (
      SELECT 1 FROM public.platform_versions version
      WHERE version.id = NEW.platform_version_id
        AND version.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::UUID
        AND version.account_reference ~ '^(disconnected|expired):[0-9a-f-]{36}$'
    )
  THEN
    RETURN NEW;
  END IF;

  IF NEW.provider_create_state IS NULL OR NEW.provider_publish_state IS NULL THEN
    RAISE EXCEPTION 'instagram execution requires provider write checkpoints';
  END IF;
  IF NEW.provider_resource_id IS NOT NULL
    AND NEW.provider_create_state <> 'succeeded'::public.provider_write_state
  THEN
    RAISE EXCEPTION 'instagram container id requires succeeded create';
  END IF;
  IF NEW.provider_result_id IS NOT NULL
    AND (
      NEW.provider_publish_state <> 'succeeded'::public.provider_write_state
      OR NEW.provider_create_state <> 'succeeded'::public.provider_write_state
      OR NEW.provider_resource_id IS NULL
    )
  THEN
    RAISE EXCEPTION 'instagram media id requires succeeded create and publish';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.provider_resource_id IS NOT NULL
      AND NEW.provider_resource_id IS DISTINCT FROM OLD.provider_resource_id
    THEN
      RAISE EXCEPTION 'instagram container id is immutable';
    END IF;
    IF OLD.provider_result_id IS NOT NULL
      AND NEW.provider_result_id IS DISTINCT FROM OLD.provider_result_id
    THEN
      RAISE EXCEPTION 'instagram media id is immutable';
    END IF;
    IF OLD.provider_create_state IS DISTINCT FROM NEW.provider_create_state
      AND NOT (
        (OLD.provider_create_state IN (
            'not_started'::public.provider_write_state,
            'failed'::public.provider_write_state
          ) AND NEW.provider_create_state = 'started'::public.provider_write_state)
        OR (OLD.provider_create_state = 'started'::public.provider_write_state
          AND NEW.provider_create_state IN (
            'succeeded'::public.provider_write_state,
            'ambiguous'::public.provider_write_state,
            'failed'::public.provider_write_state
          ))
        OR (OLD.provider_create_state = 'ambiguous'::public.provider_write_state
          AND NEW.provider_create_state IN (
            'succeeded'::public.provider_write_state,
            'failed'::public.provider_write_state
          ))
      )
    THEN
      RAISE EXCEPTION 'invalid instagram create checkpoint transition';
    END IF;
    IF OLD.provider_publish_state IS DISTINCT FROM NEW.provider_publish_state
      AND NOT (
        (OLD.provider_publish_state IN (
            'not_started'::public.provider_write_state,
            'failed'::public.provider_write_state
          ) AND NEW.provider_publish_state = 'started'::public.provider_write_state)
        OR (OLD.provider_publish_state = 'started'::public.provider_write_state
          AND NEW.provider_publish_state IN (
            'succeeded'::public.provider_write_state,
            'ambiguous'::public.provider_write_state,
            'failed'::public.provider_write_state
          ))
        OR (OLD.provider_publish_state = 'ambiguous'::public.provider_write_state
          AND NEW.provider_publish_state IN (
            'succeeded'::public.provider_write_state,
            'failed'::public.provider_write_state
          ))
      )
    THEN
      RAISE EXCEPTION 'invalid instagram publish checkpoint transition';
    END IF;
  END IF;

  IF NEW.provider_publish_state <> 'not_started'::public.provider_write_state
    AND (
      NEW.provider_create_state <> 'succeeded'::public.provider_write_state
      OR NEW.provider_resource_id IS NULL
    )
  THEN
    RAISE EXCEPTION 'instagram publish requires a persisted container';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_execution_instagram_write_transition
BEFORE INSERT OR UPDATE OF
  provider_create_state,
  provider_publish_state,
  provider_resource_id,
  provider_result_id
ON public.platform_executions
FOR EACH ROW EXECUTE FUNCTION enforce_instagram_provider_write_transition();

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
  WHERE channel.platform IN ('youtube', 'facebook', 'instagram', 'tiktok')
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

CREATE OR REPLACE FUNCTION purge_expired_lifecycle_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  audit_count INTEGER := 0;
  account_audit_count INTEGER := 0;
  outbox_count INTEGER := 0;
  invitation_count INTEGER := 0;
  consent_count INTEGER := 0;
  deletion_count INTEGER := 0;
  callback_receipt_count INTEGER := 0;
  callback_correlation_count INTEGER := 0;
  operation_count INTEGER := 0;
BEGIN
  PERFORM set_config('app.audit_maintenance', 'retention', true);
  DELETE FROM public.audit_events
  WHERE occurred_at < CURRENT_TIMESTAMP - INTERVAL '365 days';
  GET DIAGNOSTICS audit_count = ROW_COUNT;
  DELETE FROM public.account_audit_events
  WHERE retention_expires_at <= CURRENT_TIMESTAMP;
  GET DIAGNOSTICS account_audit_count = ROW_COUNT;
  DELETE FROM public.outbox_messages
  WHERE (state = 'completed'::public.outbox_state AND completed_at < CURRENT_TIMESTAMP - INTERVAL '24 hours')
     OR (state = 'dead'::public.outbox_state AND completed_at < CURRENT_TIMESTAMP - INTERVAL '14 days');
  GET DIAGNOSTICS outbox_count = ROW_COUNT;
  DELETE FROM public.invitations
  WHERE (status IN (
           'accepted'::public.invitation_status,
           'expired'::public.invitation_status,
           'revoked'::public.invitation_status
         )
         AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '7 days')
     OR (status = 'pending'::public.invitation_status
         AND expires_at <= CURRENT_TIMESTAMP - INTERVAL '7 days');
  GET DIAGNOSTICS invitation_count = ROW_COUNT;
  DELETE FROM public.consent_records consent
  USING public.users account
  WHERE account.id = consent.user_id
    AND account.lifecycle_state = 'deleted'
    AND account.deleted_at IS NOT NULL
    AND account.deleted_at <= CURRENT_TIMESTAMP - INTERVAL '365 days'
    AND NOT EXISTS (
      SELECT 1
      FROM public.channels channel
      WHERE channel.consent_record_id = consent.id
    );
  GET DIAGNOSTICS consent_count = ROW_COUNT;
  DELETE FROM public.data_deletion_requests
  WHERE retention_expires_at <= CURRENT_TIMESTAMP;
  GET DIAGNOSTICS deletion_count = ROW_COUNT;
  DELETE FROM public.instagram_callback_receipts
  WHERE retention_expires_at <= CURRENT_TIMESTAMP;
  GET DIAGNOSTICS callback_receipt_count = ROW_COUNT;
  DELETE FROM public.instagram_callback_correlations
  WHERE retention_expires_at <= CURRENT_TIMESTAMP;
  GET DIAGNOSTICS callback_correlation_count = ROW_COUNT;
  DELETE FROM public.lifecycle_operations
  WHERE retention_expires_at <= CURRENT_TIMESTAMP
    AND state IN ('completed'::public.lifecycle_operation_state, 'dead'::public.lifecycle_operation_state);
  GET DIAGNOSTICS operation_count = ROW_COUNT;
  RETURN jsonb_build_object(
    'audit_events', audit_count,
    'account_audit_events', account_audit_count,
    'outbox_messages', outbox_count,
    'invitations', invitation_count,
    'consent_records', consent_count,
    'deletion_requests', deletion_count,
    'instagram_callback_receipts', callback_receipt_count,
    'instagram_callback_correlations', callback_correlation_count,
    'lifecycle_operations', operation_count
  );
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_lifecycle_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_lifecycle_records() TO jingtang_worker;
