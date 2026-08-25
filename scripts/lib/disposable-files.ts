import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tokenVaultDirectoryPattern = /^jingtang-e2e-token-vault-(\d+)-[A-Za-z0-9]+$/;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function cleanupOrphanedE2ETokenVaultDirectories(input?: {
  readonly root?: string;
  readonly processIsAlive?: (pid: number) => boolean;
}): readonly string[] {
  const root = resolve(input?.root ?? tmpdir());
  const processIsAlive = input?.processIsAlive ?? isProcessAlive;
  const removed: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = tokenVaultDirectoryPattern.exec(entry.name);
    if (!match) continue;
    const ownerPid = Number(match[1]);
    if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0 || processIsAlive(ownerPid)) continue;

    const directory = join(root, entry.name);
    rmSync(directory, { recursive: true, force: true });
    removed.push(directory);
  }

  return removed;
}

export function createE2ETokenVaultDirectory(root = tmpdir()): string {
  return mkdtempSync(join(resolve(root), `jingtang-e2e-token-vault-${String(process.pid)}-`));
}
