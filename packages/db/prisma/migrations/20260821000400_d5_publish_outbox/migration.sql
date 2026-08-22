CREATE TYPE "outbox_state" AS ENUM ('pending', 'claimed', 'completed', 'dead');

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "platform_execution_id" UUID NOT NULL,
  "topic" VARCHAR(120) NOT NULL,
  "state" "outbox_state" NOT NULL DEFAULT 'pending',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "failure_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_messages_nonnegative_attempt" CHECK ("attempt" >= 0)
);

CREATE UNIQUE INDEX "outbox_messages_platform_execution_id_key" ON "outbox_messages"("platform_execution_id");
CREATE INDEX "outbox_messages_state_available_at_created_at_idx" ON "outbox_messages"("state", "available_at", "created_at");
CREATE INDEX "outbox_messages_workspace_id_state_idx" ON "outbox_messages"("workspace_id", "state");

ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_platform_execution_id_fkey" FOREIGN KEY ("platform_execution_id") REFERENCES "platform_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "outbox_messages" TO jingtang_app;

ALTER TABLE "outbox_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "outbox_message_tenant_isolation" ON "outbox_messages" USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID) WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID);
