import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  deployMigrations,
  startDisposablePostgres,
  stopDisposablePostgres,
} from "./lib/disposable-postgres.js";

const execFileAsync = promisify(execFile);
const database = await startDisposablePostgres();
const workspaceId = "00000000-0000-4000-8000-0000000000d6";
const requestId = "00000000-0000-4000-8000-0000000000d7";
const channelId = "00000000-0000-4000-8000-0000000000d8";
const userId = "00000000-0000-4000-8000-0000000000d5";

async function docker(...args: string[]) {
  return execFileAsync("docker", ["exec", database.name, ...args]);
}

try {
  deployMigrations(database);
  const fixtureSql = `
    INSERT INTO users (id, cognito_subject, email, name)
      VALUES ('${userId}', 'restore-fixture', 'restore@example.test', 'Restore fixture');
    INSERT INTO workspaces (id, name, created_by_user_id, lifecycle_state, deleted_at)
      VALUES ('${workspaceId}', 'Restore deletion fixture', '${userId}', 'deleted', now());
    INSERT INTO data_deletion_requests
      (id, workspace_id, requested_by_user_id, state, request_reference, completed_at)
      VALUES ('${requestId}', '${workspaceId}', NULL, 'completed', 'DEL-RESTORE-D6', now());
    INSERT INTO channels (id, workspace_id, platform, state, external_account_id)
      VALUES ('${channelId}', '${workspaceId}', 'youtube', 'disconnected', 'STALE-RESTORED-ID');
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
    fixtureSql,
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
  const replaySql = `
    DELETE FROM channels
      WHERE workspace_id IN (
        SELECT workspace_id FROM data_deletion_requests WHERE state = 'completed'
      );
    SELECT
      (SELECT count(*) FROM data_deletion_requests WHERE request_reference = 'DEL-RESTORE-D6'),
      (SELECT count(*) FROM channels WHERE workspace_id = '${workspaceId}'),
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
      (SELECT count(*) FROM pg_proc WHERE proname = 'pseudonymize_workspace_audit'),
      (SELECT count(*) FROM pg_trigger WHERE tgname = 'audit_events_append_only' AND tgenabled <> 'D');
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
  const [ledgerCount, staleChannelCount, policyCount, scrubFunctionCount, auditTriggerCount] =
    evidence.split("|").map(Number);
  if (
    ledgerCount !== 1 ||
    staleChannelCount !== 0 ||
    policyCount < 12 ||
    scrubFunctionCount !== 1 ||
    auditTriggerCount !== 1
  ) {
    throw new Error(`Restore drill verification failed: ${evidence}`);
  }
  process.stdout.write(
    "Backup/restore evidence: custom-format backup restored in isolation; deletion ledger replay removed stale data; RLS, audit guard, and pseudonymization function survived.\n",
  );
} finally {
  await stopDisposablePostgres(database.name);
}
