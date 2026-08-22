CREATE TYPE "workspace_lifecycle_state" AS ENUM ('active', 'deletion_pending', 'deleted');
CREATE TYPE "data_deletion_state" AS ENUM ('pending', 'processing', 'completed', 'failed');

ALTER TABLE "workspaces"
  ADD COLUMN "lifecycle_state" "workspace_lifecycle_state" NOT NULL DEFAULT 'active',
  ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "channels"
  ADD COLUMN "authorized_data_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "disconnect_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "disconnected_at" TIMESTAMPTZ(3),
  ADD COLUMN "revoke_failure_category" VARCHAR(80),
  ADD COLUMN "revoke_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "operation_lease_id" UUID,
  ADD COLUMN "operation_lease_until" TIMESTAMPTZ(3);

UPDATE "channels"
SET "authorized_data_expires_at" = COALESCE("refreshed_at", "authorized_at", "updated_at") + INTERVAL '30 days'
WHERE "state" = 'connected'::"channel_state";

CREATE TABLE "data_deletion_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "scope" VARCHAR(40) NOT NULL DEFAULT 'workspace_data',
  "state" "data_deletion_state" NOT NULL DEFAULT 'pending',
  "request_reference" VARCHAR(32) NOT NULL,
  "data_classes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "failure_category" VARCHAR(80),
  "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_deletion_requests_request_reference_key" ON "data_deletion_requests"("request_reference");
CREATE INDEX "data_deletion_requests_workspace_id_state_requested_at_idx" ON "data_deletion_requests"("workspace_id", "state", "requested_at" DESC);
CREATE INDEX "data_deletion_requests_state_requested_at_idx" ON "data_deletion_requests"("state", "requested_at");

ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "data_deletion_requests" TO jingtang_app;

ALTER TABLE "data_deletion_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_deletion_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "data_deletion_request_tenant_isolation" ON "data_deletion_requests"
  USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND current_setting('app.audit_maintenance', true) = 'pseudonymize'
    AND NEW."id" = OLD."id"
    AND NEW."occurred_at" = OLD."occurred_at"
    AND NEW."workspace_id" = OLD."workspace_id"
    AND NEW."actor_type" = OLD."actor_type"
    AND NEW."action" = OLD."action"
    AND NEW."target_type" = OLD."target_type"
    AND NEW."target_id" = OLD."target_id"
    AND NEW."result" = OLD."result"
    AND NEW."correlation_id" = OLD."correlation_id"
    AND (NEW."actor_user_id" IS NOT DISTINCT FROM OLD."actor_user_id" OR NEW."actor_user_id" IS NULL)
    AND NEW."metadata" = '{}'::JSONB
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pseudonymize_workspace_audit(
  target_workspace_id UUID,
  target_ids TEXT[],
  remove_actor BOOLEAN
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
  PERFORM set_config('app.audit_maintenance', 'pseudonymize', true);
  UPDATE public.audit_events
  SET
    actor_user_id = CASE WHEN remove_actor THEN NULL ELSE actor_user_id END,
    metadata = '{}'::JSONB
  WHERE workspace_id = target_workspace_id
    AND (target_ids IS NULL OR target_id = ANY(target_ids));
END;
$$;

REVOKE ALL ON FUNCTION pseudonymize_workspace_audit(UUID, TEXT[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pseudonymize_workspace_audit(UUID, TEXT[], BOOLEAN) TO jingtang_app;

ALTER TABLE "audit_events" DISABLE TRIGGER "audit_events_append_only";
UPDATE "audit_events"
SET "metadata" = '{}'::JSONB
WHERE "action" IN ('channel.connected', 'platform.uploaded');
ALTER TABLE "audit_events" ENABLE TRIGGER "audit_events_append_only";
