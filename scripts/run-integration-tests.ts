import { globSync } from "glob";

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

const testFiles = globSync("tests/integration/**/*.test.ts").sort();
if (testFiles.length === 0) throw new Error("No integration test files were found");

for (const testFile of testFiles) {
  const database = await startDisposablePostgres();
  const storage = await startDisposableObjectStorage();
  try {
    deployMigrations(database);
    runChecked(
      "pnpm",
      ["vitest", "run", "--config", "tests/vitest.integration.config.ts", testFile],
      {
        ...migrationEnvironment(database),
        ...objectStorageEnvironment(storage),
      },
    );
  } finally {
    await Promise.all([
      stopDisposablePostgres(database.name),
      stopDisposableObjectStorage(storage.name),
    ]);
  }
}
