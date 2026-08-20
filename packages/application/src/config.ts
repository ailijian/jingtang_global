import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    APP_BASE_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    DATABASE_ADMIN_URL: z.string().min(1).optional(),
    IDENTITY_PROVIDER: z.enum(["mock", "cognito"]),
    ALLOW_TEST_IDENTITY: booleanString,
    COGNITO_REGION: z.string().min(1).default("ap-southeast-1"),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    SESSION_COOKIE_SECRET: z.string().min(32),
    TERMS_VERSION: z.string().min(1),
    PRIVACY_VERSION: z.string().min(1),
    DATA_PURPOSE_VERSION: z.string().min(1),
    TERMS_URL: z.url(),
    PRIVACY_URL: z.url(),
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
    if (value.APP_ENV === "staging" || value.APP_ENV === "production") {
      if (value.IDENTITY_PROVIDER !== "cognito" || value.ALLOW_TEST_IDENTITY) {
        context.addIssue({
          code: "custom",
          path: ["IDENTITY_PROVIDER"],
          message: "Deployed environments require Cognito and disable test identity",
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
        if (entry.startsWith("d2-test-")) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Test policy versions cannot run in production",
          });
        }
      }
    }
  });

export type AppConfig = z.infer<typeof schema>;

export function parseAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return schema.parse(environment);
}
