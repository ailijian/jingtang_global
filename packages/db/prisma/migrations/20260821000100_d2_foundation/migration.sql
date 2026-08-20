CREATE TYPE "locale" AS ENUM ('en', 'zh-CN');
CREATE TYPE "role" AS ENUM ('owner_admin', 'editor', 'approver_publisher', 'viewer');
CREATE TYPE "membership_status" AS ENUM ('active', 'removed');
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE "channel_state" AS ENUM ('not_connected', 'connecting', 'connected', 'reauthorization_required', 'disconnecting', 'disconnected');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cognito_subject" VARCHAR(255) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "locale_preference" "locale" NOT NULL DEFAULT 'en',
  "last_workspace_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "role" NOT NULL,
  "status" "membership_status" NOT NULL DEFAULT 'active',
  "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "role" "role" NOT NULL,
  "status" "invitation_status" NOT NULL DEFAULT 'pending',
  "invited_by_user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consent_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "terms_version" VARCHAR(80) NOT NULL,
  "privacy_version" VARCHAR(80) NOT NULL,
  "data_purpose_version" VARCHAR(80) NOT NULL,
  "displayed_locale" "locale" NOT NULL,
  "acceptance_method" VARCHAR(40) NOT NULL,
  "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "current_workspace_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "platform" VARCHAR(40) NOT NULL,
  "external_account_id" VARCHAR(255),
  "display_name" VARCHAR(255),
  "state" "channel_state" NOT NULL DEFAULT 'not_connected',
  "granted_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "consent_record_id" UUID,
  "token_ciphertext_reference" VARCHAR(500),
  "denied_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_version" INTEGER NOT NULL DEFAULT 1,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workspace_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "actor_type" VARCHAR(20) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "target_type" VARCHAR(40) NOT NULL,
  "target_id" VARCHAR(255) NOT NULL,
  "result" VARCHAR(20) NOT NULL,
  "correlation_id" UUID NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_cognito_subject_key" ON "users"("cognito_subject");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "workspaces_created_by_user_id_idx" ON "workspaces"("created_by_user_id");
CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");
CREATE INDEX "memberships_workspace_id_role_status_idx" ON "memberships"("workspace_id", "role", "status");
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "invitations_workspace_id_status_expires_at_idx" ON "invitations"("workspace_id", "status", "expires_at");
CREATE INDEX "invitations_workspace_id_email_idx" ON "invitations"("workspace_id", "email");
CREATE INDEX "consent_records_user_id_accepted_at_idx" ON "consent_records"("user_id", "accepted_at");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE UNIQUE INDEX "channels_workspace_id_platform_external_account_id_key" ON "channels"("workspace_id", "platform", "external_account_id");
CREATE INDEX "channels_workspace_id_state_idx" ON "channels"("workspace_id", "state");
CREATE INDEX "audit_events_workspace_id_occurred_at_idx" ON "audit_events"("workspace_id", "occurred_at" DESC);
CREATE INDEX "audit_events_workspace_id_action_occurred_at_idx" ON "audit_events"("workspace_id", "action", "occurred_at" DESC);

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

GRANT USAGE ON SCHEMA public TO jingtang_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "workspaces", "memberships", "invitations", "consent_records", "sessions", "channels" TO jingtang_app;
GRANT SELECT, INSERT ON "audit_events" TO jingtang_app;

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "channels" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_tenant_isolation" ON "workspaces"
  USING ("id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK ("id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE POLICY "membership_tenant_isolation" ON "memberships"
  USING (
    "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID
    OR "user_id" = NULLIF(current_setting('app.user_id', true), '')::UUID
  )
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE POLICY "invitation_tenant_isolation" ON "invitations"
  USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE POLICY "channel_tenant_isolation" ON "channels"
  USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE POLICY "audit_event_tenant_isolation" ON "audit_events"
  USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
