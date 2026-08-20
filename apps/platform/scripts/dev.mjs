import process, { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const environmentPath = path.resolve(scriptDirectory, "../../../.env");

try {
  loadEnvFile(environmentPath);
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("ENOENT")) throw error;
}

const nextBinary = path.resolve(scriptDirectory, "../node_modules/next/dist/bin/next");
process.argv = [process.execPath, nextBinary, "dev", "--port", "3100", ...process.argv.slice(2)];
await import(pathToFileURL(nextBinary).href);
