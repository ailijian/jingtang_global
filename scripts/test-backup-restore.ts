import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { installDisposableContainerSignalHandlers } from "./lib/disposable-containers.js";
import {
  deployMigrations,
  startDisposablePostgres,
  stopDisposablePostgres,
} from "./lib/disposable-postgres.js";

const execFileAsync = promisify(execFile);
installDisposableContainerSignalHandlers();
const database = await startDisposablePostgres();
const workspaceId = "00000000-0000-4000-8000-0000000000d6";
const requestId = "00000000-0000-4000-8000-0000000000d7";
const channelId = "00000000-0000-4000-8000-0000000000d8";
const userId = "00000000-0000-4000-8000-0000000000d5";
const contentId = "00000000-0000-4000-8000-0000000000d9";
const assetId = "00000000-0000-4000-8000-0000000000da";
const revisionId = "00000000-0000-4000-8000-0000000000db";
const versionId = "00000000-0000-4000-8000-0000000000dc";
const intentId = "00000000-0000-4000-8000-0000000000dd";
const executionId = "00000000-0000-4000-8000-0000000000de";
const operationId = "00000000-0000-4000-8000-0000000000df";
const deletionLedgerPath = "/tmp/d6-deletion-ledger.sql";

async function docker(...args: string[]) {
  return execFileAsync("docker", ["exec", database.name, ...args]);
}

function extractInsertStatements(dump: string): string {
  const statements = dump.split("\n").filter((line) => line.startsWith("INSERT INTO public."));
  if (statements.length !== 1) {
    throw new Error(`Expected one protected-ledger INSERT, found ${statements.length}`);
  }
  return statements[0];
}

try {
  deployMigrations(database);

  // T0 is the selected recovery point: the Workspace and all mutable data are live,
  // and no deletion ledger exists yet.
  const recoveryPointFixtureSql = `
    INSERT INTO users (id, cognito_subject, email, name)
      VALUES ('${userId}', 'restore-fixture', 'restore@example.test', 'Restore fixture');
    INSERT INTO workspaces (id, name, created_by_user_id, lifecycle_state)
      VALUES ('${workspaceId}', 'Restore deletion fixture', '${userId}', 'active');
    UPDATE users SET last_workspace_id = '${workspaceId}' WHERE id = '${userId}';
    INSERT INTO channels (id, workspace_id, platform, state, external_account_id)
      VALUES ('${channelId}', '${workspaceId}', 'youtube', 'disconnected', 'STALE-RESTORED-ID');
    INSERT INTO memberships (workspace_id, user_id, role, status)
      VALUES ('${workspaceId}', '${userId}', 'owner_admin', 'active');
    INSERT INTO sessions (user_id, token_hash, current_workspace_id, expires_at)
      VALUES ('${userId}', repeat('d', 64), '${workspaceId}', now() + interval '1 day');
    INSERT INTO audit_events
      (occurred_at, workspace_id, actor_user_id, actor_type, action, target_type, target_id,
       result, correlation_id, metadata)
      VALUES (
        now(), '${workspaceId}', '${userId}', 'user', 'identity.login', 'session',
        'restore-session', 'success', gen_random_uuid(), '{"email":"restore@example.test"}'::jsonb
      );
    INSERT INTO invitations
      (workspace_id, email, token_hash, role, status, invited_by_user_id, expires_at)
      VALUES (
        '${workspaceId}', 'stale@example.test', repeat('a', 64), 'viewer', 'pending',
        '${userId}', now() + interval '1 day'
      );
    INSERT INTO contents (id, workspace_id, internal_title, status, created_by_user_id)
      VALUES ('${contentId}', '${workspaceId}', 'Stale restored content', 'draft', '${userId}');
    INSERT INTO source_assets
      (id, workspace_id, content_id, object_key, original_filename, media_type, byte_size,
       sha256, status, ownership_confirmed, uploaded_by_user_id)
      VALUES (
        '${assetId}', '${workspaceId}', '${contentId}', 'restore/stale.mp4', 'stale.mp4',
        'video/mp4', 1, repeat('b', 64), 'complete', true, '${userId}'
      );
    INSERT INTO content_revisions
      (id, workspace_id, content_id, revision_number, source_asset_id, created_by_user_id, submitted_at)
      VALUES ('${revisionId}', '${workspaceId}', '${contentId}', 1, '${assetId}', '${userId}', now());
    INSERT INTO platform_versions
      (id, workspace_id, revision_id, platform, account_reference, account_display_name,
       title, description, privacy_status, made_for_kids, validation_status)
      VALUES (
        '${versionId}', '${workspaceId}', '${revisionId}', 'youtube', 'STALE-RESTORED-ID',
        'Stale channel', 'Stale video', '', 'private', false, 'valid'
      );
    INSERT INTO approval_decisions
      (workspace_id, content_id, revision_id, actor_user_id, result, reason)
      VALUES ('${workspaceId}', '${contentId}', '${revisionId}', '${userId}', 'approved', 'Restore fixture approval');
    INSERT INTO publishing_intents
      (id, workspace_id, content_id, revision_id, platform_version_ids, account_references,
       payload_snapshot, permission_decision, state, mode, confirmed_by_user_id,
       consent_version, payload_hash, idempotency_key, confirmed_at)
      VALUES (
        '${intentId}', '${workspaceId}', '${contentId}', '${revisionId}',
        ARRAY['${versionId}'::uuid], ARRAY['STALE-RESTORED-ID'], '{}'::jsonb,
        'allowed', 'ready', 'immediate', '${userId}', 'restore-v1', repeat('c', 64),
        'restore-intent', now()
      );
    INSERT INTO platform_executions
      (id, workspace_id, publishing_intent_id, platform_version_id, operation, attempt,
       idempotency_key, state, provider_id, provider_url)
      VALUES (
        '${executionId}', '${workspaceId}', '${intentId}', '${versionId}', 'upload', 1,
        'restore-execution', 'not_started', 'STALE-PROVIDER-ID', 'https://example.test/stale'
      );
    INSERT INTO outbox_messages (workspace_id, platform_execution_id, topic, state)
      VALUES ('${workspaceId}', '${executionId}', 'youtube.publish', 'pending');
  `;
  await docker(
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "-c",
    recoveryPointFixtureSql,
  );
  await docker(
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "--format=custom",
    "--file=/tmp/d6-restore.dump",
  );

  // T1 occurs after the chosen recovery point. This protected ledger must be
  // replayed through "now" before a restored application may read the data.
  const postRecoveryDeletionSql = `
    INSERT INTO lifecycle_operations (
      id, kind, state, workspace_id, actor_user_id, dedupe_key, request_reference,
      correlation_id, requested_at, deadline_at, next_attempt_at, attempt, outcome,
      completed_at, retention_expires_at
    ) VALUES (
      '${operationId}', 'workspace_data_deletion', 'completed', '${workspaceId}', '${userId}',
      'restore-workspace-deletion:${workspaceId}', 'DEL-RESTORE-D6', gen_random_uuid(),
      now(), now() + interval '7 days', now(), 1, '{"completed":true}'::jsonb,
      now(), now() + interval '365 days'
    );
    UPDATE workspaces
      SET lifecycle_state = 'deleted', deletion_requested_at = now(), deleted_at = now()
      WHERE id = '${workspaceId}';
    INSERT INTO data_deletion_requests (
      id, workspace_id, requested_by_user_id, state, request_reference, data_classes,
      pending_object_keys, requested_at, started_at, completed_at, lifecycle_operation_id,
      retention_expires_at
    ) VALUES (
      '${requestId}', '${workspaceId}', NULL, 'completed', 'DEL-RESTORE-D6',
      ARRAY['workspace_database','source_assets','authorized_channel_data'], ARRAY[]::text[],
      now(), now(), now(), '${operationId}', now() + interval '365 days'
    );
  `;
  await docker(
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "-c",
    postRecoveryDeletionSql,
  );
  const lifecycleLedger = await docker(
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "--data-only",
    "--inserts",
    "--table=public.lifecycle_operations",
  );
  const deletionLedger = await docker(
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "jingtang",
    "--data-only",
    "--inserts",
    "--table=public.data_deletion_requests",
  );
  const protectedLedgerSql = `${extractInsertStatements(lifecycleLedger.stdout)}\n${extractInsertStatements(deletionLedger.stdout)}\n`;
  await writeFile(deletionLedgerPath, protectedLedgerSql, { mode: 0o600 });

  await docker("createdb", "-U", "postgres", "jingtang_restore");
  await docker(
    "pg_restore",
    "-U",
    "postgres",
    "-d",
    "jingtang_restore",
    "--no-owner",
    "--exit-on-error",
    "/tmp/d6-restore.dump",
  );

  const { stdout: beforeReplay } = await docker(
    "psql",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "jingtang_restore",
    "-c",
    `SELECT
      (SELECT count(*) FROM contents WHERE workspace_id = '${workspaceId}'),
      (SELECT count(*) FROM data_deletion_requests WHERE workspace_id = '${workspaceId}'),
      (SELECT count(*) FROM workspaces WHERE id = '${workspaceId}' AND lifecycle_state = 'active');`,
  );
  if (beforeReplay.trim() !== "1|0|1") {
    throw new Error(`Recovery point fixture is invalid: ${beforeReplay.trim()}`);
  }

  // Import post-recovery-point deletion evidence before executing any app-role read.
  await docker(
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "jingtang_restore",
    "-c",
    protectedLedgerSql,
  );
  const replaySql = `
    SELECT set_config('app.workspace_id', '${workspaceId}', false);
    DELETE FROM outbox_messages WHERE workspace_id = '${workspaceId}';
    DELETE FROM platform_executions WHERE workspace_id = '${workspaceId}';
    DELETE FROM publishing_intents WHERE workspace_id = '${workspaceId}';
    SELECT restore_delete_workspace_immutable_history('${workspaceId}'::uuid, '${requestId}'::uuid);
    DELETE FROM source_assets WHERE workspace_id = '${workspaceId}';
    DELETE FROM contents WHERE workspace_id = '${workspaceId}';
    DELETE FROM channels WHERE workspace_id = '${workspaceId}';
    DELETE FROM invitations WHERE workspace_id = '${workspaceId}';
    DELETE FROM memberships WHERE workspace_id = '${workspaceId}';
    UPDATE sessions SET current_workspace_id = NULL WHERE current_workspace_id = '${workspaceId}';
    SELECT restore_pseudonymize_workspace_audit('${workspaceId}'::uuid);
    UPDATE workspaces
      SET name = 'Deleted workspace DEL-RESTORE-D6', lifecycle_state = 'deleted',
          deletion_requested_at = COALESCE(deletion_requested_at, now()), deleted_at = now()
      WHERE id = '${workspaceId}';
    SELECT
      (SELECT count(*) FROM data_deletion_requests
        WHERE id = '${requestId}' AND lifecycle_operation_id = '${operationId}' AND state = 'completed'),
      (SELECT count(*) FROM lifecycle_operations
        WHERE id = '${operationId}' AND state = 'completed'),
      (
        (SELECT count(*) FROM outbox_messages WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM platform_executions WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM publishing_intents WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM approval_decisions WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM platform_versions WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM content_revisions WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM source_assets WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM contents WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM channels WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM invitations WHERE workspace_id = '${workspaceId}') +
        (SELECT count(*) FROM memberships WHERE workspace_id = '${workspaceId}')
      ),
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
      (SELECT count(*) FROM pg_proc WHERE proname IN (
        'restore_delete_workspace_immutable_history', 'restore_pseudonymize_workspace_audit'
      )),
      (SELECT count(*) FROM pg_trigger WHERE tgname IN (
        'audit_events_append_only', 'account_audit_events_append_only'
      ) AND tgenabled <> 'D'),
      (SELECT count(*) FROM workspaces WHERE id = '${workspaceId}' AND lifecycle_state = 'deleted'
        AND name = 'Deleted workspace DEL-RESTORE-D6' AND deleted_at IS NOT NULL),
      (SELECT count(*) FROM audit_events WHERE workspace_id = '${workspaceId}'
        AND actor_user_id IS NULL AND metadata = '{}'::jsonb),
      (SELECT count(*) FROM sessions WHERE current_workspace_id = '${workspaceId}');
  `;
  const { stdout } = await docker(
    "psql",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "jingtang_restore",
    "-c",
    replaySql,
  );
  const evidence = stdout.trim().split("\n").at(-1);
  if (!evidence) throw new Error("Restore drill returned no evidence");
  const [
    deletionLedgerCount,
    lifecycleLedgerCount,
    staleDataCount,
    policyCount,
    restoreFunctionCount,
    auditTriggerCount,
    deletedWorkspaceCount,
    pseudonymizedAuditCount,
    selectedSessionCount,
  ] = evidence.split("|").map(Number);
  if (
    deletionLedgerCount !== 1 ||
    lifecycleLedgerCount !== 1 ||
    staleDataCount !== 0 ||
    policyCount < 12 ||
    restoreFunctionCount !== 2 ||
    auditTriggerCount !== 2 ||
    deletedWorkspaceCount !== 1 ||
    pseudonymizedAuditCount < 1 ||
    selectedSessionCount !== 0
  ) {
    throw new Error(`Restore drill verification failed: ${evidence}`);
  }
  process.stdout.write(
    "Backup/restore evidence: a T0 backup containing live data was restored in isolation; the protected T1 deletion and lifecycle ledgers were replayed before app access; all Workspace business data was removed, audit evidence was pseudonymized, session selection was cleared, and RLS plus append-only guards survived.\n",
  );
} finally {
  await stopDisposablePostgres(database.name);
}
