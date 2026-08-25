import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { captureFile, restoreFile } from "./file-snapshot.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("file snapshots", () => {
  it("restores the exact original contents", () => {
    const root = mkdtempSync(join(tmpdir(), "jingtang-file-snapshot-test-"));
    roots.push(root);
    const path = join(root, "next-env.d.ts");
    writeFileSync(path, "original\n");
    const snapshot = captureFile(path);
    writeFileSync(path, "generated\n");

    restoreFile(snapshot);

    expect(readFileSync(path, "utf8")).toBe("original\n");
  });

  it("removes a file that did not exist before the operation", () => {
    const root = mkdtempSync(join(tmpdir(), "jingtang-file-snapshot-test-"));
    roots.push(root);
    const path = join(root, "generated.d.ts");
    const snapshot = captureFile(path);
    writeFileSync(path, "generated\n");

    restoreFile(snapshot);

    expect(existsSync(path)).toBe(false);
  });
});
