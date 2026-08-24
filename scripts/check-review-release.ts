import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const requireText = (text: string, marker: string, owner: string) => {
  if (!text.includes(marker)) throw new Error(`${owner} is missing ${marker}`);
};

type CamPolicy = {
  version?: string;
  statement?: Array<{ effect?: string; action?: string[]; resource?: string[] }>;
};

const requireCamPolicy = (
  path: string,
  expectedActions: string[],
  expectedResourceMarkers: string[],
) => {
  const policy = JSON.parse(read(path)) as CamPolicy;
  if (policy.version !== "2.0" || !policy.statement?.length) {
    throw new Error(`${path} must be a non-empty CAM policy version 2.0`);
  }
  const actions = policy.statement.flatMap((statement) => statement.action ?? []);
  const resources = policy.statement.flatMap((statement) => statement.resource ?? []);
  if (policy.statement.some((statement) => statement.effect !== "allow")) {
    throw new Error(`${path} must contain only explicit allow statements`);
  }
  if (actions.includes("*") || resources.includes("*")) {
    throw new Error(`${path} must not grant wildcard action or resource access`);
  }
  if (actions.some((action) => !expectedActions.includes(action))) {
    throw new Error(`${path} grants an action outside its reviewed allow-list`);
  }
  for (const action of expectedActions) {
    if (!actions.includes(action)) throw new Error(`${path} is missing ${action}`);
  }
  for (const marker of expectedResourceMarkers) {
    if (!resources.some((resource) => resource.includes(marker))) {
      throw new Error(`${path} is missing a resource scoped to ${marker}`);
    }
  }
  for (const resource of resources) {
    if (!expectedResourceMarkers.some((marker) => resource.includes(marker))) {
      throw new Error(`${path} grants a resource outside its reviewed allow-list`);
    }
    if (!resource.includes("ap-seoul") || !resource.includes("REPLACE_WITH_")) {
      throw new Error(`${path} must remain a Seoul-scoped operator template`);
    }
  }
};

const composeText = read("infra/tencent/review/compose.yaml");
const runtimeEnvExample = read("infra/tencent/review/runtime.env.example");
const compose = parse(composeText) as {
  services?: Record<string, { ports?: unknown; mem_limit?: string; networks?: unknown }>;
  networks?: Record<string, { external?: boolean; name?: string }>;
};
for (const service of ["postgres", "platform", "worker"]) {
  const definition = compose.services?.[service];
  if (!definition) throw new Error(`review compose is missing ${service}`);
  if (definition.ports) throw new Error(`${service} must not publish a host port`);
  if (!definition.mem_limit) throw new Error(`${service} must have a memory limit`);
}
if (
  compose.networks?.ingress?.external !== true ||
  compose.networks.ingress.name !== "jingtang-ingress"
) {
  throw new Error("review compose must use the shared external ingress network");
}
for (const marker of [
  "APP_ENV: review",
  'user: "65532:65532"',
  'ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES: "16106127360"',
  'MAX_SOURCE_ASSET_BYTES: "524288000"',
  "OAUTH_TOKEN_VAULT_PROVIDER: local",
  "LOCAL_TOKEN_KEY_STORE_PATH: /var/lib/jingtang/oauth-envelope-keys.json",
  "OAUTH_TOKEN_ENCRYPTION_KEY_FILE: /run/jingtang-secrets/oauth-token-encryption-key",
  "/srv/jingtang/review/secrets/oauth-token-encryption-key:/run/jingtang-secrets/oauth-token-encryption-key:ro",
  "DATABASE_URL_FILE:",
  "profiles: [tools]",
  "cpus: 0.75",
]) {
  requireText(composeText, marker, "review compose");
}
if (/ports:\s*\n/u.test(composeText)) throw new Error("review compose exposes a host port");
if (composeText.includes('user: "1000:1000"')) {
  throw new Error("review services must not share the ordinary host operator UID");
}
if (/image:\s*[^\n]*:latest(?:\s|$)/u.test(composeText)) {
  throw new Error("review compose must not use a latest image tag");
}
for (const forbidden of [
  "REVIEW_KMS_KEY_ID",
  "REVIEW_OAUTH_KEY_COS_BUCKET",
  "TENCENT_KMS_KEY_ID",
  "OAUTH_TOKEN_KEY_STORAGE_BUCKET",
  "TENCENT_CLOUD_SECRET_ID_FILE",
  "TENCENT_CLOUD_SECRET_KEY_FILE",
]) {
  if (composeText.includes(forbidden) || runtimeEnvExample.includes(forbidden)) {
    throw new Error(`review runtime configuration must not depend on ${forbidden}`);
  }
}

const caddy = read("infra/tencent/public-site/Caddyfile");
for (const marker of [
  "review.jingtangai.com",
  "reverse_proxy review-platform:3100",
  "header_up X-Forwarded-For {remote_host}",
  "header_up X-Real-IP {remote_host}",
  'X-Robots-Tag "noindex, nofollow, noarchive"',
  "log_skip @sensitive_callback",
  "https://*.cos.ap-seoul.myqcloud.com",
]) {
  requireText(caddy, marker, "public-site Caddyfile");
}

const dockerfile = read("Dockerfile");
requireText(dockerfile, "FROM build AS migration", "Dockerfile");
requireText(dockerfile, "FROM build AS production-pruned", "Dockerfile");

const assetRoute = read("apps/platform/src/app/api/v1/content/assets/route.ts");
const composer = read("apps/platform/src/components/content-composer.tsx");
requireText(assetRoute, "createDirectUpload", "asset upload initiation route");
requireText(assetRoute, "ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES", "asset upload initiation route");
if (assetRoute.includes("formData()") || assetRoute.includes("arrayBuffer()")) {
  throw new Error("application server must not buffer review media");
}
requireText(composer, "fetch(authorization.upload.url", "content composer");
requireText(composer, "/complete", "content composer");

const config = read("packages/application/src/config.ts");
for (const marker of [
  'APP_ENV: z.enum(["local", "test", "review", "staging", "production"])',
  'value.APP_BASE_URL !== "https://review.jingtangai.com"',
  'value.APP_ENV === "review" ? "local" : "tencent_kms"',
  "usesSecureCookies",
]) {
  requireText(config, marker, "application config");
}

const internalSecrets = read("infra/tencent/review/generate-internal-secrets.sh");
for (const marker of [
  "oauth-token-encryption-key",
  "openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\\n'",
]) {
  requireText(internalSecrets, marker, "review internal-secret generator");
}

const backupScript = read("infra/tencent/review/backup-review.sh");
for (const forbidden of [
  "/srv/jingtang/review/state",
  "oauth-token-encryption-key",
  "oauth-envelope-keys.json",
]) {
  if (backupScript.includes(forbidden)) {
    throw new Error(`review backup must exclude protected local envelope material: ${forbidden}`);
  }
}

for (const script of [
  "infra/tencent/review/package-release.sh",
  "infra/tencent/review/prepare-host.sh",
  "infra/tencent/review/generate-internal-secrets.sh",
  "infra/tencent/review/install-external-secret.sh",
  "infra/tencent/review/install-maintenance-timers.sh",
  "infra/tencent/review/backup-review.sh",
  "infra/tencent/review/restore-review-drill.sh",
  "infra/tencent/review/check-capacity.sh",
  "infra/tencent/review/activate-release.sh",
]) {
  if ((statSync(resolve(root, script)).mode & 0o111) === 0) {
    throw new Error(`${script} must be executable`);
  }
}

const activation = read("infra/tencent/review/activate-release.sh");
for (const marker of [
  "candidate_init",
  "previous_review_running",
  "compose_live up -d postgres platform worker",
  "https://jingtangai.com/",
  "https://review.jingtangai.com/api/v1/health",
]) {
  requireText(activation, marker, "review activation");
}
for (const unit of [
  "infra/tencent/review/systemd/jingtang-review-backup.service",
  "infra/tencent/review/systemd/jingtang-review-backup.timer",
  "infra/tencent/review/systemd/jingtang-review-capacity.service",
  "infra/tencent/review/systemd/jingtang-review-capacity.timer",
]) {
  requireText(read(unit), "[Unit]", unit);
}

requireCamPolicy(
  "infra/tencent/review/cam/platform-policy.json",
  ["name/cos:GetBucket", "name/cos:PutObject", "name/cos:GetObject", "name/cos:DeleteObject"],
  ["REPLACE_WITH_SOURCE_BUCKET_WITH_APPID/*", "workspaces/*"],
);
requireCamPolicy(
  "infra/tencent/review/cam/worker-policy.json",
  ["name/cos:GetObject", "name/cos:DeleteObject"],
  ["workspaces/*"],
);
requireCamPolicy(
  "infra/tencent/review/cam/backup-policy.json",
  ["name/cos:PutObject", "name/cos:GetObject"],
  ["backups/postgres/*"],
);

process.stdout.write(
  "Review release evidence: isolated low-resource compose, protected local envelope-key files, least-privilege COS access, direct COS upload, encrypted backup tooling, shared ingress, and rollback assets passed.\n",
);
