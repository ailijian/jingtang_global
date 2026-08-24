/* global process */

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import { loadRuntimeSecretBundle, loadRuntimeSecretFiles } from "@jingtang/integrations";

loadRuntimeSecretFiles(process.env, "platform");
await loadRuntimeSecretBundle(process.env, "platform");

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const require = createRequire(import.meta.url);
process.argv = [process.execPath, "next", "start", "--port", "3100"];
await import(pathToFileURL(require.resolve("next/dist/bin/next")).href);
