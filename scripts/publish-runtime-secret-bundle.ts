import { readFileSync } from "node:fs";

import {
  createRuntimeSecretPublisherDependencies,
  publishRuntimeSecretBundle,
  type RuntimeSecretRole,
} from "../packages/integrations/src/tencent-runtime-secret-bundle.js";
import { CvmRoleCredential, type Credential } from "tencentcloud-sdk-nodejs-common";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`publisher_${key.toLowerCase()}_required`);
  return value;
}

function role(value: string): RuntimeSecretRole {
  if (value === "platform" || value === "dispatcher" || value === "worker") return value;
  throw new Error("publisher_runtime_secret_bundle_role_invalid");
}

if (process.env.JINGTANG_PRODUCTION_CHANGE_AUTHORIZED !== "true") {
  throw new Error("publisher_production_change_authorization_required");
}
required("JINGTANG_PRODUCTION_CHANGE_REFERENCE");
if (process.env.APP_ENV !== "staging" && process.env.APP_ENV !== "production") {
  throw new Error("publisher_deployed_environment_required");
}

const credential =
  process.env.TENCENT_CREDENTIAL_PROVIDER === "cvm_role"
    ? new CvmRoleCredential()
    : ({
        secretId: required("TENCENT_CLOUD_SECRET_ID"),
        secretKey: required("TENCENT_CLOUD_SECRET_KEY"),
        ...(process.env.TENCENT_CLOUD_SESSION_TOKEN
          ? { token: process.env.TENCENT_CLOUD_SESSION_TOKEN }
          : {}),
      } satisfies Credential);
const dependencies = createRuntimeSecretPublisherDependencies({
  bucket: required("RUNTIME_SECRET_BUNDLE_BUCKET"),
  region: required("RUNTIME_SECRET_BUNDLE_REGION"),
  endpoint: required("RUNTIME_SECRET_BUNDLE_ENDPOINT"),
  credential,
});
const raw = readFileSync(0, "utf8");
const result = await publishRuntimeSecretBundle({
  role: role(required("RUNTIME_SECRET_BUNDLE_ROLE")),
  payload: JSON.parse(raw) as unknown,
  masterKeyId: required("TENCENT_KMS_KEY_ID"),
  ...dependencies,
});

process.stdout.write(
  `${JSON.stringify({
    object_key: result.objectKey,
    cos_version_id: result.versionId,
    bundle_version: result.bundleVersion,
  })}\n`,
);
