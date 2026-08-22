import {
  parseAppConfig,
  type AppConfig,
  type AssetStorage,
  type IdentityProvider,
  type TokenEnvelopeVault,
  type YouTubeOAuthProvider,
} from "@jingtang/application";
import { createDatabaseClient, type PrismaClient } from "@jingtang/db";
import {
  CognitoIdentityProvider,
  GoogleYouTubeOAuthProvider,
  LocalEnvelopeTokenVault,
  MockIdentityProvider,
  S3AssetStorage,
} from "@jingtang/integrations";

interface Runtime {
  readonly config: AppConfig;
  readonly db: PrismaClient;
  readonly identity: IdentityProvider;
  readonly assets: AssetStorage;
  readonly youtubeOAuth?: YouTubeOAuthProvider;
  readonly tokenVault?: TokenEnvelopeVault;
}

declare global {
  var __jingtangRuntime: Runtime | undefined;
}

export function getRuntime(): Runtime {
  if (globalThis.__jingtangRuntime) return globalThis.__jingtangRuntime;
  const config = parseAppConfig(process.env);
  if (config.IDENTITY_PROVIDER === "ciam") {
    throw new Error("tencent_ciam_identity_provider_not_configured");
  }
  if (config.YOUTUBE_OAUTH_ENABLED && config.OAUTH_TOKEN_VAULT_PROVIDER !== "local") {
    throw new Error("tencent_kms_oauth_token_vault_not_configured");
  }
  const db = createDatabaseClient(config.DATABASE_URL);
  const youtubeOAuth = config.YOUTUBE_OAUTH_ENABLED
    ? new GoogleYouTubeOAuthProvider({
        clientId: config.YOUTUBE_OAUTH_CLIENT_ID ?? "",
        clientSecret: config.YOUTUBE_OAUTH_CLIENT_SECRET ?? "",
      })
    : undefined;
  const tokenVault = config.YOUTUBE_OAUTH_ENABLED
    ? new LocalEnvelopeTokenVault(config.OAUTH_TOKEN_ENCRYPTION_KEY ?? "")
    : undefined;
  const runtime: Runtime = {
    config,
    db,
    identity:
      config.IDENTITY_PROVIDER === "cognito"
        ? new CognitoIdentityProvider(
            config.COGNITO_REGION,
            config.COGNITO_USER_POOL_ID ?? "",
            config.COGNITO_CLIENT_ID ?? "",
          )
        : new MockIdentityProvider({
            ...(config.APP_ENV === "local"
              ? {
                  storagePath:
                    config.LOCAL_IDENTITY_STORE_PATH ?? "../../.local/mock-identity.json",
                }
              : {}),
            resolveExistingProfile: async (email) => {
              const existing = await db.user.findUnique({
                where: { email },
                select: { cognitoSubject: true, email: true, name: true },
              });
              return existing
                ? {
                    subject: existing.cognitoSubject,
                    email: existing.email,
                    name: existing.name,
                  }
                : null;
            },
          }),
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
    ...(youtubeOAuth ? { youtubeOAuth } : {}),
    ...(tokenVault ? { tokenVault } : {}),
  };
  if (config.NODE_ENV !== "production") globalThis.__jingtangRuntime = runtime;
  return runtime;
}
