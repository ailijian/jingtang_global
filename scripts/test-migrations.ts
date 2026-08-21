import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  deployMigrations,
  migrationEnvironment,
  runChecked,
  startDisposablePostgres,
  stopDisposablePostgres,
} from "./lib/disposable-postgres.js";

const execFileAsync = promisify(execFile);
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
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','workspaces','memberships','invitations','consent_records','sessions','channels','audit_events','source_assets','contents','content_revisions','platform_versions','approval_decisions','publishing_intents','platform_executions');",
  ]);
  if (tableCount.trim() !== "15")
    throw new Error(`Expected 15 D2-D4 tables, found ${tableCount.trim()}`);
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
  process.stdout.write(
    "Migration evidence: clean forward deploy, schema status, and RLS policies passed.\n",
  );
} finally {
  await stopDisposablePostgres(database.name);
}
