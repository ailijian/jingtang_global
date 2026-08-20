import { parseAppConfig, type AppConfig, type IdentityProvider } from "@jingtang/application";
import { createDatabaseClient, type PrismaClient } from "@jingtang/db";
import { CognitoIdentityProvider, MockIdentityProvider } from "@jingtang/integrations";

interface Runtime {
  readonly config: AppConfig;
  readonly db: PrismaClient;
  readonly identity: IdentityProvider;
}

declare global {
  var __jingtangRuntime: Runtime | undefined;
}

export function getRuntime(): Runtime {
  if (globalThis.__jingtangRuntime) return globalThis.__jingtangRuntime;
  const config = parseAppConfig(process.env);
  const runtime: Runtime = {
    config,
    db: createDatabaseClient(config.DATABASE_URL),
    identity:
      config.IDENTITY_PROVIDER === "cognito"
        ? new CognitoIdentityProvider(
            config.COGNITO_REGION,
            config.COGNITO_USER_POOL_ID ?? "",
            config.COGNITO_CLIENT_ID ?? "",
          )
        : new MockIdentityProvider(),
  };
  if (config.NODE_ENV !== "production") globalThis.__jingtangRuntime = runtime;
  return runtime;
}
