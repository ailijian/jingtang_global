import {
  deployMigrations,
  migrationEnvironment,
  runChecked,
  startDisposablePostgres,
  stopDisposablePostgres,
} from "./lib/disposable-postgres.js";

const database = await startDisposablePostgres();
try {
  deployMigrations(database);
  runChecked(
    "pnpm",
    ["vitest", "run", "--config", "tests/vitest.integration.config.ts"],
    migrationEnvironment(database),
  );
} finally {
  await stopDisposablePostgres(database.name);
}
