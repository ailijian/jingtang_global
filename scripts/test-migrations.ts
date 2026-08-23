import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  deployMigrations,
  migrationEnvironment,
  runChecked,
  startDisposablePostgres,
  stopDisposablePostgres,
} from "./lib/disposable-postgres.js";

const execFileAsync = promisify(execFile);
const migrationRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/db/prisma/migrations",
);
const trustLifecycleMigration = "20260822000100_d6_trust_lifecycle";
const trustLifecycleChecksum = "34798a7e8ada82e8bc3ed1edb54a072cfe3db8bd620d31efd93afc5ae612fed0";

function executeSql(containerName: string, sql: string): void {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "jingtang",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed with exit code ${String(result.status)}`);
  }
}

async function queryScalar(containerName: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "exec",
    containerName,
    "psql",
    "-At",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "-c",
    sql,
  ]);
  return stdout.trim();
}

function assertCommittedMigrationIsImmutable(): void {
  const sql = readFileSync(join(migrationRoot, trustLifecycleMigration, "migration.sql"));
  const checksum = createHash("sha256").update(sql).digest("hex");
  if (checksum !== trustLifecycleChecksum) {
    throw new Error(
      `${trustLifecycleMigration} is committed history and must not be edited; add a forward migration instead`,
    );
  }
}
const database = await startDisposablePostgres();
try {
  deployMigrations(database);
  runChecked(
    "pnpm",
    ["--filter", "@jingtang/db", "exec", "prisma", "migrate", "status"],
    migrationEnvironment(database),
  );
  const { stdout: tableCount } = await execFileAsync("docker", [
    "exec",
    database.name,
    "psql",
    "-At",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "-c",
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','workspaces','memberships','invitations','consent_records','sessions','channels','source_assets','contents','content_revisions','platform_versions','approval_decisions','publishing_intents','platform_executions','outbox_messages','audit_events','data_deletion_requests','lifecycle_operations','lifecycle_steps','account_audit_events');",
  ]);
  if (tableCount.trim() !== "20")
    throw new Error(`Expected 20 D2-D6 tables, found ${tableCount.trim()}`);
  const { stdout: legacyAuditTableCount } = await execFileAsync("docker", [
    "exec",
    database.name,
    "psql",
    "-At",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "-c",
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='pending_identity_audit_events';",
  ]);
  if (legacyAuditTableCount.trim() !== "0") {
    throw new Error("Legacy tenant-assignment identity audit table still exists");
  }
  const { stdout: policyCount } = await execFileAsync("docker", [
    "exec",
    database.name,
    "psql",
    "-At",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "-c",
    "SELECT count(*) FROM pg_policies WHERE schemaname='public';",
  ]);
  if (Number(policyCount.trim()) < 12)
    throw new Error("Expected tenant RLS policies to be installed");
  const { stdout: roleAndControlCount } = await execFileAsync("docker", [
    "exec",
    database.name,
    "psql",
    "-At",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "-c",
    "SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('jingtang_app','jingtang_worker')) || '|' || (SELECT count(*) FROM pg_proc WHERE proname IN ('claim_lifecycle_operation','renew_lifecycle_operation_claim','record_lifecycle_step','finish_lifecycle_operation','enqueue_due_lifecycle_operations','purge_expired_lifecycle_records'));",
  ]);
  if (roleAndControlCount.trim() !== "2|6") {
    throw new Error(
      `Expected D6 runtime roles and control functions, found ${roleAndControlCount.trim()}`,
    );
  }
  process.stdout.write(
    "Migration evidence: clean forward deploy, complete D2-D6 schema, app/worker roles, lifecycle control functions, schema status, and RLS policies passed.\n",
  );
} finally {
  await stopDisposablePostgres(database.name);
}

assertCommittedMigrationIsImmutable();

const upgradeDatabase = await startDisposablePostgres();
try {
  const migrationNames = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const d5Checkpoint = "20260821000400_d5_publish_outbox";
  for (const migrationName of migrationNames) {
    executeSql(
      upgradeDatabase.name,
      readFileSync(join(migrationRoot, migrationName, "migration.sql"), "utf8"),
    );
    if (migrationName === d5Checkpoint) {
      executeSql(
        upgradeDatabase.name,
        `
          INSERT INTO public.users (id, cognito_subject, email, name)
          VALUES ('10000000-0000-4000-8000-000000000001', 'migration-upgrade-user', 'upgrade@example.test', 'Upgrade User');
          INSERT INTO public.workspaces (id, name, created_by_user_id)
          VALUES ('20000000-0000-4000-8000-000000000001', 'Migration Upgrade Workspace', '10000000-0000-4000-8000-000000000001');
          UPDATE public.users
          SET last_workspace_id = '20000000-0000-4000-8000-000000000001'
          WHERE id = '10000000-0000-4000-8000-000000000001';
          INSERT INTO public.memberships (workspace_id, user_id, role, status)
          VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner_admin', 'active');
          INSERT INTO public.consent_records (
            id, user_id, terms_version, privacy_version, data_purpose_version,
            displayed_locale, acceptance_method
          ) VALUES (
            '40000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'terms-v1', 'privacy-v1', 'youtube-v1', 'en', 'explicit_checkbox'
          );
          INSERT INTO public.channels (
            id, workspace_id, platform, external_account_id, display_name, state,
            granted_scopes, consent_record_id, token_ciphertext_reference,
            token_envelope_ciphertext, authorized_at, refreshed_at
          ) VALUES (
            '50000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            'youtube', 'UC_D5_UPGRADE', 'D5 Upgrade Channel', 'connected',
            ARRAY['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
            '40000000-0000-4000-8000-000000000001', NULL,
            'local:v1:representative-d5-envelope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          );
          INSERT INTO public.audit_events (
            occurred_at, workspace_id, actor_user_id, actor_type, action,
            target_type, target_id, result, correlation_id, metadata
          ) VALUES (
            CURRENT_TIMESTAMP,
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'user', 'channel.connected', 'channel', 'upgrade-channel', 'success',
            '30000000-0000-4000-8000-000000000001',
            '{"token_reference":"must-be-removed-by-d6"}'::jsonb
          );
        `,
      );
    }
  }
  const preservedData = await queryScalar(
    upgradeDatabase.name,
    `
      SELECT
        (SELECT count(*) FROM public.users WHERE cognito_subject = 'migration-upgrade-user') || '|' ||
        (SELECT count(*) FROM public.workspaces WHERE id = '20000000-0000-4000-8000-000000000001') || '|' ||
        (SELECT count(*) FROM public.memberships WHERE workspace_id = '20000000-0000-4000-8000-000000000001') || '|' ||
        (SELECT count(*) FROM public.channels WHERE id = '50000000-0000-4000-8000-000000000001' AND state = 'reauthorization_required'::channel_state AND external_account_id IS NULL AND token_ciphertext_reference IS NULL AND token_envelope_ciphertext IS NULL) || '|' ||
        (SELECT count(*) FROM public.audit_events WHERE correlation_id = '30000000-0000-4000-8000-000000000001' AND metadata = '{}'::jsonb) || '|' ||
        (CASE WHEN to_regprocedure('public.pseudonymize_workspace_audit(uuid)') IS NOT NULL THEN 1 ELSE 0 END) || '|' ||
        (CASE WHEN to_regprocedure('public.pseudonymize_workspace_audit(uuid,text[],boolean)') IS NULL THEN 1 ELSE 0 END) || '|' ||
        (CASE WHEN NOT has_function_privilege('jingtang_app', 'public.pseudonymize_workspace_audit(uuid)', 'EXECUTE') THEN 1 ELSE 0 END) || '|' ||
        (CASE WHEN has_function_privilege('jingtang_worker', 'public.pseudonymize_workspace_audit(uuid)', 'EXECUTE') THEN 1 ELSE 0 END);
    `,
  );
  if (preservedData !== "1|1|1|1|1|1|1|1|1") {
    throw new Error(
      `D5 checkpoint upgrade did not preserve product data and retire legacy authorization: ${preservedData}`,
    );
  }
  process.stdout.write(
    "Migration evidence: immutable committed migration and representative D5 checkpoint forward upgrade passed.\n",
  );
} finally {
  await stopDisposablePostgres(upgradeDatabase.name);
}
