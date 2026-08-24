import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function requireText(contents: string, fragment: string, owner: string): void {
  if (!contents.includes(fragment)) throw new Error(`${owner} is missing ${fragment}`);
}

const dockerfile = read("Dockerfile");
const pinnedBuildNode =
  "node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03";
const pinnedRuntimeNode =
  "node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995";
requireText(dockerfile, `${pinnedBuildNode} AS build`, "Dockerfile");
requireText(dockerfile, `${pinnedRuntimeNode} AS runtime`, "Dockerfile");
requireText(dockerfile, "org.opencontainers.image.revision=$VCS_REF", "Dockerfile");
requireText(dockerfile, "USER node", "Dockerfile");
requireText(
  dockerfile,
  "rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack",
  "Dockerfile",
);

const caddyDockerfile = read("infra/tencent/saas/Caddy.Dockerfile");
requireText(
  caddyDockerfile,
  "golang:1.26.6-alpine3.23@sha256:e57c41c1d5864341031181b0db34b9a537bb5773eb6428e4e5bdaea0f9135406 AS build",
  "Caddy.Dockerfile",
);
requireText(
  caddyDockerfile,
  "git fetch --depth 1 origin refs/tags/v2.11.4:refs/tags/v2.11.4",
  "Caddy.Dockerfile",
);
requireText(
  caddyDockerfile,
  'test "$(git rev-parse HEAD)" = "e2eee6a7fce366321294c9c2a79f3146891dcbdf"',
  "Caddy.Dockerfile",
);
for (const dependency of [
  "golang.org/x/net@v0.56.0",
  "golang.org/x/text@v0.39.0",
  "google.golang.org/grpc@v1.82.1",
] as const) {
  requireText(caddyDockerfile, dependency, "Caddy.Dockerfile");
}
requireText(caddyDockerfile, "FROM scratch", "Caddy.Dockerfile");
requireText(caddyDockerfile, "org.opencontainers.image.revision=$VCS_REF", "Caddy.Dockerfile");
requireText(caddyDockerfile, "USER 1000:1000", "Caddy.Dockerfile");

const composeText = read("infra/tencent/saas/compose.yaml");
const compose = parseYaml(composeText) as {
  services?: Record<string, { image?: string; environment?: Record<string, unknown> }>;
};
for (const service of ["ingress", "platform", "dispatcher", "worker"] as const) {
  if (!compose.services?.[service]) throw new Error(`compose service ${service} is required`);
}
requireText(composeText, "JINGTANG_CADDY_IMAGE", "compose.yaml");
for (const role of ["PLATFORM", "DISPATCHER", "WORKER"] as const) {
  requireText(composeText, `${role}_SECRET_VERSION_ID`, "compose.yaml");
}
requireText(composeText, "RUNTIME_SECRET_BUNDLE_REGION: ap-seoul", "compose.yaml");
requireText(
  composeText,
  "OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE: bucket_default",
  "compose.yaml",
);
requireText(composeText, "https://app.jingtangai.com", "compose.yaml");
requireText(composeText, "condition: service_healthy", "compose.yaml");
requireText(
  composeText,
  'command: ["node", "--use-env-proxy", "apps/platform/scripts/start.mjs"]',
  "compose.yaml",
);
requireText(
  composeText,
  'command: ["node", "--use-env-proxy", "apps/dispatcher/dist/index.js"]',
  "compose.yaml",
);
requireText(
  composeText,
  'command: ["node", "--use-env-proxy", "apps/worker/dist/index.js"]',
  "compose.yaml",
);

const runtimeExample = read("infra/tencent/saas/runtime.env.example");
if (
  /^(?:DATABASE_(?:ADMIN_)?URL|DATABASE_WORKER_URL|CIAM_CLIENT_SECRET|SESSION_COOKIE_SECRET|TDMQ_AMQP_URL|YOUTUBE_OAUTH_CLIENT_SECRET|YOUTUBE_OAUTH_STATE_SECRET|TENCENT_CLOUD_SECRET_(?:ID|KEY))=/mu.test(
    runtimeExample,
  )
) {
  throw new Error("runtime.env.example must not contain plaintext-secret fields");
}

const activation = read("infra/tencent/saas/activate-release.sh");
requireText(activation, "sha256sum --check --status", "activate-release.sh");
requireText(activation, "org.opencontainers.image.revision", "activate-release.sh");
requireText(activation, "jingtang-caddy:$release_id", "activate-release.sh");
requireText(activation, "JINGTANG_CADDY_IMAGE", "activate-release.sh");
requireText(
  activation,
  '"$caddy_image" validate --config /etc/caddy/Caddyfile',
  "activate-release.sh",
);
requireText(activation, "Plaintext secrets are forbidden", "activate-release.sh");
requireText(activation, "rollback", "activate-release.sh");
requireText(activation, 'readonly rollback_dir="$release_dir/rollback-', "activate-release.sh");
requireText(activation, "compose_candidate config --quiet", "activate-release.sh");
requireText(
  activation,
  "previous complete release configuration was restored",
  "activate-release.sh",
);
for (const container of ["ingress", "dispatcher", "worker"] as const) {
  requireText(activation, `jingtang-saas-${container}-1`, "activate-release.sh");
}

const caddyfile = read("infra/tencent/saas/Caddyfile");
requireText(
  caddyfile,
  "@youtube_oauth_callback path /api/v1/channels/youtube/oauth/callback",
  "Caddyfile",
);
requireText(caddyfile, "log_skip @youtube_oauth_callback", "Caddyfile");

const healthRoute = read("apps/platform/src/app/api/v1/health/route.ts");
requireText(healthRoute, `'dispatching'::"outbox_state"`, "production health route");
requireText(healthRoute, `'dispatched'::"outbox_state"`, "production health route");

const objectStorage = read("packages/integrations/src/s3-asset-storage.ts");
requireText(
  objectStorage,
  'this.#serverSideEncryption === "AES256"',
  "source-asset object storage",
);
const tokenVault = read("packages/integrations/src/tencent-kms-envelope-token-vault.ts");
requireText(tokenVault, "VersionId: versionId", "Tencent KMS OAuth token vault");
requireText(tokenVault, "versionedKeyReference", "Tencent KMS OAuth token vault");
if (tokenVault.includes('ServerSideEncryption: "AES256"')) {
  throw new Error("OAuth wrapped keys must inherit the COS KMS bucket default");
}

const runtimeSecretBundle = read("packages/integrations/src/tencent-runtime-secret-bundle.ts");
if (/worker\s*:\s*\[[^\]]*CIAM_CLIENT_SECRET/su.test(runtimeSecretBundle)) {
  throw new Error("The worker runtime bundle must not receive the CIAM OAuth client secret");
}
const workerSource = read("apps/worker/src/index.ts");
requireText(
  workerSource,
  "createTencentCiamIdentityDeletionProvider(config)",
  "production worker identity boundary",
);
if (workerSource.includes("createTencentCiamIdentityProvider(config)")) {
  throw new Error("The production worker must use the deletion-only CIAM provider");
}

const workflow = read(".github/workflows/deploy-saas-production.yml");
const ciWorkflow = read(".github/workflows/ci.yml");
const trivyAction = "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25";
requireText(workflow, "environment: production-saas", "deploy workflow");
requireText(workflow, "DEPLOY-JINGTANG-SAAS-PRODUCTION", "deploy workflow");
requireText(workflow, "pnpm verify", "deploy workflow");
requireText(workflow, "pnpm site:release-check", "deploy workflow");
requireText(workflow, "--platform linux/amd64", "deploy workflow");
requireText(workflow, "infra/tencent/saas/Caddy.Dockerfile", "deploy workflow");
requireText(workflow, "jingtang-caddy:${{ github.sha }}", "deploy workflow");
requireText(workflow, '"$TARGET:$release_root/"', "deploy workflow");
requireText(workflow, `${trivyAction} # v0.36.0`, "deploy workflow");
requireText(workflow, "scan-type: config", "deploy workflow");
requireText(workflow, "scan-type: image", "deploy workflow");
requireText(workflow, "scanners: vuln", "deploy workflow");
requireText(workflow, "severity: HIGH,CRITICAL", "deploy workflow");
requireText(workflow, 'exit-code: "1"', "deploy workflow");
requireText(ciWorkflow, `${trivyAction} # v0.36.0`, "CI workflow");
requireText(ciWorkflow, "scan-type: config", "CI workflow");
requireText(ciWorkflow, "severity: HIGH,CRITICAL", "CI workflow");
requireText(ciWorkflow, 'exit-code: "1"', "CI workflow");
const actionUses = [...workflow.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/gu)].map((match) => match[1]);
if (actionUses.length !== 7 || actionUses.some((reference) => !/^[0-9a-f]{40}$/u.test(reference))) {
  throw new Error("Every production deployment action must use a reviewed full commit SHA");
}

const terraform = read("infra/tencent/saas/main.tf");
const variables = read("infra/tencent/saas/variables.tf");
const terraformVersions = read("infra/tencent/saas/versions.tf");
requireText(terraform, 'port        = "80"', "Tencent Terraform");
requireText(terraform, 'port        = "443"', "Tencent Terraform");
requireText(terraform, '"name/ciam:DeleteUsers"', "Tencent Terraform");
requireText(terraform, 'config_regexp = "^jingtang\\\\..*"', "Tencent Terraform");
requireText(variables, 'default     = "ap-seoul"', "Tencent Terraform");
if ((terraform.match(/non_current_days = 35/gu) ?? []).length !== 3) {
  throw new Error("Every versioned COS bucket must enforce the 35-day residual maximum");
}
if ((terraform.match(/days_after_initiation = 1/gu) ?? []).length !== 3) {
  throw new Error("Every COS bucket must abort incomplete multipart uploads");
}
if ((terraform.match(/encryption_algorithm = "KMS"/gu) ?? []).length !== 3) {
  throw new Error("Every COS bucket must use its Terraform-managed KMS default encryption");
}
if (terraform.includes("ap-singapore") || variables.includes("ap-singapore")) {
  throw new Error("D7 Tencent Terraform must not drift from Seoul");
}
requireText(terraformVersions, "encrypt = true", "Tencent Terraform COS backend");
requireText(terraformVersions, 'acl     = "private"', "Tencent Terraform COS backend");

process.stdout.write(
  "SaaS release evidence: pinned image, Seoul topology, role-versioned sealed secrets, protected activation, explicit production authorization, and health gate passed.\n",
);
