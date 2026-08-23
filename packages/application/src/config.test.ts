import { describe, expect, it } from "vitest";

import { parseAppConfig } from "./config.js";

const base = {
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_BASE_URL: "http://localhost:3100",
  DATABASE_URL: "postgresql://example.invalid/test",
  IDENTITY_PROVIDER: "mock",
  ALLOW_TEST_IDENTITY: "true",
  SESSION_COOKIE_SECRET: "a-secure-test-secret-with-32-characters",
  TERMS_VERSION: "2026-08-22",
  PRIVACY_VERSION: "2026-08-22",
  DATA_PURPOSE_VERSION: "2026-08-22",
  TERMS_URL: "https://jingtangai.com/en/terms/",
  PRIVACY_URL: "https://jingtangai.com/en/privacy/",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
  OBJECT_STORAGE_BUCKET: "jingtang-test-assets",
  OBJECT_STORAGE_ACCESS_KEY_ID: "test-access-key",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "test-secret-access-key",
  OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: "true",
};

describe("environment isolation", () => {
  it("allows explicit synthetic test configuration", () => {
    expect(parseAppConfig(base).APP_ENV).toBe("test");
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

  it("requires the frozen policy version and same-domain URLs in production", () => {
    const production = {
      ...base,
      NODE_ENV: "production",
      APP_ENV: "production",
      APP_BASE_URL: "https://app.jingtangai.com",
      IDENTITY_PROVIDER: "ciam",
      ALLOW_TEST_IDENTITY: "false",
      CIAM_ISSUER: "https://example.auth.tencentciam.com",
      CIAM_CLIENT_ID: "example-client",
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
