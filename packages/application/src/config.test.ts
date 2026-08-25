import { describe, expect, it } from "vitest";

import { allowsYouTubeTestOAuth, parseAppConfig } from "./config.js";

const base = {
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_BASE_URL: "http://localhost:3100",
  DATABASE_URL: "postgresql://example.invalid/test",
  IDENTITY_PROVIDER: "mock",
  ALLOW_TEST_IDENTITY: "true",
  SESSION_COOKIE_SECRET: "a-secure-test-secret-with-32-characters",
  TERMS_VERSION: "2026-08-25",
  PRIVACY_VERSION: "2026-08-25",
  DATA_PURPOSE_VERSION: "2026-08-25",
  TERMS_URL: "https://jingtangai.com/en/terms/",
  PRIVACY_URL: "https://jingtangai.com/en/privacy/",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
  OBJECT_STORAGE_BUCKET: "jingtang-test-assets",
  OBJECT_STORAGE_ACCESS_KEY_ID: "test-access-key",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "test-secret-access-key",
  OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: "true",
};

describe("environment isolation", () => {
  it("allows the test OAuth journey only in local, test, and review environments", () => {
    expect(allowsYouTubeTestOAuth("local")).toBe(true);
    expect(allowsYouTubeTestOAuth("test")).toBe(true);
    expect(allowsYouTubeTestOAuth("review")).toBe(true);
    expect(allowsYouTubeTestOAuth("staging")).toBe(false);
    expect(allowsYouTubeTestOAuth("production")).toBe(false);
  });

  it("allows explicit synthetic test configuration", () => {
    expect(parseAppConfig(base).APP_ENV).toBe("test");
    expect(parseAppConfig(base).OBJECT_STORAGE_REGION).toBe("ap-seoul");
    expect(parseAppConfig(base).TENCENT_KMS_REGION).toBe("ap-seoul");
  });

  it("rejects synthetic identity in production", () => {
    expect(() =>
      parseAppConfig({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
        APP_BASE_URL: "https://app.example.com",
      }),
    ).toThrow();
  });

  it("rejects synthetic identity in staging", () => {
    expect(() => parseAppConfig({ ...base, APP_ENV: "staging" })).toThrow();
  });

  it("accepts only the isolated Seoul review profile", () => {
    const review = {
      ...base,
      NODE_ENV: "production",
      APP_ENV: "review",
      APP_BASE_URL: "https://review.jingtangai.com",
      DATABASE_WORKER_URL: "postgresql://worker.example.invalid/review",
      ALLOW_TEST_IDENTITY: "false",
      LOCAL_IDENTITY_STORE_PATH: "/var/lib/jingtang/review-identities.json",
      OBJECT_STORAGE_ENDPOINT: "https://cos.ap-seoul.myqcloud.com",
      OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE: "bucket_default",
      ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES: "16106127360",
      YOUTUBE_OAUTH_ENABLED: "true",
      YOUTUBE_OAUTH_CLIENT_ID: "review-client.apps.googleusercontent.com",
      YOUTUBE_OAUTH_CLIENT_SECRET: "review-client-secret",
      YOUTUBE_OAUTH_STATE_SECRET: "a-separate-review-state-secret-value",
      OAUTH_TOKEN_VAULT_PROVIDER: "local",
      OAUTH_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      LOCAL_TOKEN_KEY_STORE_PATH: "/var/lib/jingtang/oauth-envelope-keys.json",
    };
    expect(parseAppConfig(review).APP_ENV).toBe("review");
    expect(() =>
      parseAppConfig({ ...review, APP_BASE_URL: "https://app.jingtangai.com" }),
    ).toThrow();
    expect(() => parseAppConfig({ ...review, ALLOW_TEST_IDENTITY: "true" })).toThrow();
    expect(() =>
      parseAppConfig({ ...review, ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES: "0" }),
    ).toThrow();
    expect(() => parseAppConfig({ ...review, TENCENT_CREDENTIAL_PROVIDER: "cvm_role" })).toThrow();
    expect(() =>
      parseAppConfig({
        ...review,
        OAUTH_TOKEN_VAULT_PROVIDER: "tencent_kms",
        TENCENT_KMS_KEY_ID: "review-kms-key",
        OAUTH_TOKEN_KEY_STORAGE_BUCKET: "review-wrapped-keys",
        TENCENT_CLOUD_SECRET_ID: "review-secret-id",
        TENCENT_CLOUD_SECRET_KEY: "review-secret-key",
      }),
    ).toThrow("temporary review environment requires the local envelope token vault");
  });

  it("requires the frozen policy version and same-domain URLs in production", () => {
    const production = {
      ...base,
      NODE_ENV: "production",
      APP_ENV: "production",
      APP_BASE_URL: "https://app.jingtangai.com",
      DATABASE_WORKER_URL: "postgresql://worker.example.invalid/production",
      ASYNC_TRANSPORT: "tdmq_rabbitmq",
      TDMQ_AMQP_URL: "amqps://queue.example.invalid/jingtang-production",
      IDENTITY_PROVIDER: "ciam",
      ALLOW_TEST_IDENTITY: "false",
      CIAM_ISSUER: "https://example.auth.tencentciam.com",
      CIAM_CLIENT_ID: "example-client",
      CIAM_CLIENT_SECRET: "example-client-secret",
      CIAM_PASSWORD_AUTH_SOURCE_ID: "password-source",
      CIAM_USER_STORE_ID: "user-store",
      RUNTIME_SECRET_BUNDLE_ENABLED: "true",
      RUNTIME_SECRET_BUNDLE_ROLE: "platform",
      RUNTIME_SECRET_BUNDLE_BUCKET: "jingtang-production-runtime-secrets",
      RUNTIME_SECRET_BUNDLE_VERSION_ID: "immutable-version-id",
      RUNTIME_SECRET_BUNDLE_ENDPOINT: "https://cos.ap-seoul.myqcloud.com",
      TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
      OBJECT_STORAGE_ACCESS_KEY_ID: "",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
      OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE: "bucket_default",
    };
    expect(parseAppConfig(production).TERMS_URL).toBe("https://jingtangai.com/en/terms/");
    expect(() =>
      parseAppConfig({
        ...production,
        TERMS_VERSION: "obsolete",
        TERMS_URL: "https://example.com",
      }),
    ).toThrow();
  });

  it("requires complete YouTube OAuth secrets when the integration is enabled", () => {
    expect(() => parseAppConfig({ ...base, YOUTUBE_OAUTH_ENABLED: "true" })).toThrow();
    expect(
      parseAppConfig({
        ...base,
        YOUTUBE_OAUTH_ENABLED: "true",
        YOUTUBE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com",
        YOUTUBE_OAUTH_CLIENT_SECRET: "test-client-secret",
        YOUTUBE_OAUTH_STATE_SECRET: "a-separate-state-secret-with-32-characters",
        OAUTH_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        LOCAL_TOKEN_KEY_STORE_PATH: "/tmp/jingtang-test-oauth-token-keys.json",
      }).YOUTUBE_OAUTH_ENABLED,
    ).toBe(true);
  });

  it("does not require a browser-only OAuth state secret in the deployed worker", () => {
    const stagingWorker = {
      ...base,
      APP_ENV: "staging",
      DATABASE_WORKER_URL: "postgresql://worker.example.invalid/staging",
      ASYNC_TRANSPORT: "tdmq_rabbitmq",
      TDMQ_AMQP_URL: "amqps://queue.example.invalid/jingtang-staging",
      IDENTITY_PROVIDER: "ciam",
      ALLOW_TEST_IDENTITY: "false",
      CIAM_ISSUER: "https://example.auth.tencentciam.com",
      CIAM_CLIENT_ID: "example-client",
      CIAM_CLIENT_SECRET: "",
      CIAM_PASSWORD_AUTH_SOURCE_ID: "",
      CIAM_USER_STORE_ID: "user-store",
      RUNTIME_SECRET_BUNDLE_ENABLED: "true",
      RUNTIME_SECRET_BUNDLE_ROLE: "worker",
      RUNTIME_SECRET_BUNDLE_BUCKET: "jingtang-staging-runtime-secrets",
      RUNTIME_SECRET_BUNDLE_VERSION_ID: "immutable-version-id",
      RUNTIME_SECRET_BUNDLE_ENDPOINT: "https://cos.ap-seoul.myqcloud.com",
      TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
      OBJECT_STORAGE_ACCESS_KEY_ID: "",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
      OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE: "bucket_default",
      YOUTUBE_OAUTH_ENABLED: "true",
      YOUTUBE_OAUTH_CLIENT_ID: "worker-client.apps.googleusercontent.com",
      YOUTUBE_OAUTH_CLIENT_SECRET: "worker-client-secret",
      OAUTH_TOKEN_VAULT_PROVIDER: "tencent_kms",
      TENCENT_KMS_KEY_ID: "kms-key",
      OAUTH_TOKEN_KEY_STORAGE_BUCKET: "jingtang-token-keys",
    };
    expect(parseAppConfig(stagingWorker).RUNTIME_SECRET_BUNDLE_ROLE).toBe("worker");
    expect(() =>
      parseAppConfig({
        ...stagingWorker,
        OAUTH_TOKEN_VAULT_PROVIDER: "local",
        OAUTH_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        LOCAL_TOKEN_KEY_STORE_PATH: "/var/lib/jingtang/oauth-envelope-keys.json",
      }),
    ).toThrow("Staging and production YouTube OAuth require the Tencent KMS token vault");
  });

  it("requires a separate wrapped-key bucket and complete Tencent KMS configuration", () => {
    const kms = {
      ...base,
      YOUTUBE_OAUTH_ENABLED: "true",
      YOUTUBE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com",
      YOUTUBE_OAUTH_CLIENT_SECRET: "test-client-secret",
      YOUTUBE_OAUTH_STATE_SECRET: "a-separate-state-secret-with-32-characters",
      OAUTH_TOKEN_VAULT_PROVIDER: "tencent_kms",
      TENCENT_CLOUD_SECRET_ID: "secret-id",
      TENCENT_CLOUD_SECRET_KEY: "secret-key",
      TENCENT_KMS_KEY_ID: "kms-key",
      OAUTH_TOKEN_KEY_STORAGE_BUCKET: "jingtang-token-keys",
    };
    expect(parseAppConfig(kms).OAUTH_TOKEN_VAULT_PROVIDER).toBe("tencent_kms");
    expect(() =>
      parseAppConfig({ ...kms, OAUTH_TOKEN_KEY_STORAGE_BUCKET: base.OBJECT_STORAGE_BUCKET }),
    ).toThrow();
  });

  it("requires CVM role credentials in deployed environments", () => {
    const deployed = {
      ...base,
      APP_ENV: "staging",
      DATABASE_WORKER_URL: "postgresql://worker.example.invalid/staging",
      ASYNC_TRANSPORT: "tdmq_rabbitmq",
      TDMQ_AMQP_URL: "amqps://queue.example.invalid/jingtang-staging",
      IDENTITY_PROVIDER: "ciam",
      ALLOW_TEST_IDENTITY: "false",
      CIAM_ISSUER: "https://example.auth.tencentciam.com",
      CIAM_CLIENT_ID: "example-client",
      CIAM_CLIENT_SECRET: "example-client-secret",
      CIAM_PASSWORD_AUTH_SOURCE_ID: "password-source",
      CIAM_USER_STORE_ID: "user-store",
      RUNTIME_SECRET_BUNDLE_ENABLED: "true",
      RUNTIME_SECRET_BUNDLE_ROLE: "platform",
      RUNTIME_SECRET_BUNDLE_BUCKET: "jingtang-staging-runtime-secrets",
      RUNTIME_SECRET_BUNDLE_VERSION_ID: "immutable-version-id",
      RUNTIME_SECRET_BUNDLE_ENDPOINT: "https://cos.ap-seoul.myqcloud.com",
      OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE: "bucket_default",
    };
    expect(() => parseAppConfig(deployed)).toThrow();
    expect(
      parseAppConfig({
        ...deployed,
        TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
        OBJECT_STORAGE_ACCESS_KEY_ID: "",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
      }).TENCENT_CREDENTIAL_PROVIDER,
    ).toBe("cvm_role");
    expect(() =>
      parseAppConfig({
        ...deployed,
        TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
        OBJECT_STORAGE_ACCESS_KEY_ID: "",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
        OBJECT_STORAGE_REGION: "ap-singapore",
      }),
    ).toThrow();
    expect(() =>
      parseAppConfig({
        ...deployed,
        TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
        OBJECT_STORAGE_ACCESS_KEY_ID: "",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
        OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE: "aes256",
      }),
    ).toThrow();
    expect(() =>
      parseAppConfig({
        ...deployed,
        TENCENT_CREDENTIAL_PROVIDER: "cvm_role",
        OBJECT_STORAGE_ACCESS_KEY_ID: "",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
        TENCENT_KMS_REGION: "ap-singapore",
      }),
    ).toThrow();
  });

  it("rejects malformed local OAuth token encryption keys", () => {
    expect(() =>
      parseAppConfig({
        ...base,
        OAUTH_TOKEN_ENCRYPTION_KEY: "not-a-valid-256-bit-base64url-encryption-key",
      }),
    ).toThrow();
  });

  it("permits deterministic YouTube faults only in the explicit test environment", () => {
    expect(parseAppConfig({ ...base, YOUTUBE_TEST_FAULT: "quota" }).YOUTUBE_TEST_FAULT).toBe(
      "quota",
    );
    expect(() =>
      parseAppConfig({
        ...base,
        APP_ENV: "local",
        YOUTUBE_TEST_FAULT: "quota",
      }),
    ).toThrow();
  });
});
