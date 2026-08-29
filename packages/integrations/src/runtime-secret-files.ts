import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

export type RuntimeSecretFileRole = "platform" | "worker";

const fileKeys = {
  platform: [
    "DATABASE_URL",
    "SESSION_COOKIE_SECRET",
    "OBJECT_STORAGE_ACCESS_KEY_ID",
    "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "OAUTH_TOKEN_ENCRYPTION_KEY",
    "YOUTUBE_OAUTH_CLIENT_SECRET",
    "YOUTUBE_OAUTH_STATE_SECRET",
    "FACEBOOK_APP_SECRET",
    "FACEBOOK_OAUTH_STATE_SECRET",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_OAUTH_STATE_SECRET",
    "TIKTOK_MEDIA_URL_SIGNING_SECRET",
  ],
  worker: [
    "DATABASE_WORKER_URL",
    "SESSION_COOKIE_SECRET",
    "OBJECT_STORAGE_ACCESS_KEY_ID",
    "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "OAUTH_TOKEN_ENCRYPTION_KEY",
    "YOUTUBE_OAUTH_CLIENT_SECRET",
    "FACEBOOK_APP_SECRET",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_MEDIA_URL_SIGNING_SECRET",
  ],
} as const satisfies Record<RuntimeSecretFileRole, readonly string[]>;

function readSecretFile(path: string): string {
  if (!isAbsolute(path)) throw new Error("runtime_secret_file_path_must_be_absolute");
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("runtime_secret_file_must_be_regular");
  }
  if ((metadata.mode & 0o077) !== 0) throw new Error("runtime_secret_file_permissions_too_open");
  const value = readFileSync(path, "utf8").replace(/[\r\n]+$/u, "");
  if (!value || Buffer.byteLength(value, "utf8") > 64 * 1024 || value.includes("\0")) {
    throw new Error("runtime_secret_file_value_invalid");
  }
  return value;
}

export function loadRuntimeSecretFiles(
  environment: NodeJS.ProcessEnv,
  role: RuntimeSecretFileRole,
): void {
  const allowedKeys = new Set<string>(fileKeys[role]);
  const knownKeys = new Set<string>([...fileKeys.platform, ...fileKeys.worker]);
  for (const key of knownKeys) {
    if (environment[`${key}_FILE`] && !allowedKeys.has(key)) {
      throw new Error("runtime_secret_file_role_forbidden");
    }
  }
  const entries = fileKeys[role].map((key) => [key, `${key}_FILE`] as const);
  const configured = entries.filter(([, fileKey]) => Boolean(environment[fileKey]));
  if (configured.length === 0) return;
  if (environment.APP_ENV !== "review") {
    throw new Error("runtime_secret_files_restricted_to_review");
  }
  for (const [key, fileKey] of configured) {
    if (environment[key]) throw new Error("runtime_secret_plaintext_environment_forbidden");
    environment[key] = readSecretFile(environment[fileKey] ?? "");
    delete environment[fileKey];
  }
}
