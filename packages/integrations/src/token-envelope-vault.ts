import type { AppConfig, TokenEnvelopeVault } from "@jingtang/application";

import { LocalEnvelopeTokenVault } from "./local-envelope-token-vault.js";
import {
  createObjectStorageCredentials,
  createTencentCredential,
} from "./tencent-cloud-credentials.js";
import {
  createTencentKmsClient,
  S3WrappedDataKeyStore,
  TencentKmsEnvelopeTokenVault,
} from "./tencent-kms-envelope-token-vault.js";

export function createTokenEnvelopeVault(config: AppConfig): TokenEnvelopeVault {
  if (config.OAUTH_TOKEN_VAULT_PROVIDER === "local") {
    return new LocalEnvelopeTokenVault(
      config.OAUTH_TOKEN_ENCRYPTION_KEY ?? "",
      config.LOCAL_TOKEN_KEY_STORE_PATH,
    );
  }

  return new TencentKmsEnvelopeTokenVault({
    kms: createTencentKmsClient({
      region: config.TENCENT_KMS_REGION,
      credential: createTencentCredential(config),
      ...(config.TENCENT_KMS_ENDPOINT ? { endpoint: config.TENCENT_KMS_ENDPOINT } : {}),
    }),
    masterKeyId: config.TENCENT_KMS_KEY_ID ?? "",
    keyStore: new S3WrappedDataKeyStore({
      ...(config.OBJECT_STORAGE_ENDPOINT ? { endpoint: config.OBJECT_STORAGE_ENDPOINT } : {}),
      region: config.OBJECT_STORAGE_REGION,
      bucket: config.OAUTH_TOKEN_KEY_STORAGE_BUCKET ?? "",
      credentials: createObjectStorageCredentials(config),
      forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
      requestTimeoutMs: config.OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
    }),
  });
}
