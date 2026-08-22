import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalStateSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalEncryptionKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(43).optional(),
);

const productionPolicy = {
  version: "2026-08-21",
  termsUrl: "https://jingtangai.com/en/terms/",
  privacyUrl: "https://jingtangai.com/en/privacy/",
} as const;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    APP_BASE_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    DATABASE_ADMIN_URL: z.string().min(1).optional(),
    IDENTITY_PROVIDER: z.enum(["mock", "cognito", "ciam"]),
    ALLOW_TEST_IDENTITY: booleanString,
    LOCAL_IDENTITY_STORE_PATH: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    COGNITO_REGION: z.string().min(1).default("ap-southeast-1"),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    CIAM_ISSUER: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
    CIAM_CLIENT_ID: optionalSecret,
    SESSION_COOKIE_SECRET: z.string().min(32),
    TERMS_VERSION: z.string().min(1),
    PRIVACY_VERSION: z.string().min(1),
    DATA_PURPOSE_VERSION: z.string().min(1),
    TERMS_URL: z.url(),
    PRIVACY_URL: z.url(),
    OBJECT_STORAGE_ENDPOINT: z.url().optional(),
    OBJECT_STORAGE_REGION: z.string().min(1).default("ap-southeast-1"),
    OBJECT_STORAGE_BUCKET: z.string().min(3).max(63),
    OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(8),
    OBJECT_STORAGE_FORCE_PATH_STYLE: booleanString,
    OBJECT_STORAGE_AUTO_CREATE_BUCKET: booleanString,
    OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: booleanString,
    MAX_SOURCE_ASSET_BYTES: z.coerce
      .number()
      .int()
      .min(1_000_000)
      .max(536_870_912)
      .default(262_144_000),
    YOUTUBE_OAUTH_ENABLED: booleanString,
    YOUTUBE_OAUTH_CLIENT_ID: optionalSecret,
    YOUTUBE_OAUTH_CLIENT_SECRET: optionalSecret,
    YOUTUBE_OAUTH_STATE_SECRET: optionalStateSecret,
    YOUTUBE_TEST_FAULT: z
      .enum(["none", "timeout", "quota", "oauth_expired", "processing_failed", "ambiguous_upload"])
      .default("none"),
    OAUTH_TOKEN_VAULT_PROVIDER: z.enum(["local", "tencent_kms"]).default("local"),
    OAUTH_TOKEN_ENCRYPTION_KEY: optionalEncryptionKey,
  })
  .superRefine((value, context) => {
    if (value.IDENTITY_PROVIDER === "cognito") {
      if (!value.COGNITO_USER_POOL_ID) {
        context.addIssue({
          code: "custom",
          path: ["COGNITO_USER_POOL_ID"],
          message: "Required for Cognito",
        });
      }
      if (!value.COGNITO_CLIENT_ID) {
        context.addIssue({
          code: "custom",
          path: ["COGNITO_CLIENT_ID"],
          message: "Required for Cognito",
        });
      }
    }
    if (value.IDENTITY_PROVIDER === "ciam") {
      if (!value.CIAM_ISSUER) {
        context.addIssue({
          code: "custom",
          path: ["CIAM_ISSUER"],
          message: "Required for Tencent Cloud CIAM",
        });
      }
      if (!value.CIAM_CLIENT_ID) {
        context.addIssue({
          code: "custom",
          path: ["CIAM_CLIENT_ID"],
          message: "Required for Tencent Cloud CIAM",
        });
      }
    }
    if (value.APP_ENV === "staging" || value.APP_ENV === "production") {
      if (value.IDENTITY_PROVIDER !== "ciam" || value.ALLOW_TEST_IDENTITY) {
        context.addIssue({
          code: "custom",
          path: ["IDENTITY_PROVIDER"],
          message: "Deployed environments require Tencent Cloud CIAM and disable test identity",
        });
      }
      if (!value.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION) {
        context.addIssue({
          code: "custom",
          path: ["OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION"],
          message: "Deployed environments require server-side object encryption",
        });
      }
    }
    if (value.APP_ENV === "production") {
      if (!value.APP_BASE_URL.startsWith("https://")) {
        context.addIssue({
          code: "custom",
          path: ["APP_BASE_URL"],
          message: "Production requires HTTPS",
        });
      }
      for (const [key, entry] of Object.entries({
        TERMS_VERSION: value.TERMS_VERSION,
        PRIVACY_VERSION: value.PRIVACY_VERSION,
        DATA_PURPOSE_VERSION: value.DATA_PURPOSE_VERSION,
      })) {
        if (entry !== productionPolicy.version) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `Production requires policy version ${productionPolicy.version}`,
          });
        }
      }
      for (const [key, actual, expected] of [
        ["TERMS_URL", value.TERMS_URL, productionPolicy.termsUrl],
        ["PRIVACY_URL", value.PRIVACY_URL, productionPolicy.privacyUrl],
      ] as const) {
        if (actual !== expected) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `Production requires the official same-domain policy URL ${expected}`,
          });
        }
      }
    }
    if (value.YOUTUBE_OAUTH_ENABLED) {
      for (const key of [
        "YOUTUBE_OAUTH_CLIENT_ID",
        "YOUTUBE_OAUTH_CLIENT_SECRET",
        "YOUTUBE_OAUTH_STATE_SECRET",
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required when YouTube OAuth is enabled",
          });
        }
      }
      if (value.OAUTH_TOKEN_VAULT_PROVIDER === "local" && !value.OAUTH_TOKEN_ENCRYPTION_KEY) {
        context.addIssue({
          code: "custom",
          path: ["OAUTH_TOKEN_ENCRYPTION_KEY"],
          message: "Required for the local OAuth token vault",
        });
      }
      if (
        (value.APP_ENV === "staging" || value.APP_ENV === "production") &&
        value.OAUTH_TOKEN_VAULT_PROVIDER !== "tencent_kms"
      ) {
        context.addIssue({
          code: "custom",
          path: ["OAUTH_TOKEN_VAULT_PROVIDER"],
          message: "Deployed YouTube OAuth requires the Tencent KMS token vault",
        });
      }
      const secretValues = [
        value.SESSION_COOKIE_SECRET,
        value.YOUTUBE_OAUTH_CLIENT_SECRET,
        value.YOUTUBE_OAUTH_STATE_SECRET,
        value.OAUTH_TOKEN_ENCRYPTION_KEY,
      ].filter((entry): entry is string => Boolean(entry));
      if (new Set(secretValues).size !== secretValues.length) {
        context.addIssue({
          code: "custom",
          path: ["YOUTUBE_OAUTH_STATE_SECRET"],
          message: "Session, OAuth client, state, and token-encryption secrets must be distinct",
        });
      }
    }
    if (
      value.YOUTUBE_TEST_FAULT !== "none" &&
      (value.APP_ENV !== "test" || !value.ALLOW_TEST_IDENTITY)
    ) {
      context.addIssue({
        code: "custom",
        path: ["YOUTUBE_TEST_FAULT"],
        message: "Deterministic YouTube faults are restricted to the test environment",
      });
    }
    if (
      value.OAUTH_TOKEN_ENCRYPTION_KEY &&
      !/^[A-Za-z0-9_-]{43}$/.test(value.OAUTH_TOKEN_ENCRYPTION_KEY)
    ) {
      context.addIssue({
        code: "custom",
        path: ["OAUTH_TOKEN_ENCRYPTION_KEY"],
        message: "Must be an unpadded base64url-encoded 256-bit key",
      });
    }
  });

export type AppConfig = z.infer<typeof schema>;

export function parseAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return schema.parse(environment);
}
