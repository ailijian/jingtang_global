/* global process */

import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

import { loadRuntimeSecretFiles } from "@jingtang/integrations";

if (process.env.APP_ENV !== "review") {
  throw new Error("review_migration_profile_required");
}
loadRuntimeSecretFiles(process.env, "platform");
if (!process.env.DATABASE_URL) throw new Error("review_migration_database_url_required");
process.env.DATABASE_ADMIN_URL = process.env.DATABASE_URL;

const prismaCli = fileURLToPath(
  new URL("../../../packages/db/node_modules/prisma/build/index.js", import.meta.url),
);
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: "/app/packages/db",
  env: process.env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
