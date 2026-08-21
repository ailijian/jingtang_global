CREATE TYPE "content_status" AS ENUM ('draft', 'pending_approval', 'rejected', 'approved');
CREATE TYPE "source_asset_status" AS ENUM ('pending_upload', 'complete', 'failed');
CREATE TYPE "platform" AS ENUM ('youtube');
CREATE TYPE "privacy_status" AS ENUM ('private', 'unlisted', 'public');
CREATE TYPE "validation_status" AS ENUM ('valid', 'invalid');
CREATE TYPE "approval_result" AS ENUM ('approved', 'rejected');
CREATE TYPE "publishing_intent_state" AS ENUM ('none', 'ready', 'scheduled', 'cancelled');
CREATE TYPE "publishing_mode" AS ENUM ('immediate', 'scheduled');
CREATE TYPE "platform_execution_state" AS ENUM ('not_started', 'publishing', 'processing', 'published', 'failed', 'needs_attention', 'cancelled');

CREATE TABLE "contents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "internal_title" VARCHAR(160) NOT NULL,
  "status" "content_status" NOT NULL DEFAULT 'draft',
  "current_revision_number" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "content_id" UUID,
  "object_key" VARCHAR(700) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "media_type" VARCHAR(160) NOT NULL,
  "byte_size" BIGINT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "status" "source_asset_status" NOT NULL DEFAULT 'pending_upload',
  "ownership_confirmed" BOOLEAN NOT NULL,
  "failure_category" VARCHAR(80),
  "uploaded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "source_assets_positive_byte_size" CHECK ("byte_size" > 0),
  CONSTRAINT "source_assets_sha256_format" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "source_assets_ownership_confirmed" CHECK ("ownership_confirmed" = TRUE)
);

CREATE TABLE "content_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "content_id" UUID NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "source_asset_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "submitted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_revisions_positive_number" CHECK ("revision_number" > 0)
);

CREATE TABLE "platform_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "platform" "platform" NOT NULL,
  "account_reference" VARCHAR(255) NOT NULL,
  "account_display_name" VARCHAR(255) NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "description" VARCHAR(5000) NOT NULL,
  "privacy_status" "privacy_status" NOT NULL,
  "made_for_kids" BOOLEAN NOT NULL,
  "validation_status" "validation_status" NOT NULL DEFAULT 'valid',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "content_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "result" "approval_result" NOT NULL,
  "reason" VARCHAR(1000),
  "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_rejection_reason_required" CHECK ("result" <> 'rejected' OR length(trim(COALESCE("reason", ''))) > 0)
);

CREATE TABLE "publishing_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "content_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "platform_version_ids" UUID[] NOT NULL,
  "account_references" TEXT[] NOT NULL,
  "payload_snapshot" JSONB NOT NULL,
  "permission_decision" VARCHAR(40) NOT NULL,
  "state" "publishing_intent_state" NOT NULL,
  "mode" "publishing_mode" NOT NULL,
  "confirmed_by_user_id" UUID NOT NULL,
  "consent_version" VARCHAR(80) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publishing_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "publishing_intent_id" UUID NOT NULL,
  "platform_version_id" UUID NOT NULL,
  "operation" VARCHAR(40) NOT NULL,
  "attempt" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "state" "platform_execution_state" NOT NULL DEFAULT 'not_started',
  "failure_category" VARCHAR(80),
  "provider_id" VARCHAR(255),
  "provider_url" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_executions_positive_attempt" CHECK ("attempt" > 0)
);

CREATE INDEX "contents_workspace_id_status_updated_at_idx" ON "contents"("workspace_id", "status", "updated_at" DESC);
CREATE UNIQUE INDEX "source_assets_content_id_key" ON "source_assets"("content_id");
CREATE UNIQUE INDEX "source_assets_object_key_key" ON "source_assets"("object_key");
CREATE INDEX "source_assets_workspace_id_status_created_at_idx" ON "source_assets"("workspace_id", "status", "created_at" DESC);
CREATE INDEX "source_assets_workspace_id_uploaded_by_user_id_idx" ON "source_assets"("workspace_id", "uploaded_by_user_id");
CREATE UNIQUE INDEX "content_revisions_content_id_revision_number_key" ON "content_revisions"("content_id", "revision_number");
CREATE INDEX "content_revisions_workspace_id_content_id_revision_number_idx" ON "content_revisions"("workspace_id", "content_id", "revision_number" DESC);
CREATE UNIQUE INDEX "platform_versions_revision_id_platform_account_reference_key" ON "platform_versions"("revision_id", "platform", "account_reference");
CREATE INDEX "platform_versions_workspace_id_revision_id_idx" ON "platform_versions"("workspace_id", "revision_id");
CREATE UNIQUE INDEX "approval_decisions_revision_id_key" ON "approval_decisions"("revision_id");
CREATE INDEX "approval_decisions_workspace_id_decided_at_idx" ON "approval_decisions"("workspace_id", "decided_at" DESC);
CREATE UNIQUE INDEX "publishing_intents_workspace_id_idempotency_key_key" ON "publishing_intents"("workspace_id", "idempotency_key");
CREATE INDEX "publishing_intents_workspace_id_content_id_confirmed_at_idx" ON "publishing_intents"("workspace_id", "content_id", "confirmed_at" DESC);
CREATE UNIQUE INDEX "platform_executions_publishing_intent_id_platform_version_id_key" ON "platform_executions"("publishing_intent_id", "platform_version_id");
CREATE UNIQUE INDEX "platform_executions_workspace_id_idempotency_key_key" ON "platform_executions"("workspace_id", "idempotency_key");
CREATE INDEX "platform_executions_workspace_id_state_updated_at_idx" ON "platform_executions"("workspace_id", "state", "updated_at" DESC);

ALTER TABLE "contents" ADD CONSTRAINT "contents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_assets" ADD CONSTRAINT "source_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_assets" ADD CONSTRAINT "source_assets_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_assets" ADD CONSTRAINT "source_assets_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "source_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_versions" ADD CONSTRAINT "platform_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_versions" ADD CONSTRAINT "platform_versions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publishing_intents" ADD CONSTRAINT "publishing_intents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publishing_intents" ADD CONSTRAINT "publishing_intents_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publishing_intents" ADD CONSTRAINT "publishing_intents_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publishing_intents" ADD CONSTRAINT "publishing_intents_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_executions" ADD CONSTRAINT "platform_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_executions" ADD CONSTRAINT "platform_executions_publishing_intent_id_fkey" FOREIGN KEY ("publishing_intent_id") REFERENCES "publishing_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_executions" ADD CONSTRAINT "platform_executions_platform_version_id_fkey" FOREIGN KEY ("platform_version_id") REFERENCES "platform_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "contents", "source_assets", "content_revisions", "platform_versions", "approval_decisions", "publishing_intents", "platform_executions" TO jingtang_app;

ALTER TABLE "contents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "source_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "source_assets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "content_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_revisions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "platform_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "approval_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_decisions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "publishing_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "publishing_intents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "platform_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_executions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "content_tenant_isolation" ON "contents" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
CREATE POLICY "source_asset_tenant_isolation" ON "source_assets" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
CREATE POLICY "content_revision_tenant_isolation" ON "content_revisions" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
CREATE POLICY "platform_version_tenant_isolation" ON "platform_versions" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
CREATE POLICY "approval_decision_tenant_isolation" ON "approval_decisions" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
CREATE POLICY "publishing_intent_tenant_isolation" ON "publishing_intents" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
CREATE POLICY "platform_execution_tenant_isolation" ON "platform_executions" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE OR REPLACE FUNCTION prevent_submitted_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."submitted_at" IS NOT NULL THEN
    RAISE EXCEPTION 'submitted content revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "submitted_revisions_immutable"
BEFORE UPDATE OR DELETE ON "content_revisions"
FOR EACH ROW EXECUTE FUNCTION prevent_submitted_revision_mutation();

CREATE OR REPLACE FUNCTION prevent_submitted_platform_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "content_revisions" WHERE "id" = OLD."revision_id" AND "submitted_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'platform versions of submitted revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "submitted_platform_versions_immutable"
BEFORE UPDATE OR DELETE ON "platform_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_submitted_platform_version_mutation();

CREATE OR REPLACE FUNCTION prevent_approval_decision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'approval decisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "approval_decisions_append_only"
BEFORE UPDATE OR DELETE ON "approval_decisions"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_decision_mutation();
