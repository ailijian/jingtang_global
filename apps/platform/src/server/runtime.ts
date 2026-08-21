import {
  parseAppConfig,
  type AppConfig,
  type AssetStorage,
  type IdentityProvider,
} from "@jingtang/application";
import { createDatabaseClient, type PrismaClient } from "@jingtang/db";
import {
  CognitoIdentityProvider,
  MockIdentityProvider,
  S3AssetStorage,
} from "@jingtang/integrations";

interface Runtime {
  readonly config: AppConfig;
  readonly db: PrismaClient;
  readonly identity: IdentityProvider;
  readonly assets: AssetStorage;
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
    assets: new S3AssetStorage({
      ...(config.OBJECT_STORAGE_ENDPOINT ? { endpoint: config.OBJECT_STORAGE_ENDPOINT } : {}),
      region: config.OBJECT_STORAGE_REGION,
      bucket: config.OBJECT_STORAGE_BUCKET,
      accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
      autoCreateBucket: config.OBJECT_STORAGE_AUTO_CREATE_BUCKET,
      serverSideEncryption: config.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION,
    }),
  };
  if (config.NODE_ENV !== "production") globalThis.__jingtangRuntime = runtime;
  return runtime;
}
