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
  TERMS_VERSION: "2026-08-21",
  PRIVACY_VERSION: "2026-08-21",
  DATA_PURPOSE_VERSION: "2026-08-21",
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
      IDENTITY_PROVIDER: "cognito",
      ALLOW_TEST_IDENTITY: "false",
      COGNITO_USER_POOL_ID: "ap-southeast-1_example",
      COGNITO_CLIENT_ID: "example-client",
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
});
