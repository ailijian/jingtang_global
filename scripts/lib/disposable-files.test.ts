import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupOrphanedE2ETokenVaultDirectories,
  createE2ETokenVaultDirectory,
} from "./disposable-files.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("disposable E2E token vault directories", () => {
  it("removes only directories whose encoded owner process is dead", () => {
    const root = mkdtempSync(join(tmpdir(), "jingtang-disposable-files-test-"));
    roots.push(root);
    const orphan = join(root, "jingtang-e2e-token-vault-900001-orphan");
    const active = join(root, "jingtang-e2e-token-vault-900002-active");
    const unrelated = join(root, "unrelated-directory");
    mkdirSync(orphan);
    mkdirSync(active);
    mkdirSync(unrelated);

    const removed = cleanupOrphanedE2ETokenVaultDirectories({
      root,
      processIsAlive: (pid) => pid === 900002,
    });

    expect(removed).toEqual([orphan]);
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(active)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
  });

  it("creates a directory whose name carries its owner pid", () => {
    const root = mkdtempSync(join(tmpdir(), "jingtang-disposable-files-test-"));
    roots.push(root);

    const directory = createE2ETokenVaultDirectory(root);

    expect(directory).toMatch(
      new RegExp(`jingtang-e2e-token-vault-${String(process.pid)}-[A-Za-z0-9]+$`),
    );
  });
});
