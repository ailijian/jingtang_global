CREATE TYPE "lifecycle_operation_kind" AS ENUM (
  'channel_disconnect',
  'workspace_data_deletion',
  'account_deletion',
  'authorized_data_retention',
  'retention_purge'
);

CREATE TYPE "lifecycle_operation_state" AS ENUM (
  'pending',
  'claimed',
  'retry',
  'completed',
  'dead'
);

CREATE TYPE "lifecycle_step_state" AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'skipped'
);

ALTER TABLE "users"
  ADD COLUMN "lifecycle_state" VARCHAR(32) NOT NULL DEFAULT 'active',
  ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "channels"
  ADD COLUMN "operation_generation" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "operation_lease_generation" BIGINT;

ALTER TABLE "outbox_messages"
  ADD COLUMN "claim_owner" VARCHAR(160),
  ADD COLUMN "claim_until" TIMESTAMPTZ(3),
  ADD COLUMN "claim_generation" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "lifecycle_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" "lifecycle_operation_kind" NOT NULL,
  "state" "lifecycle_operation_state" NOT NULL DEFAULT 'pending',
  "workspace_id" UUID,
  "channel_id" UUID,
  "subject_user_id" UUID,
  "actor_user_id" UUID,
  "dedupe_key" VARCHAR(255) NOT NULL,
  "request_reference" VARCHAR(40) NOT NULL,
  "correlation_id" UUID NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadline_at" TIMESTAMPTZ(3) NOT NULL,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_by" VARCHAR(160),
  "claimed_until" TIMESTAMPTZ(3),
  "claim_generation" BIGINT NOT NULL DEFAULT 0,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "failure_category" VARCHAR(80),
  "outcome" JSONB NOT NULL DEFAULT '{}',
  "completed_at" TIMESTAMPTZ(3),
  "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lifecycle_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lifecycle_steps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operation_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "state" "lifecycle_step_state" NOT NULL DEFAULT 'pending',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "claim_generation" BIGINT NOT NULL DEFAULT 0,
  "outcome" JSONB NOT NULL DEFAULT '{}',
  "failure_category" VARCHAR(80),
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lifecycle_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_version" INTEGER NOT NULL DEFAULT 1,
  "subject_reference" VARCHAR(80) NOT NULL,
  "actor_reference" VARCHAR(80),
  "action" VARCHAR(80) NOT NULL,
  "target_type" VARCHAR(40) NOT NULL,
  "target_id" VARCHAR(255) NOT NULL,
  "result" VARCHAR(20) NOT NULL,
  "correlation_id" UUID NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "account_audit_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "data_deletion_requests"
  ADD COLUMN "lifecycle_operation_id" UUID,
  ADD COLUMN "retention_expires_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "lifecycle_operations_dedupe_key_key"
  ON "lifecycle_operations"("dedupe_key");
CREATE UNIQUE INDEX "lifecycle_operations_request_reference_key"
  ON "lifecycle_operations"("request_reference");
CREATE INDEX "lifecycle_operations_state_next_attempt_at_requested_at_idx"
  ON "lifecycle_operations"("state", "next_attempt_at", "requested_at");
CREATE INDEX "lifecycle_operations_workspace_id_kind_requested_at_idx"
  ON "lifecycle_operations"("workspace_id", "kind", "requested_at" DESC);
CREATE INDEX "lifecycle_operations_channel_id_kind_requested_at_idx"
  ON "lifecycle_operations"("channel_id", "kind", "requested_at" DESC);
CREATE UNIQUE INDEX "lifecycle_steps_operation_id_name_key"
  ON "lifecycle_steps"("operation_id", "name");
CREATE INDEX "lifecycle_steps_operation_id_ordinal_idx"
  ON "lifecycle_steps"("operation_id", "ordinal");
CREATE INDEX "account_audit_events_subject_reference_occurred_at_idx"
  ON "account_audit_events"("subject_reference", "occurred_at" DESC);
CREATE INDEX "account_audit_events_retention_expires_at_idx"
  ON "account_audit_events"("retention_expires_at");
CREATE UNIQUE INDEX "account_audit_events_correlation_id_action_target_id_key"
  ON "account_audit_events"("correlation_id", "action", "target_id");
CREATE UNIQUE INDEX "data_deletion_requests_lifecycle_operation_id_key"
  ON "data_deletion_requests"("lifecycle_operation_id");

ALTER TABLE "lifecycle_operations"
  ADD CONSTRAINT "lifecycle_operations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lifecycle_steps"
  ADD CONSTRAINT "lifecycle_steps_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "lifecycle_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_lifecycle_operation_id_fkey"
  FOREIGN KEY ("lifecycle_operation_id") REFERENCES "lifecycle_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lifecycle_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lifecycle_operations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lifecycle_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lifecycle_steps" FORCE ROW LEVEL SECURITY;

CREATE POLICY "lifecycle_operation_tenant_isolation" ON "lifecycle_operations"
  USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE POLICY "lifecycle_step_tenant_isolation" ON "lifecycle_steps"
  USING (EXISTS (
    SELECT 1 FROM "lifecycle_operations" operation
    WHERE operation."id" = "operation_id"
      AND operation."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID
  ));

GRANT SELECT, INSERT ON "lifecycle_operations" TO jingtang_app;
GRANT SELECT ON "lifecycle_steps" TO jingtang_app;
REVOKE ALL ON "account_audit_events" FROM jingtang_app;
REVOKE UPDATE, DELETE ON "data_deletion_requests" FROM jingtang_app;

GRANT USAGE ON SCHEMA public TO jingtang_worker;
GRANT USAGE ON TYPE "lifecycle_operation_kind", "lifecycle_operation_state", "lifecycle_step_state" TO jingtang_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "users", "workspaces", "memberships", "invitations", "consent_records", "sessions",
  "channels", "contents", "source_assets", "content_revisions", "platform_versions",
  "approval_decisions", "publishing_intents", "platform_executions", "outbox_messages"
TO jingtang_worker;
GRANT SELECT, INSERT ON "audit_events", "account_audit_events" TO jingtang_worker;
GRANT SELECT, INSERT, UPDATE ON "lifecycle_operations", "lifecycle_steps", "data_deletion_requests"
TO jingtang_worker;

CREATE POLICY "outbox_worker_claim" ON "outbox_messages"
  FOR ALL TO jingtang_worker
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION claim_lifecycle_operation(
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
  attempt INTEGER
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
    lifecycle_operations.claim_generation, lifecycle_operations.attempt
$$;

CREATE OR REPLACE FUNCTION renew_lifecycle_operation_claim(
  target_operation_id UUID,
  target_worker_id TEXT,
  target_generation BIGINT,
  lease_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.lifecycle_operations
  SET claimed_until = CURRENT_TIMESTAMP + (lease_seconds * INTERVAL '1 second'),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = target_operation_id
    AND state = 'claimed'::public.lifecycle_operation_state
    AND claimed_by = target_worker_id
    AND claim_generation = target_generation
    AND claimed_until > CURRENT_TIMESTAMP;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION record_lifecycle_step(
  target_operation_id UUID,
  target_worker_id TEXT,
  target_generation BIGINT,
  step_name TEXT,
  step_ordinal INTEGER,
  step_state public.lifecycle_step_state,
  step_outcome JSONB DEFAULT '{}'::JSONB,
  step_failure_category TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_operations operation
    WHERE operation.id = target_operation_id
      AND operation.state = 'claimed'::public.lifecycle_operation_state
      AND operation.claimed_by = target_worker_id
      AND operation.claim_generation = target_generation
      AND operation.claimed_until > CURRENT_TIMESTAMP
  ) THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.lifecycle_steps (
    operation_id, name, ordinal, state, attempt, claim_generation, outcome,
    failure_category, started_at, completed_at, updated_at
  ) VALUES (
    target_operation_id, step_name, step_ordinal, step_state,
    CASE WHEN step_state = 'running'::public.lifecycle_step_state THEN 1 ELSE 0 END,
    target_generation, step_outcome, step_failure_category,
    CASE WHEN step_state = 'running'::public.lifecycle_step_state THEN CURRENT_TIMESTAMP ELSE NULL END,
    CASE WHEN step_state IN (
      'completed'::public.lifecycle_step_state,
      'failed'::public.lifecycle_step_state,
      'skipped'::public.lifecycle_step_state
    ) THEN CURRENT_TIMESTAMP ELSE NULL END,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (operation_id, name) DO UPDATE SET
    ordinal = EXCLUDED.ordinal,
    state = EXCLUDED.state,
    attempt = CASE
      WHEN EXCLUDED.state = 'running'::public.lifecycle_step_state
      THEN lifecycle_steps.attempt + 1 ELSE lifecycle_steps.attempt END,
    claim_generation = EXCLUDED.claim_generation,
    outcome = EXCLUDED.outcome,
    failure_category = EXCLUDED.failure_category,
    started_at = CASE
      WHEN EXCLUDED.state = 'running'::public.lifecycle_step_state
      THEN CURRENT_TIMESTAMP ELSE lifecycle_steps.started_at END,
    completed_at = EXCLUDED.completed_at,
    updated_at = CURRENT_TIMESTAMP;
  RETURN TRUE;
END;
$$;

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

REVOKE ALL ON FUNCTION claim_lifecycle_operation(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION renew_lifecycle_operation_claim(UUID, TEXT, BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_lifecycle_step(UUID, TEXT, BIGINT, TEXT, INTEGER, public.lifecycle_step_state, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_lifecycle_operation(UUID, TEXT, BIGINT, public.lifecycle_operation_state, JSONB, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_lifecycle_operation(TEXT, INTEGER) TO jingtang_worker;
GRANT EXECUTE ON FUNCTION renew_lifecycle_operation_claim(UUID, TEXT, BIGINT, INTEGER) TO jingtang_worker;
GRANT EXECUTE ON FUNCTION record_lifecycle_step(UUID, TEXT, BIGINT, TEXT, INTEGER, public.lifecycle_step_state, JSONB, TEXT) TO jingtang_worker;
GRANT EXECUTE ON FUNCTION finish_lifecycle_operation(UUID, TEXT, BIGINT, public.lifecycle_operation_state, JSONB, TEXT, INTEGER) TO jingtang_worker;

CREATE OR REPLACE FUNCTION request_account_deletion(
  target_user_id UUID,
  confirmed_email TEXT,
  request_correlation_id UUID
)
RETURNS TABLE (operation_id UUID, request_reference TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operation_row public.lifecycle_operations%ROWTYPE;
  normalized_email TEXT := lower(trim(confirmed_email));
  owned_workspace_id UUID;
BEGIN
  IF target_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id', true), '')::UUID THEN
    RAISE EXCEPTION 'account deletion user context mismatch';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_user_id::TEXT, 19));
  IF NOT EXISTS (
    SELECT 1 FROM public.users account
    WHERE account.id = target_user_id
      AND account.lifecycle_state = 'active'
      AND lower(account.email) = normalized_email
  ) THEN
    RAISE EXCEPTION 'account deletion confirmation mismatch';
  END IF;

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

  UPDATE public.users
  SET lifecycle_state = 'deletion_pending',
      deletion_requested_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = target_user_id;
  DELETE FROM public.sessions WHERE user_id = target_user_id;

  INSERT INTO public.lifecycle_operations (
    kind, subject_user_id, actor_user_id, dedupe_key, request_reference,
    correlation_id, requested_at, deadline_at, next_attempt_at, retention_expires_at
  ) VALUES (
    'account_deletion'::public.lifecycle_operation_kind,
    target_user_id,
    target_user_id,
    'account_deletion:' || target_user_id::TEXT,
    'ACC-' || upper(substr(md5(target_user_id::TEXT || request_correlation_id::TEXT), 1, 20)),
    request_correlation_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '7 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '365 days'
  )
  ON CONFLICT (dedupe_key) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  RETURNING * INTO operation_row;

  INSERT INTO public.account_audit_events (
    subject_reference, actor_reference, action, target_type, target_id,
    result, correlation_id, metadata, occurred_at, retention_expires_at
  ) VALUES (
    md5('account:' || target_user_id::TEXT) || md5('account:v2:' || target_user_id::TEXT),
    md5('account:' || target_user_id::TEXT) || md5('account:v2:' || target_user_id::TEXT),
    'account.deletion_requested', 'user',
    md5('target:' || target_user_id::TEXT) || md5('target:v2:' || target_user_id::TEXT),
    'success', request_correlation_id, '{}'::JSONB, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '365 days'
  );
  RETURN QUERY SELECT operation_row.id, operation_row.request_reference::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION read_account_deletion_material(
  target_operation_id UUID,
  worker_id TEXT,
  generation BIGINT
)
RETURNS TABLE (user_id UUID, email TEXT, identity_subject TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT account.id, account.email::TEXT, account.cognito_subject::TEXT
  FROM public.lifecycle_operations operation
  JOIN public.users account ON account.id = operation.subject_user_id
  WHERE operation.id = target_operation_id
    AND operation.kind = 'account_deletion'::public.lifecycle_operation_kind
    AND operation.state = 'claimed'::public.lifecycle_operation_state
    AND operation.claimed_by = worker_id
    AND operation.claim_generation = generation
    AND operation.claimed_until > CURRENT_TIMESTAMP
    AND account.lifecycle_state = 'deletion_pending'
$$;

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

REVOKE ALL ON FUNCTION request_account_deletion(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_account_deletion_material(UUID, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_account_deletion(UUID, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_account_deletion(UUID, TEXT, UUID) TO jingtang_app;
GRANT EXECUTE ON FUNCTION read_account_deletion_material(UUID, TEXT, BIGINT) TO jingtang_worker;
GRANT EXECUTE ON FUNCTION complete_account_deletion(UUID, TEXT, BIGINT) TO jingtang_worker;

CREATE OR REPLACE FUNCTION record_account_audit_event(
  target_user_id UUID,
  event_action TEXT,
  event_target_type TEXT,
  event_target_id TEXT,
  event_result TEXT,
  event_correlation_id UUID,
  event_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  subject_hash TEXT;
BEGIN
  IF target_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id', true), '')::UUID THEN
    RAISE EXCEPTION 'account audit user context mismatch';
  END IF;
  IF event_action NOT IN ('identity.login', 'identity.logout', 'locale.changed') THEN
    RAISE EXCEPTION 'unsupported account audit action';
  END IF;
  subject_hash := md5('account:' || target_user_id::TEXT) || md5('account:v2:' || target_user_id::TEXT);
  INSERT INTO public.account_audit_events (
    subject_reference, actor_reference, action, target_type, target_id,
    result, correlation_id, metadata, occurred_at, retention_expires_at
  ) VALUES (
    subject_hash, subject_hash, event_action, event_target_type,
    md5('target:' || event_target_id) || md5('target:v2:' || event_target_id),
    event_result, event_correlation_id, event_metadata, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '365 days'
  ) ON CONFLICT (correlation_id, action, target_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION record_account_audit_event(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_account_audit_event(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO jingtang_app;

REVOKE EXECUTE ON FUNCTION pseudonymize_workspace_audit(UUID) FROM jingtang_app;
REVOKE EXECUTE ON FUNCTION delete_workspace_immutable_history(UUID, UUID) FROM jingtang_app;
REVOKE EXECUTE ON FUNCTION pseudonymize_youtube_platform_versions(UUID, UUID, TEXT, TEXT, TEXT) FROM jingtang_app;
REVOKE EXECUTE ON FUNCTION pseudonymize_channel_audit(UUID, UUID, TEXT[]) FROM jingtang_app;
GRANT EXECUTE ON FUNCTION pseudonymize_workspace_audit(UUID) TO jingtang_worker;
GRANT EXECUTE ON FUNCTION delete_workspace_immutable_history(UUID, UUID) TO jingtang_worker;
GRANT EXECUTE ON FUNCTION pseudonymize_youtube_platform_versions(UUID, UUID, TEXT, TEXT, TEXT) TO jingtang_worker;
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
    gen_random_uuid(),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '7 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '365 days'
  FROM public.channels channel
  WHERE channel.platform = 'youtube'
    AND channel.state = 'connected'::public.channel_state
    AND channel.authorized_data_expires_at <= CURRENT_TIMESTAMP
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

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
  WHERE status IN ('expired'::public.invitation_status, 'revoked'::public.invitation_status)
    AND updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
  GET DIAGNOSTICS invitation_count = ROW_COUNT;
  DELETE FROM public.consent_records consent
  WHERE accepted_at < CURRENT_TIMESTAMP - INTERVAL '365 days'
    AND NOT EXISTS (SELECT 1 FROM public.channels channel WHERE channel.consent_record_id = consent.id);
  GET DIAGNOSTICS consent_count = ROW_COUNT;
  DELETE FROM public.data_deletion_requests
  WHERE retention_expires_at <= CURRENT_TIMESTAMP;
  GET DIAGNOSTICS deletion_count = ROW_COUNT;
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
    'lifecycle_operations', operation_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.audit_maintenance', true) IN ('pseudonymize', 'retention') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_account_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.audit_maintenance', true) = 'retention' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'account_audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "account_audit_events_append_only"
BEFORE UPDATE OR DELETE ON "account_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_account_audit_event_mutation();

REVOKE ALL ON FUNCTION enqueue_due_lifecycle_operations() FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_lifecycle_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_due_lifecycle_operations() TO jingtang_worker;
GRANT EXECUTE ON FUNCTION purge_expired_lifecycle_records() TO jingtang_worker;
