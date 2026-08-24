import type { AppConfig } from "@jingtang/application";
import {
  CvmRoleCredential,
  type Credential,
  type DynamicCredential,
} from "tencentcloud-sdk-nodejs-common";

export interface S3CredentialIdentity {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export type S3Credentials = S3CredentialIdentity | (() => Promise<S3CredentialIdentity>);

function requireStatic(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name}_required`);
  return value;
}

export function createTencentCredential(config: AppConfig): Credential | DynamicCredential {
  if (config.TENCENT_CREDENTIAL_PROVIDER === "cvm_role") return new CvmRoleCredential();
  return {
    secretId: requireStatic(config.TENCENT_CLOUD_SECRET_ID, "tencent_cloud_secret_id"),
    secretKey: requireStatic(config.TENCENT_CLOUD_SECRET_KEY, "tencent_cloud_secret_key"),
  };
}

export function createObjectStorageCredentials(config: AppConfig): S3Credentials {
  if (config.TENCENT_CREDENTIAL_PROVIDER === "static") {
    return {
      accessKeyId: requireStatic(
        config.OBJECT_STORAGE_ACCESS_KEY_ID,
        "object_storage_access_key_id",
      ),
      secretAccessKey: requireStatic(
        config.OBJECT_STORAGE_SECRET_ACCESS_KEY,
        "object_storage_secret_access_key",
      ),
    };
  }
  return tencentCredentialToS3Provider(new CvmRoleCredential());
}

export function tencentCredentialToS3Provider(
  credential: DynamicCredential,
): () => Promise<S3CredentialIdentity> {
  return async () => {
    const temporary = await credential.getCredential();
    if (!temporary.secretId || !temporary.secretKey || !temporary.token) {
      throw new Error("tencent_temporary_credential_invalid");
    }
    return {
      accessKeyId: temporary.secretId,
      secretAccessKey: temporary.secretKey,
      sessionToken: temporary.token,
    };
  };
}
