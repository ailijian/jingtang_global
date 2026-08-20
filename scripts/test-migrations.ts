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
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','workspaces','memberships','invitations','consent_records','sessions','channels','audit_events');",
  ]);
  if (tableCount.trim() !== "8")
    throw new Error(`Expected 8 D2 tables, found ${tableCount.trim()}`);
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
  if (Number(policyCount.trim()) < 5)
    throw new Error("Expected tenant RLS policies to be installed");
  process.stdout.write(
    "Migration evidence: clean forward deploy, schema status, and RLS policies passed.\n",
  );
} finally {
  await stopDisposablePostgres(database.name);
}
