/* global process */

import { spawnSync } from "node:child_process";

import { loadRuntimeSecretFiles } from "@jingtang/integrations";

if (process.env.APP_ENV !== "review") {
  throw new Error("review_migration_profile_required");
}
loadRuntimeSecretFiles(process.env, "platform");
if (!process.env.DATABASE_URL) throw new Error("review_migration_database_url_required");
process.env.DATABASE_ADMIN_URL = process.env.DATABASE_URL;

const result = spawnSync("pnpm", ["--filter", "@jingtang/db", "db:migrate"], {
  cwd: "/app",
  env: process.env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
