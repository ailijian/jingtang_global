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
  TERMS_VERSION: "d2-test-terms-v1",
  PRIVACY_VERSION: "d2-test-privacy-v1",
  DATA_PURPOSE_VERSION: "d2-test-purpose-v1",
  TERMS_URL: "https://example.invalid/terms",
  PRIVACY_URL: "https://example.invalid/privacy",
};

describe("environment isolation", () => {
  it("allows explicit synthetic test configuration", () => {
    expect(parseAppConfig(base).APP_ENV).toBe("test");
  });

  it("rejects mock identity and test policy versions in production", () => {
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
});
