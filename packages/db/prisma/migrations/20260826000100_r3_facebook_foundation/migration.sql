ALTER TYPE "platform" ADD VALUE IF NOT EXISTS 'facebook';

ALTER TABLE "channels"
  ADD COLUMN "authorization_subject_reference" VARCHAR(255),
  ADD COLUMN "oauth_state_digest" CHAR(64);

CREATE INDEX "channels_platform_authorization_subject_reference_idx"
  ON "channels"("platform", "authorization_subject_reference")
  WHERE "authorization_subject_reference" IS NOT NULL;

CREATE TABLE "facebook_connection_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "consent_record_id" UUID NOT NULL,
  "meta_user_id" VARCHAR(255) NOT NULL,
  "meta_user_display_name" VARCHAR(255) NOT NULL,
  "granted_scopes" TEXT[] NOT NULL,
  "page_options" JSONB NOT NULL,
  "token_ciphertext_reference" VARCHAR(500) NOT NULL,
  "token_envelope_ciphertext" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facebook_connection_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facebook_connection_candidates_channel_id_key" UNIQUE ("channel_id"),
  CONSTRAINT "facebook_connection_candidates_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "facebook_connection_candidates_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "facebook_connection_candidates_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "facebook_connection_candidates_consent_record_id_fkey"
    FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "facebook_connection_candidates_workspace_id_expires_at_idx"
  ON "facebook_connection_candidates"("workspace_id", "expires_at");

ALTER TABLE "facebook_connection_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "facebook_connection_candidates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "facebook_connection_candidate_tenant_isolation"
  ON "facebook_connection_candidates"
  USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
GRANT SELECT, INSERT, UPDATE, DELETE ON "facebook_connection_candidates" TO jingtang_app;
GRANT SELECT, DELETE ON "facebook_connection_candidates" TO jingtang_worker;

CREATE TABLE "provider_data_deletion_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(40) NOT NULL,
  "subject_hash" CHAR(64) NOT NULL,
  "confirmation_code" VARCHAR(40) NOT NULL,
  "channel_ids" UUID[] NOT NULL,
  "state" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_data_deletion_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_data_deletion_requests_confirmation_code_key" UNIQUE ("confirmation_code"),
  CONSTRAINT "provider_data_deletion_requests_state_check"
    CHECK ("state" IN ('pending', 'completed'))
);

CREATE INDEX "provider_data_deletion_requests_provider_subject_hash_requested_at_idx"
  ON "provider_data_deletion_requests"("provider", "subject_hash", "requested_at" DESC);
REVOKE ALL ON "provider_data_deletion_requests" FROM PUBLIC, jingtang_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "provider_data_deletion_requests" TO jingtang_worker;

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
        'Expired Facebook Page authorization'
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
    OR target_platform NOT IN ('youtube'::public.platform, 'facebook'::public.platform)
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
              ELSE 'Disconnected Facebook Page'
            END
          )
          OR (
            channel.state = 'reauthorization_required'::public.channel_state
            AND replacement_account_reference = 'expired:' || target_channel_id::TEXT
            AND replacement_account_display_name = CASE target_platform
              WHEN 'youtube'::public.platform THEN 'Expired YouTube authorization'
              ELSE 'Expired Facebook Page authorization'
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

CREATE OR REPLACE FUNCTION request_facebook_authorized_data_deletion(
  target_subject_reference TEXT,
  target_subject_hash TEXT
)
RETURNS TABLE (confirmation_code TEXT, deletion_state TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  subject_digest TEXT;
  code TEXT;
  matched_channel_ids UUID[];
  channel_record RECORD;
  request_correlation_id UUID := gen_random_uuid();
  request_now TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
  IF target_subject_reference IS NULL OR target_subject_reference = '' OR length(target_subject_reference) > 255 THEN
    RAISE EXCEPTION 'invalid provider subject';
  END IF;
  IF target_subject_hash IS NULL OR target_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid provider subject hash';
  END IF;
  subject_digest := target_subject_hash;

  SELECT request.confirmation_code, request.state
  INTO code, deletion_state
  FROM public.provider_data_deletion_requests request
  WHERE request.provider = 'facebook'
    AND request.subject_hash = subject_digest
    AND request.state = 'pending'
  ORDER BY request.requested_at DESC
  LIMIT 1;
  IF code IS NOT NULL THEN
    confirmation_code := code;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(channel.id), ARRAY[]::UUID[])
  INTO matched_channel_ids
  FROM public.channels channel
  WHERE channel.platform = 'facebook'
    AND channel.authorization_subject_reference = target_subject_reference
    AND channel.state <> 'disconnected'::public.channel_state;

  code := 'META-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 24));
  deletion_state := CASE WHEN cardinality(matched_channel_ids) = 0 THEN 'completed' ELSE 'pending' END;
  INSERT INTO public.provider_data_deletion_requests (
    provider, subject_hash, confirmation_code, channel_ids, state, requested_at, completed_at, updated_at
  ) VALUES (
    'facebook', subject_digest, code, matched_channel_ids, deletion_state, request_now,
    CASE WHEN deletion_state = 'completed' THEN request_now ELSE NULL END, request_now
  );

  FOR channel_record IN
    UPDATE public.channels channel
    SET state = 'disconnecting'::public.channel_state,
        denied_at = request_now,
        disconnect_requested_at = request_now,
        revoke_failure_category = NULL,
        revoke_attempt_count = 0,
        operation_generation = channel.operation_generation + 1,
        updated_at = request_now
    WHERE channel.id = ANY(matched_channel_ids)
      AND channel.state <> 'disconnecting'::public.channel_state
    RETURNING channel.id, channel.workspace_id, channel.operation_generation
  LOOP
    INSERT INTO public.lifecycle_operations (
      kind, workspace_id, channel_id, actor_user_id, dedupe_key, request_reference,
      correlation_id, requested_at, deadline_at, next_attempt_at, retention_expires_at
    ) VALUES (
      'channel_disconnect'::public.lifecycle_operation_kind,
      channel_record.workspace_id,
      channel_record.id,
      NULL,
      'channel_disconnect:' || channel_record.id::TEXT || ':' || channel_record.operation_generation::TEXT,
      'CHD-' || upper(substr(md5(channel_record.id::TEXT || request_now::TEXT), 1, 16)),
      request_correlation_id,
      request_now,
      request_now + INTERVAL '7 days',
      request_now,
      request_now + INTERVAL '365 days'
    ) ON CONFLICT (dedupe_key) DO NOTHING;
    INSERT INTO public.audit_events (
      id, event_version, occurred_at, recorded_at, workspace_id, actor_user_id,
      actor_type, action, target_type, target_id, result, correlation_id, metadata
    ) VALUES (
      gen_random_uuid(), 1, request_now, request_now, channel_record.workspace_id, NULL,
      'system', 'channel.disconnect_started', 'channel', channel_record.id::TEXT,
      'success', request_correlation_id,
      jsonb_build_object('platform', 'facebook', 'source', 'meta_callback')
    );
  END LOOP;

  confirmation_code := code;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION read_provider_data_deletion_status(target_confirmation_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_record RECORD;
BEGIN
  SELECT * INTO request_record
  FROM public.provider_data_deletion_requests
  WHERE confirmation_code = target_confirmation_code;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF request_record.state = 'pending' AND NOT EXISTS (
    SELECT 1 FROM public.channels channel
    WHERE channel.id = ANY(request_record.channel_ids)
      AND channel.state <> 'disconnected'::public.channel_state
  ) THEN
    UPDATE public.provider_data_deletion_requests
    SET state = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = request_record.id;
    RETURN 'completed';
  END IF;
  RETURN request_record.state;
END;
$$;

REVOKE ALL ON FUNCTION request_facebook_authorized_data_deletion(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_provider_data_deletion_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_facebook_authorized_data_deletion(TEXT, TEXT) TO jingtang_app;
GRANT EXECUTE ON FUNCTION read_provider_data_deletion_status(TEXT) TO jingtang_app;

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
  WHERE channel.platform IN ('youtube', 'facebook')
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
