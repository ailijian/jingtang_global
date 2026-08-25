import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { cleanupOrphanedDisposableContainers } from "./lib/disposable-containers.js";
import { cleanupOrphanedE2ETokenVaultDirectories } from "./lib/disposable-files.js";
import { captureFile, restoreFile } from "./lib/file-snapshot.js";

cleanupOrphanedDisposableContainers();
cleanupOrphanedE2ETokenVaultDirectories();
const nextEnvironmentSnapshot = captureFile(resolve("apps/platform/next-env.d.ts"));

const playwright = spawn(
  "pnpm",
  ["exec", "playwright", "test", "--config", "playwright.config.ts"],
  { env: process.env, stdio: "inherit" },
);

for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => playwright.kill(signal));
}

const [code] = (await once(playwright, "exit")) as [number | null, NodeJS.Signals | null];
let exitCode = code ?? 1;
try {
  cleanupOrphanedDisposableContainers();
  cleanupOrphanedE2ETokenVaultDirectories();
} catch (error) {
  console.error("Could not clean disposable E2E resources", error);
  if (exitCode === 0) exitCode = 1;
} finally {
  try {
    restoreFile(nextEnvironmentSnapshot);
  } catch (error) {
    console.error("Could not restore apps/platform/next-env.d.ts", error);
    if (exitCode === 0) exitCode = 1;
  }
}
process.exitCode = exitCode;
