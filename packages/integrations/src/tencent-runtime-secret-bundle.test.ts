import { describe, expect, it } from "vitest";

import {
  decryptRuntimeSecretBundle,
  loadRuntimeSecretBundle,
  publishRuntimeSecretBundle,
  type RuntimeSecretObjectStore,
} from "./tencent-runtime-secret-bundle.js";
import type { TencentKmsClient } from "./tencent-kms-envelope-token-vault.js";

const dataKey = Buffer.alloc(32, 7);

function kms(): TencentKmsClient {
  return {
    GenerateDataKey: () =>
      Promise.resolve({
        KeyId: "kms-secret-key",
        Plaintext: dataKey.toString("base64"),
        CiphertextBlob: "wrapped-data-key",
      }),
    Decrypt: () =>
      Promise.resolve({
        KeyId: "kms-secret-key",
        Plaintext: dataKey.toString("base64"),
      }),
  };
}

class MemoryStore implements RuntimeSecretObjectStore {
  public body = "";

  public put(input: { readonly body: string }): Promise<{ readonly versionId: string }> {
    this.body = input.body;
    return Promise.resolve({ versionId: "cos-version-1" });
  }

  public get(): Promise<string> {
    return Promise.resolve(this.body);
  }
}

describe("Tencent runtime secret bundles", () => {
  it("publishes an immutable version and loads only the expected process role", async () => {
    const store = new MemoryStore();
    const published = await publishRuntimeSecretBundle({
      role: "platform",
      payload: {
        DATABASE_URL: "postgresql://app:secret@database.invalid/jingtang",
        SESSION_COOKIE_SECRET: "a-production-session-secret-over-32-bytes",
        FACEBOOK_APP_SECRET: "meta-app-secret",
        FACEBOOK_OAUTH_STATE_SECRET: "facebook-state-secret",
        TIKTOK_MEDIA_URL_SIGNING_SECRET: "a-dedicated-tiktok-media-url-signing-secret",
      },
      masterKeyId: "kms-secret-key",
      kms: kms(),
      store,
    });
    expect(published).toMatchObject({
      objectKey: "platform/runtime.enc",
      versionId: "cos-version-1",
    });

    const environment: NodeJS.ProcessEnv = {
      APP_ENV: "production",
      TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
      RUNTIME_SECRET_BUNDLE_ENABLED: "true",
      RUNTIME_SECRET_BUNDLE_ROLE: "platform",
      RUNTIME_SECRET_BUNDLE_BUCKET: "runtime-secrets",
      RUNTIME_SECRET_BUNDLE_VERSION_ID: published.versionId,
      RUNTIME_SECRET_BUNDLE_REGION: "ap-seoul",
      RUNTIME_SECRET_BUNDLE_ENDPOINT: "https://cos.ap-seoul.myqcloud.com",
    };
    await loadRuntimeSecretBundle(environment, "platform", { kms: kms(), store });
    expect(environment.DATABASE_URL).toBe("postgresql://app:secret@database.invalid/jingtang");
    expect(environment.SESSION_COOKIE_SECRET).toHaveLength(41);
    expect(environment.FACEBOOK_APP_SECRET).toBe("meta-app-secret");
    expect(environment.FACEBOOK_OAUTH_STATE_SECRET).toBe("facebook-state-secret");
    expect(environment.TIKTOK_MEDIA_URL_SIGNING_SECRET).toBe(
      "a-dedicated-tiktok-media-url-signing-secret",
    );
    await expect(
      decryptRuntimeSecretBundle({ role: "worker", serialized: store.body, kms: kms() }),
    ).rejects.toThrow("runtime_secret_bundle_scope_mismatch");
  });

  it("rejects unknown fields and plaintext environment collisions", async () => {
    const store = new MemoryStore();
    await expect(
      publishRuntimeSecretBundle({
        role: "dispatcher",
        payload: { CIAM_CLIENT_SECRET: "must-not-be-readable-by-dispatcher" },
        masterKeyId: "kms-secret-key",
        kms: kms(),
        store,
      }),
    ).rejects.toThrow("runtime_secret_bundle_payload_invalid");

    await expect(
      publishRuntimeSecretBundle({
        role: "worker",
        payload: { CIAM_CLIENT_SECRET: "browser-oauth-secret-must-not-reach-worker" },
        masterKeyId: "kms-secret-key",
        kms: kms(),
        store,
      }),
    ).rejects.toThrow("runtime_secret_bundle_payload_invalid");

    await publishRuntimeSecretBundle({
      role: "worker",
      payload: { DATABASE_WORKER_URL: "postgresql://worker:secret@database.invalid/jingtang" },
      masterKeyId: "kms-secret-key",
      kms: kms(),
      store,
    });
    const environment: NodeJS.ProcessEnv = {
      APP_ENV: "production",
      DATABASE_WORKER_URL: "plaintext-must-not-win",
      TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
      RUNTIME_SECRET_BUNDLE_ENABLED: "true",
      RUNTIME_SECRET_BUNDLE_ROLE: "worker",
      RUNTIME_SECRET_BUNDLE_BUCKET: "runtime-secrets",
      RUNTIME_SECRET_BUNDLE_VERSION_ID: "cos-version-1",
      RUNTIME_SECRET_BUNDLE_REGION: "ap-seoul",
      RUNTIME_SECRET_BUNDLE_ENDPOINT: "https://cos.ap-seoul.myqcloud.com",
    };
    await expect(
      loadRuntimeSecretBundle(environment, "worker", { kms: kms(), store }),
    ).rejects.toThrow("runtime_secret_plaintext_environment_forbidden");
  });
});
