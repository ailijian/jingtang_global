import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  deployMigrations,
  migrationEnvironment,
  runChecked,
  spawnInherited,
  startDisposablePostgres,
  stopDisposablePostgres,
} from "./lib/disposable-postgres.js";
import {
  objectStorageEnvironment,
  startDisposableObjectStorage,
  stopDisposableObjectStorage,
} from "./lib/disposable-object-storage.js";

const database = await startDisposablePostgres();
const storage = await startDisposableObjectStorage();
deployMigrations(database);
runChecked("pnpm", ["build:packages"]);
runChecked("pnpm", ["--filter", "@jingtang/worker", "build"]);
const platformPort = process.env.E2E_PORT ?? "3100";
const tokenKeyStoreDirectory = mkdtempSync(join(tmpdir(), "jingtang-e2e-token-vault-"));

const environment: NodeJS.ProcessEnv = {
  ...migrationEnvironment(database),
  ...objectStorageEnvironment(storage),
  NODE_ENV: "development",
  APP_ENV: "test",
  APP_BASE_URL: `http://127.0.0.1:${platformPort}`,
  NEXT_DIST_DIR: ".next-e2e",
  IDENTITY_PROVIDER: "mock",
  ALLOW_TEST_IDENTITY: "true",
  // The app and worker share an isolated local envelope-key store. Provider
  // calls are replaced by a deterministic timeout and never reach Google.
  YOUTUBE_OAUTH_ENABLED: "true",
  YOUTUBE_OAUTH_CLIENT_ID: "e2e-client-id",
  YOUTUBE_OAUTH_CLIENT_SECRET: "e2e-client-secret",
  YOUTUBE_OAUTH_STATE_SECRET: "e2e-state-secret-at-least-32-bytes-distinct",
  YOUTUBE_TEST_FAULT: "timeout",
  OAUTH_TOKEN_VAULT_PROVIDER: "local",
  OAUTH_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  LOCAL_TOKEN_KEY_STORE_PATH: join(tokenKeyStoreDirectory, "keys.json"),
  SESSION_COOKIE_SECRET: "e2e-session-cookie-secret-at-least-32-bytes",
  TERMS_VERSION: "2026-08-22",
  PRIVACY_VERSION: "2026-08-22",
  DATA_PURPOSE_VERSION: "2026-08-22",
  TERMS_URL: "https://jingtangai.com/en/terms/",
  PRIVACY_URL: "https://jingtangai.com/en/privacy/",
};

const platform = spawnInherited(
  "pnpm",
  ["--filter", "@jingtang/platform", "dev", "--hostname", "127.0.0.1", "--port", platformPort],
  environment,
);
const worker = spawnInherited("node", ["apps/worker/dist/index.js"], environment);
let stopping = false;
async function stop(signal: NodeJS.Signals, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  platform.kill(signal);
  worker.kill(signal);
  await Promise.all([
    stopDisposablePostgres(database.name),
    stopDisposableObjectStorage(storage.name),
    rm(tokenKeyStoreDirectory, { recursive: true, force: true }),
  ]);
  process.exit(exitCode);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
for (const child of [platform, worker]) {
  child.on("exit", (code) => {
    if (!stopping) void stop("SIGTERM", code ?? 1);
  });
}
