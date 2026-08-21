import {
  deployMigrations,
  migrationEnvironment,
  runChecked,
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
try {
  deployMigrations(database);
  runChecked("pnpm", ["vitest", "run", "--config", "tests/vitest.integration.config.ts"], {
    ...migrationEnvironment(database),
    ...objectStorageEnvironment(storage),
  });
} finally {
  await Promise.all([
    stopDisposablePostgres(database.name),
    stopDisposableObjectStorage(storage.name),
  ]);
}
