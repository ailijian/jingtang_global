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

const optionalNumericId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().regex(/^\d+$/u).optional(),
);

const optionalEncryptionKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(43).optional(),
);

const productionPolicy = {
  version: "2026-08-26",
  termsUrl: "https://jingtangai.com/en/terms/",
  privacyUrl: "https://jingtangai.com/en/privacy/",
} as const;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "test", "review", "staging", "production"]).default("local"),
    APP_BASE_URL: z.url(),
    RUNTIME_SECRET_BUNDLE_ENABLED: booleanString,
    RUNTIME_SECRET_BUNDLE_ROLE: z.enum(["platform", "dispatcher", "worker"]).default("platform"),
    RUNTIME_SECRET_BUNDLE_BUCKET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).max(63).optional(),
    ),
    RUNTIME_SECRET_BUNDLE_VERSION_ID: optionalSecret,
    RUNTIME_SECRET_BUNDLE_REGION: z.string().min(1).default("ap-seoul"),
    RUNTIME_SECRET_BUNDLE_ENDPOINT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    DATABASE_URL: z.string().min(1),
    DATABASE_ADMIN_URL: z.string().min(1).optional(),
    DATABASE_WORKER_URL: z.string().min(1).optional(),
    ASYNC_TRANSPORT: z.enum(["local", "tdmq_rabbitmq"]).default("local"),
    TDMQ_AMQP_URL: optionalSecret,
    TDMQ_EXCHANGE: z.string().min(1).default("jingtang.commands.v1"),
    TDMQ_QUEUE: z.string().min(1).default("jingtang.youtube.publish.v1"),
    TDMQ_DEAD_LETTER_EXCHANGE: z.string().min(1).default("jingtang.dead-letter.v1"),
    TDMQ_DEAD_LETTER_QUEUE: z.string().min(1).default("jingtang.youtube.publish.dlq.v1"),
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
    CIAM_CLIENT_SECRET: optionalSecret,
    CIAM_PASSWORD_AUTH_SOURCE_ID: optionalSecret,
    CIAM_USER_STORE_ID: optionalSecret,
    SESSION_COOKIE_SECRET: z.string().min(32),
    TERMS_VERSION: z.string().min(1),
    PRIVACY_VERSION: z.string().min(1),
    DATA_PURPOSE_VERSION: z.string().min(1),
    TERMS_URL: z.url(),
    PRIVACY_URL: z.url(),
    OBJECT_STORAGE_ENDPOINT: z.url().optional(),
    OBJECT_STORAGE_REGION: z.string().min(1).default("ap-seoul"),
    OBJECT_STORAGE_BUCKET: z.string().min(3).max(63),
    OBJECT_STORAGE_ACCESS_KEY_ID: optionalSecret,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: optionalSecret,
    OBJECT_STORAGE_FORCE_PATH_STYLE: booleanString,
    OBJECT_STORAGE_AUTO_CREATE_BUCKET: booleanString,
    OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: booleanString,
    OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE: z
      .enum(["aes256", "bucket_default"])
      .default("aes256"),
    OBJECT_STORAGE_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(15 * 60_000)
      .default(120_000),
    MAX_SOURCE_ASSET_BYTES: z.coerce
      .number()
      .int()
      .min(1_000_000)
      .max(524_288_000)
      .default(262_144_000),
    ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .min(0)
      .max(16_106_127_360)
      .default(0),
    YOUTUBE_OAUTH_ENABLED: booleanString,
    YOUTUBE_OAUTH_CLIENT_ID: optionalSecret,
    YOUTUBE_OAUTH_CLIENT_SECRET: optionalSecret,
    YOUTUBE_OAUTH_STATE_SECRET: optionalStateSecret,
    FACEBOOK_OAUTH_ENABLED: booleanString,
    FACEBOOK_APP_ID: optionalSecret,
    FACEBOOK_LOGIN_CONFIGURATION_ID: optionalNumericId,
    FACEBOOK_APP_SECRET: optionalSecret,
    FACEBOOK_OAUTH_STATE_SECRET: optionalStateSecret,
    FACEBOOK_GRAPH_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/u)
      .default("v26.0"),
    TIKTOK_OAUTH_ENABLED: booleanString,
    TIKTOK_CLIENT_KEY: optionalSecret,
    TIKTOK_CLIENT_SECRET: optionalSecret,
    TIKTOK_OAUTH_STATE_SECRET: optionalStateSecret,
    YOUTUBE_TEST_FAULT: z
      .enum(["none", "timeout", "quota", "oauth_expired", "processing_failed", "ambiguous_upload"])
      .default("none"),
    OAUTH_TOKEN_VAULT_PROVIDER: z.enum(["local", "tencent_kms"]).default("local"),
    OAUTH_TOKEN_ENCRYPTION_KEY: optionalEncryptionKey,
    LOCAL_TOKEN_KEY_STORE_PATH: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    TENCENT_CREDENTIAL_PROVIDER: z.enum(["static", "cvm_role"]).default("static"),
    TENCENT_CLOUD_SECRET_ID: optionalSecret,
    TENCENT_CLOUD_SECRET_KEY: optionalSecret,
    TENCENT_KMS_REGION: z.string().min(1).default("ap-seoul"),
    TENCENT_KMS_KEY_ID: optionalSecret,
    TENCENT_KMS_ENDPOINT: optionalSecret,
    OAUTH_TOKEN_KEY_STORAGE_BUCKET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).max(63).optional(),
    ),
  })
  .superRefine((value, context) => {
    if (value.TENCENT_CREDENTIAL_PROVIDER === "static") {
      for (const key of [
        "OBJECT_STORAGE_ACCESS_KEY_ID",
        "OBJECT_STORAGE_SECRET_ACCESS_KEY",
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required when static Tencent-compatible object-storage credentials are used",
          });
        }
      }
    }
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
    if (value.IDENTITY_PROVIDER === "ciam" && value.RUNTIME_SECRET_BUNDLE_ROLE === "platform") {
      if (!value.CIAM_ISSUER) {
        context.addIssue({
          code: "custom",
          path: ["CIAM_ISSUER"],
          message: "Required for Tencent Cloud CIAM",
        });
      }
      for (const key of [
        "CIAM_CLIENT_ID",
        "CIAM_CLIENT_SECRET",
        "CIAM_PASSWORD_AUTH_SOURCE_ID",
        "CIAM_USER_STORE_ID",
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required for Tencent Cloud CIAM",
          });
        }
      }
    }
    if (
      value.IDENTITY_PROVIDER === "ciam" &&
      value.RUNTIME_SECRET_BUNDLE_ROLE === "worker" &&
      !value.CIAM_USER_STORE_ID
    ) {
      context.addIssue({
        code: "custom",
        path: ["CIAM_USER_STORE_ID"],
        message: "Required for Tencent Cloud CIAM account deletion",
      });
    }
    if (
      value.APP_ENV === "review" ||
      value.APP_ENV === "staging" ||
      value.APP_ENV === "production"
    ) {
      for (const key of ["OBJECT_STORAGE_REGION", "RUNTIME_SECRET_BUNDLE_REGION"] as const) {
        if (value[key] !== "ap-seoul") {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Deployed Tencent resources are frozen to ap-seoul",
          });
        }
      }
    }
    if (value.FACEBOOK_OAUTH_ENABLED) {
      for (const key of [
        "FACEBOOK_APP_ID",
        "FACEBOOK_LOGIN_CONFIGURATION_ID",
        "FACEBOOK_APP_SECRET",
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required when Facebook OAuth is enabled",
          });
        }
      }
      if (value.RUNTIME_SECRET_BUNDLE_ROLE === "platform" && !value.FACEBOOK_OAUTH_STATE_SECRET) {
        context.addIssue({
          code: "custom",
          path: ["FACEBOOK_OAUTH_STATE_SECRET"],
          message: "Required for the Facebook OAuth web flow",
        });
      }
    }
    if (value.TIKTOK_OAUTH_ENABLED) {
      for (const key of ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required when TikTok OAuth is enabled",
          });
        }
      }
      if (value.RUNTIME_SECRET_BUNDLE_ROLE === "platform" && !value.TIKTOK_OAUTH_STATE_SECRET) {
        context.addIssue({
          code: "custom",
          path: ["TIKTOK_OAUTH_STATE_SECRET"],
          message: "Required for the TikTok Login Kit web flow",
        });
      }
    }
    if (
      (value.APP_ENV === "staging" || value.APP_ENV === "production") &&
      value.TENCENT_KMS_REGION !== "ap-seoul"
    ) {
      context.addIssue({
        code: "custom",
        path: ["TENCENT_KMS_REGION"],
        message: "Deployed Tencent KMS resources are frozen to ap-seoul",
      });
    }
    if (value.APP_ENV === "review") {
      if (value.APP_BASE_URL !== "https://review.jingtangai.com") {
        context.addIssue({
          code: "custom",
          path: ["APP_BASE_URL"],
          message: "The temporary review environment uses its dedicated HTTPS hostname",
        });
      }
      if (
        value.IDENTITY_PROVIDER !== "mock" ||
        value.ALLOW_TEST_IDENTITY ||
        !value.LOCAL_IDENTITY_STORE_PATH
      ) {
        context.addIssue({
          code: "custom",
          path: ["IDENTITY_PROVIDER"],
          message: "Review requires the protected file identity store with no synthetic identity",
        });
      }
      if (value.ASYNC_TRANSPORT !== "local" || !value.DATABASE_WORKER_URL) {
        context.addIssue({
          code: "custom",
          path: ["ASYNC_TRANSPORT"],
          message: "Review requires the single-worker PostgreSQL outbox profile",
        });
      }
      if (value.TENCENT_CREDENTIAL_PROVIDER !== "static" || value.RUNTIME_SECRET_BUNDLE_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["TENCENT_CREDENTIAL_PROVIDER"],
          message: "Review requires root-only static CAM secret files, not production credentials",
        });
      }
      if (
        !value.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION ||
        value.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE !== "bucket_default"
      ) {
        context.addIssue({
          code: "custom",
          path: ["OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE"],
          message: "Review requires the COS bucket encryption default",
        });
      }
      if (
        value.ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES < 1 ||
        value.ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES > 16_106_127_360
      ) {
        context.addIssue({
          code: "custom",
          path: ["ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES"],
          message: "Review requires an active Source Asset soft quota no greater than 15 GiB",
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
            message: `Review requires policy version ${productionPolicy.version}`,
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
            message: `Review requires the official same-domain policy URL ${expected}`,
          });
        }
      }
    }
    if (value.APP_ENV === "staging" || value.APP_ENV === "production") {
      if (value.TENCENT_CREDENTIAL_PROVIDER !== "cvm_role") {
        context.addIssue({
          code: "custom",
          path: ["TENCENT_CREDENTIAL_PROVIDER"],
          message: "Deployed environments require temporary credentials from a bound CVM role",
        });
      }
      if (!value.RUNTIME_SECRET_BUNDLE_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["RUNTIME_SECRET_BUNDLE_ENABLED"],
          message: "Deployed environments require the KMS-sealed COS runtime secret loader",
        });
      }
      for (const key of [
        "RUNTIME_SECRET_BUNDLE_BUCKET",
        "RUNTIME_SECRET_BUNDLE_VERSION_ID",
        "RUNTIME_SECRET_BUNDLE_ENDPOINT",
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required for the KMS-sealed COS runtime secret loader",
          });
        }
      }
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
      if (value.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE !== "bucket_default") {
        context.addIssue({
          code: "custom",
          path: ["OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE"],
          message: "Deployed environments require the Terraform-managed COS KMS bucket default",
        });
      }
      if (
        value.ASYNC_TRANSPORT !== "tdmq_rabbitmq" ||
        (value.RUNTIME_SECRET_BUNDLE_ROLE !== "platform" && !value.TDMQ_AMQP_URL)
      ) {
        context.addIssue({
          code: "custom",
          path: ["ASYNC_TRANSPORT"],
          message: "Deployed environments require the Tencent TDMQ RabbitMQ transport",
        });
      }
      if (value.RUNTIME_SECRET_BUNDLE_ROLE !== "platform" && !value.DATABASE_WORKER_URL) {
        context.addIssue({
          code: "custom",
          path: ["DATABASE_WORKER_URL"],
          message: "Deployed environments require a separate worker database role",
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
      for (const key of ["YOUTUBE_OAUTH_CLIENT_ID", "YOUTUBE_OAUTH_CLIENT_SECRET"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required when YouTube OAuth is enabled",
          });
        }
      }
      if (value.RUNTIME_SECRET_BUNDLE_ROLE === "platform" && !value.YOUTUBE_OAUTH_STATE_SECRET) {
        context.addIssue({
          code: "custom",
          path: ["YOUTUBE_OAUTH_STATE_SECRET"],
          message: "Required by the platform when YouTube OAuth is enabled",
        });
      }
    }
    if (value.YOUTUBE_OAUTH_ENABLED || value.FACEBOOK_OAUTH_ENABLED || value.TIKTOK_OAUTH_ENABLED) {
      if (value.OAUTH_TOKEN_VAULT_PROVIDER === "local" && !value.OAUTH_TOKEN_ENCRYPTION_KEY) {
        context.addIssue({
          code: "custom",
          path: ["OAUTH_TOKEN_ENCRYPTION_KEY"],
          message: "Required for the local OAuth token vault",
        });
      }
      if (value.OAUTH_TOKEN_VAULT_PROVIDER === "local" && !value.LOCAL_TOKEN_KEY_STORE_PATH) {
        context.addIssue({
          code: "custom",
          path: ["LOCAL_TOKEN_KEY_STORE_PATH"],
          message: "Required so the platform and worker share the local envelope-key store",
        });
      }
      if (
        (value.APP_ENV === "review" ||
          value.APP_ENV === "staging" ||
          value.APP_ENV === "production") &&
        value.OAUTH_TOKEN_VAULT_PROVIDER !== (value.APP_ENV === "review" ? "local" : "tencent_kms")
      ) {
        context.addIssue({
          code: "custom",
          path: ["OAUTH_TOKEN_VAULT_PROVIDER"],
          message:
            value.APP_ENV === "review"
              ? "The temporary review environment requires the local envelope token vault"
              : "Staging and production OAuth require the Tencent KMS token vault",
        });
      }
      if (value.OAUTH_TOKEN_VAULT_PROVIDER === "tencent_kms") {
        for (const key of ["TENCENT_KMS_KEY_ID", "OAUTH_TOKEN_KEY_STORAGE_BUCKET"] as const) {
          if (!value[key]) {
            context.addIssue({
              code: "custom",
              path: [key],
              message: "Required for the Tencent KMS OAuth token vault",
            });
          }
        }
        if (value.TENCENT_CREDENTIAL_PROVIDER === "static") {
          for (const key of ["TENCENT_CLOUD_SECRET_ID", "TENCENT_CLOUD_SECRET_KEY"] as const) {
            if (!value[key]) {
              context.addIssue({
                code: "custom",
                path: [key],
                message: "Required for static Tencent KMS credentials",
              });
            }
          }
        }
        if (value.OAUTH_TOKEN_KEY_STORAGE_BUCKET === value.OBJECT_STORAGE_BUCKET) {
          context.addIssue({
            code: "custom",
            path: ["OAUTH_TOKEN_KEY_STORAGE_BUCKET"],
            message: "OAuth wrapped data keys require a bucket separate from source assets",
          });
        }
      }
      const secretValues = [
        value.SESSION_COOKIE_SECRET,
        value.YOUTUBE_OAUTH_CLIENT_SECRET,
        value.YOUTUBE_OAUTH_STATE_SECRET,
        value.FACEBOOK_APP_SECRET,
        value.FACEBOOK_OAUTH_STATE_SECRET,
        value.TIKTOK_CLIENT_SECRET,
        value.TIKTOK_OAUTH_STATE_SECRET,
        value.OAUTH_TOKEN_ENCRYPTION_KEY,
      ].filter((entry): entry is string => Boolean(entry));
      if (new Set(secretValues).size !== secretValues.length) {
        context.addIssue({
          code: "custom",
          path: ["OAUTH_TOKEN_ENCRYPTION_KEY"],
          message: "Session, provider, state, and token-encryption secrets must be distinct",
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

export function usesSecureCookies(environment: AppConfig["APP_ENV"]): boolean {
  return environment === "review" || environment === "staging" || environment === "production";
}

export function allowsYouTubeTestOAuth(environment: AppConfig["APP_ENV"]): boolean {
  return environment === "local" || environment === "test" || environment === "review";
}

export function allowsFacebookReviewOAuth(environment: AppConfig["APP_ENV"]): boolean {
  return environment === "local" || environment === "test" || environment === "review";
}

export function allowsTikTokReviewOAuth(environment: AppConfig["APP_ENV"]): boolean {
  return environment === "local" || environment === "test" || environment === "review";
}
