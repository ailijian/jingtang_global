import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export interface FileSnapshot {
  readonly path: string;
  readonly contents?: Buffer;
}

export function captureFile(path: string): FileSnapshot {
  return existsSync(path) ? { path, contents: readFileSync(path) } : { path };
}

export function restoreFile(snapshot: FileSnapshot): void {
  if (snapshot.contents) {
    writeFileSync(snapshot.path, snapshot.contents);
  } else {
    rmSync(snapshot.path, { force: true });
  }
}
