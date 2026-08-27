import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFakeCommands(root: string): { readonly bin: string; readonly dockerLog: string } {
  const bin = join(root, "bin");
  const dockerLog = join(root, "docker.log");
  mkdirSync(bin);
  const git = join(bin, "git");
  writeFileSync(
    git,
    `#!/bin/sh
if [ "$1" = "rev-parse" ] && [ "$2" = "HEAD" ]; then
  printf '%s\\n' "$FAKE_RELEASE_ID"
  exit 0
fi
if [ "$1" = "status" ]; then
  exit 0
fi
exit 1
`,
    { mode: 0o755 },
  );
  chmodSync(git, 0o755);

  const docker = join(bin, "docker");
  writeFileSync(
    docker,
    `#!/bin/sh
if [ "$1" = "build" ] && [ "\${FAKE_FAIL_MIGRATION:-}" = "1" ]; then
  case " $* " in *" --target migration "*) exit 7 ;; esac
fi
if [ "$1" = "save" ]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--output" ]; then
      printf 'fake-images' > "$2"
      exit 0
    fi
    shift
  done
  exit 0
fi
if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
  printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
fi
exit 0
`,
    { mode: 0o755 },
  );
  chmodSync(docker, 0o755);
  return { bin, dockerLog };
}

function runPackageRelease(input: {
  readonly root: string;
  readonly releaseId: string;
  readonly failMigration?: boolean;
}) {
  const output = join(input.root, "releases");
  mkdirSync(output, { recursive: true });
  const commands = createFakeCommands(input.root);
  const result = spawnSync(
    "bash",
    ["infra/tencent/review/package-release.sh", input.releaseId, output],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${commands.bin}:${process.env.PATH ?? ""}`,
        FAKE_DOCKER_LOG: commands.dockerLog,
        FAKE_RELEASE_ID: input.releaseId,
        ...(input.failMigration ? { FAKE_FAIL_MIGRATION: "1" } : {}),
      },
    },
  );
  return { commands, output, result };
}

describe("Review release package cleanup", () => {
  it("keeps the new package, prunes superseded packages, and removes exported images", () => {
    const root = mkdtempSync(join(tmpdir(), "jingtang-review-package-test-"));
    roots.push(root);
    const releaseId = "b".repeat(40);
    const output = join(root, "releases");
    const staleId = "a".repeat(40);
    mkdirSync(join(output, staleId), { recursive: true });
    writeFileSync(join(output, staleId, "RELEASE"), `${staleId}\n`);
    mkdirSync(join(output, "unmanaged-directory"));

    const run = runPackageRelease({ root, releaseId });

    expect(run.result.status, run.result.stderr).toBe(0);
    expect(existsSync(join(output, releaseId, "SHA256SUMS"))).toBe(true);
    expect(existsSync(join(output, releaseId, "jingtang-review-images.tar"))).toBe(true);
    expect(existsSync(join(output, staleId))).toBe(false);
    expect(existsSync(join(output, "unmanaged-directory"))).toBe(true);
    expect(readFileSync(run.commands.dockerLog, "utf8")).toContain(
      `image rm jingtang-review:${releaseId} jingtang-review-migration:${releaseId}`,
    );
  }, 15_000);

  it("removes a partial package and any built images when packaging fails", () => {
    const root = mkdtempSync(join(tmpdir(), "jingtang-review-package-test-"));
    roots.push(root);
    const releaseId = "c".repeat(40);

    const run = runPackageRelease({ root, releaseId, failMigration: true });

    expect(run.result.status).toBe(7);
    expect(existsSync(join(run.output, releaseId))).toBe(false);
    expect(readFileSync(run.commands.dockerLog, "utf8")).toContain(
      `image rm jingtang-review:${releaseId} jingtang-review-migration:${releaseId}`,
    );
  });
});
