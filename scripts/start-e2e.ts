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
const platformPort = process.env.E2E_PORT ?? "3100";

const environment: NodeJS.ProcessEnv = {
  ...migrationEnvironment(database),
  ...objectStorageEnvironment(storage),
  NODE_ENV: "development",
  APP_ENV: "test",
  APP_BASE_URL: `http://127.0.0.1:${platformPort}`,
  NEXT_DIST_DIR: ".next-e2e",
  IDENTITY_PROVIDER: "mock",
  ALLOW_TEST_IDENTITY: "true",
  SESSION_COOKIE_SECRET: "e2e-session-cookie-secret-at-least-32-bytes",
  TERMS_VERSION: "2026-08-21",
  PRIVACY_VERSION: "2026-08-21",
  DATA_PURPOSE_VERSION: "2026-08-21",
  TERMS_URL: "https://jingtangai.com/en/terms/",
  PRIVACY_URL: "https://jingtangai.com/en/privacy/",
};

const child = spawnInherited(
  "pnpm",
  ["--filter", "@jingtang/platform", "dev", "--hostname", "127.0.0.1", "--port", platformPort],
  environment,
);
let stopping = false;
async function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  await Promise.all([
    stopDisposablePostgres(database.name),
    stopDisposableObjectStorage(storage.name),
  ]);
  process.exit(0);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
child.on("exit", (code) => {
  void Promise.all([
    stopDisposablePostgres(database.name),
    stopDisposableObjectStorage(storage.name),
  ]).finally(() => process.exit(code ?? 1));
});
