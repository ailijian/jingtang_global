import {
  deployMigrations,
  migrationEnvironment,
  runChecked,
  spawnInherited,
  startDisposablePostgres,
  stopDisposablePostgres,
} from "./lib/disposable-postgres.js";

const database = await startDisposablePostgres();
deployMigrations(database);
runChecked("pnpm", ["build:packages"]);

const environment: NodeJS.ProcessEnv = {
  ...migrationEnvironment(database),
  NODE_ENV: "development",
  APP_ENV: "test",
  APP_BASE_URL: "http://127.0.0.1:3100",
  IDENTITY_PROVIDER: "mock",
  ALLOW_TEST_IDENTITY: "true",
  SESSION_COOKIE_SECRET: "e2e-session-cookie-secret-at-least-32-bytes",
  TERMS_VERSION: "d2-test-terms-v1",
  PRIVACY_VERSION: "d2-test-privacy-v1",
  DATA_PURPOSE_VERSION: "d2-test-purpose-v1",
  TERMS_URL: "https://example.invalid/terms",
  PRIVACY_URL: "https://example.invalid/privacy",
};

const child = spawnInherited(
  "pnpm",
  ["--filter", "@jingtang/platform", "dev", "--hostname", "127.0.0.1"],
  environment,
);
let stopping = false;
async function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  await stopDisposablePostgres(database.name);
  process.exit(0);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
child.on("exit", (code) => {
  void stopDisposablePostgres(database.name).finally(() => process.exit(code ?? 1));
});
