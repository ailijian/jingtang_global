import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadRuntimeSecretFiles } from "./runtime-secret-files.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function secretFile(value: string, mode = 0o600): string {
  const directory = mkdtempSync(join(tmpdir(), "jingtang-review-secret-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "secret");
  writeFileSync(path, `${value}\n`, { mode });
  chmodSync(path, mode);
  return path;
}

describe("review runtime secret files", () => {
  it("loads an allowlisted root-only secret without retaining its file variable", () => {
    const environment: NodeJS.ProcessEnv = {
      APP_ENV: "review",
      SESSION_COOKIE_SECRET_FILE: secretFile("review-session-secret-value"),
    };
    loadRuntimeSecretFiles(environment, "platform");
    expect(environment.SESSION_COOKIE_SECRET).toBe("review-session-secret-value");
    expect(environment.SESSION_COOKIE_SECRET_FILE).toBeUndefined();
  });

  it.each(["platform", "worker"] as const)(
    "loads the review envelope key for the %s role",
    (role) => {
      const environment: NodeJS.ProcessEnv = {
        APP_ENV: "review",
        OAUTH_TOKEN_ENCRYPTION_KEY_FILE: secretFile("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      };
      loadRuntimeSecretFiles(environment, role);
      expect(environment.OAUTH_TOKEN_ENCRYPTION_KEY).toBe(
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      );
      expect(environment.OAUTH_TOKEN_ENCRYPTION_KEY_FILE).toBeUndefined();
    },
  );

  it("rejects review secret files outside review and files with open permissions", () => {
    expect(() =>
      loadRuntimeSecretFiles(
        { APP_ENV: "production", SESSION_COOKIE_SECRET_FILE: secretFile("secret") },
        "platform",
      ),
    ).toThrow("runtime_secret_files_restricted_to_review");
    expect(() =>
      loadRuntimeSecretFiles(
        { APP_ENV: "review", SESSION_COOKIE_SECRET_FILE: secretFile("secret", 0o644) },
        "platform",
      ),
    ).toThrow("runtime_secret_file_permissions_too_open");
  });

  it("rejects a plaintext value beside its file reference", () => {
    expect(() =>
      loadRuntimeSecretFiles(
        {
          APP_ENV: "review",
          SESSION_COOKIE_SECRET: "plaintext",
          SESSION_COOKIE_SECRET_FILE: secretFile("secret"),
        },
        "platform",
      ),
    ).toThrow("runtime_secret_plaintext_environment_forbidden");
  });
});
