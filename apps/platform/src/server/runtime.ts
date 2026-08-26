import {
  parseAppConfig,
  type AppConfig,
  type AssetStorage,
  type FacebookOAuthProvider,
  type IdentityProvider,
  type TokenEnvelopeVault,
  type YouTubeOAuthProvider,
} from "@jingtang/application";
import { createDatabaseClient, type PrismaClient } from "@jingtang/db";
import {
  CognitoIdentityProvider,
  createTencentCiamIdentityProvider,
  createObjectStorageCredentials,
  createTokenEnvelopeVault,
  GoogleYouTubeOAuthProvider,
  MetaFacebookOAuthProvider,
  MockIdentityProvider,
  S3AssetStorage,
} from "@jingtang/integrations";

interface Runtime {
  readonly config: AppConfig;
  readonly db: PrismaClient;
  readonly identity: IdentityProvider;
  readonly assets: AssetStorage;
  readonly youtubeOAuth?: YouTubeOAuthProvider;
  readonly facebookOAuth?: FacebookOAuthProvider;
  readonly tokenVault?: TokenEnvelopeVault;
}

declare global {
  var __jingtangRuntime: Runtime | undefined;
}

export function getRuntime(): Runtime {
  if (globalThis.__jingtangRuntime) return globalThis.__jingtangRuntime;
  const config = parseAppConfig(process.env);
  const db = createDatabaseClient(config.DATABASE_URL);
  const youtubeOAuth = config.YOUTUBE_OAUTH_ENABLED
    ? new GoogleYouTubeOAuthProvider({
        clientId: config.YOUTUBE_OAUTH_CLIENT_ID ?? "",
        clientSecret: config.YOUTUBE_OAUTH_CLIENT_SECRET ?? "",
      })
    : undefined;
  const facebookOAuth = config.FACEBOOK_OAUTH_ENABLED
    ? new MetaFacebookOAuthProvider({
        appId: config.FACEBOOK_APP_ID ?? "",
        appSecret: config.FACEBOOK_APP_SECRET ?? "",
        loginConfigurationId: config.FACEBOOK_LOGIN_CONFIGURATION_ID ?? "",
        graphApiVersion: config.FACEBOOK_GRAPH_API_VERSION,
      })
    : undefined;
  const tokenVault =
    config.YOUTUBE_OAUTH_ENABLED || config.FACEBOOK_OAUTH_ENABLED
      ? createTokenEnvelopeVault(config)
      : undefined;
  const runtime: Runtime = {
    config,
    db,
    identity:
      config.IDENTITY_PROVIDER === "ciam"
        ? createTencentCiamIdentityProvider(config)
        : config.IDENTITY_PROVIDER === "cognito"
          ? new CognitoIdentityProvider(
              config.COGNITO_REGION,
              config.COGNITO_USER_POOL_ID ?? "",
              config.COGNITO_CLIENT_ID ?? "",
            )
          : new MockIdentityProvider({
              ...(config.APP_ENV === "local" || config.APP_ENV === "review"
                ? {
                    storagePath:
                      config.LOCAL_IDENTITY_STORE_PATH ?? "../../.local/mock-identity.json",
                  }
                : {}),
              selfServiceEnabled: config.APP_ENV !== "review",
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
      credentials: createObjectStorageCredentials(config),
      forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
      autoCreateBucket: config.OBJECT_STORAGE_AUTO_CREATE_BUCKET,
      serverSideEncryption: config.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION
        ? config.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE === "aes256"
          ? "AES256"
          : "bucket_default"
        : false,
      requestTimeoutMs: config.OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
    }),
    ...(youtubeOAuth ? { youtubeOAuth } : {}),
    ...(facebookOAuth ? { facebookOAuth } : {}),
    ...(tokenVault ? { tokenVault } : {}),
  };
  globalThis.__jingtangRuntime = runtime;
  return runtime;
}
