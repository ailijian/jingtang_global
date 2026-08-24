import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ApplicationError, type TokenEnvelopeVault } from "@jingtang/application";
import type { Credential, DynamicCredential } from "tencentcloud-sdk-nodejs-common";
import { kms } from "tencentcloud-sdk-nodejs-kms";

import type { S3Credentials } from "./tencent-cloud-credentials.js";

const algorithm = "aes-256-gcm";
const envelopePrefix = "tencent-kms:v1:";
const objectReferencePrefix = "tencent-kms-key:";
const versionedKeyReferencePrefix = "tencent-kms-key:v2:";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface TokenCiphertextV1 {
  readonly v: 1;
  readonly dataIv: string;
  readonly ciphertext: string;
  readonly dataTag: string;
}

interface WrappedDataKeyV1 {
  readonly v: 1;
  readonly keyId: string;
  readonly ciphertextBlob: string;
}

export interface TencentKmsClient {
  GenerateDataKey(input: {
    readonly KeyId: string;
    readonly KeySpec: "AES_256";
    readonly EncryptionContext: string;
    readonly IsHostedByKms: 0;
    readonly ParametersValidTo: 0;
  }): Promise<{
    readonly KeyId?: string;
    readonly Plaintext?: string;
    readonly CiphertextBlob?: string;
  }>;
  Decrypt(input: {
    readonly CiphertextBlob: string;
    readonly EncryptionContext: string;
  }): Promise<{ readonly KeyId?: string; readonly Plaintext?: string }>;
}

export interface WrappedDataKeyStore {
  put(objectReference: string, value: string): Promise<{ readonly versionId: string }>;
  get(objectReference: string, versionId: string): Promise<string | null>;
  delete(objectReference: string, versionId: string): Promise<void>;
}

interface VersionedKeyLocator {
  readonly objectReference: string;
  readonly versionId: string;
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function versionedKeyReference(objectReference: string, versionId: string): string {
  const objectId = objectReference.slice(objectReferencePrefix.length);
  if (!uuidPattern.test(objectId) || versionId.length === 0)
    throw new Error("key_reference_invalid");
  return `${versionedKeyReferencePrefix}${objectId}:${Buffer.from(versionId, "utf8").toString("base64url")}`;
}

function parseVersionedKeyReference(keyReference: string): VersionedKeyLocator {
  if (!keyReference.startsWith(versionedKeyReferencePrefix)) {
    throw new Error("key_reference_invalid");
  }
  const separator = keyReference.indexOf(":", versionedKeyReferencePrefix.length);
  if (separator === -1) throw new Error("key_reference_invalid");
  const objectId = keyReference.slice(versionedKeyReferencePrefix.length, separator);
  const encodedVersionId = keyReference.slice(separator + 1);
  if (!uuidPattern.test(objectId) || !/^[A-Za-z0-9_-]+$/u.test(encodedVersionId)) {
    throw new Error("key_reference_invalid");
  }
  const versionId = Buffer.from(encodedVersionId, "base64url").toString("utf8");
  if (
    versionId.length === 0 ||
    Buffer.from(versionId, "utf8").toString("base64url") !== encodedVersionId
  ) {
    throw new Error("key_reference_invalid");
  }
  return { objectReference: `${objectReferencePrefix}${objectId}`, versionId };
}

function encryptionContext(keyReference: string): string {
  return JSON.stringify({ purpose: "jingtang-youtube-oauth", key_reference: keyReference });
}

function associatedData(keyReference: string): Buffer {
  return Buffer.from(`jingtang.oauth-token-envelope.tencent-kms.v1:${keyReference}`, "utf8");
}

function parseTokenCiphertext(serialized: string): TokenCiphertextV1 {
  if (!serialized.startsWith(envelopePrefix)) throw new Error("invalid_envelope");
  const value = JSON.parse(
    Buffer.from(serialized.slice(envelopePrefix.length), "base64url").toString("utf8"),
  ) as Partial<TokenCiphertextV1>;
  if (
    value.v !== 1 ||
    typeof value.dataIv !== "string" ||
    typeof value.ciphertext !== "string" ||
    typeof value.dataTag !== "string"
  ) {
    throw new Error("invalid_envelope");
  }
  return value as TokenCiphertextV1;
}

function parseWrappedDataKey(serialized: string): WrappedDataKeyV1 {
  const value = JSON.parse(serialized) as Partial<WrappedDataKeyV1>;
  if (
    value.v !== 1 ||
    typeof value.keyId !== "string" ||
    value.keyId.length === 0 ||
    typeof value.ciphertextBlob !== "string" ||
    value.ciphertextBlob.length === 0
  ) {
    throw new Error("wrapped_key_invalid");
  }
  return value as WrappedDataKeyV1;
}

export class S3WrappedDataKeyStore implements WrappedDataKeyStore {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #prefix: string;
  readonly #requestTimeoutMs: number;

  constructor(input: {
    readonly endpoint?: string;
    readonly region: string;
    readonly bucket: string;
    readonly prefix?: string;
    readonly credentials: S3Credentials;
    readonly forcePathStyle: boolean;
    readonly requestTimeoutMs?: number;
  }) {
    this.#bucket = input.bucket;
    this.#prefix = input.prefix ?? "oauth-wrapped-keys/";
    this.#requestTimeoutMs = input.requestTimeoutMs ?? 30_000;
    this.#client = new S3Client({
      ...(input.endpoint ? { endpoint: input.endpoint } : {}),
      region: input.region,
      forcePathStyle: input.forcePathStyle,
      credentials: input.credentials,
    });
  }

  #objectKey(keyReference: string): string {
    if (!keyReference.startsWith(objectReferencePrefix)) throw new Error("key_reference_invalid");
    const objectId = keyReference.slice(objectReferencePrefix.length);
    if (!uuidPattern.test(objectId)) throw new Error("key_reference_invalid");
    return `${this.#prefix}${objectId}.json`;
  }

  async #withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  async put(objectReference: string, value: string): Promise<{ readonly versionId: string }> {
    const key = this.#objectKey(objectReference);
    const result = await this.#withTimeout((abortSignal) =>
      this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: value,
          ContentType: "application/json",
        }),
        { abortSignal },
      ),
    );
    if (!result.VersionId) {
      await this.#withTimeout((abortSignal) =>
        this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }), {
          abortSignal,
        }),
      ).catch(() => undefined);
      throw new Error("wrapped_key_version_id_missing");
    }
    return { versionId: result.VersionId };
  }

  async get(objectReference: string, versionId: string): Promise<string | null> {
    try {
      const result = await this.#withTimeout((abortSignal) =>
        this.#client.send(
          new GetObjectCommand({
            Bucket: this.#bucket,
            Key: this.#objectKey(objectReference),
            VersionId: versionId,
          }),
          { abortSignal },
        ),
      );
      if (!result.Body) throw new Error("wrapped_key_body_missing");
      return await result.Body.transformToString("utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" ||
          ("$metadata" in error &&
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ===
              404))
      ) {
        return null;
      }
      throw error;
    }
  }

  async delete(objectReference: string, versionId: string): Promise<void> {
    await this.#withTimeout((abortSignal) =>
      this.#client.send(
        new DeleteObjectCommand({
          Bucket: this.#bucket,
          Key: this.#objectKey(objectReference),
          VersionId: versionId,
        }),
        { abortSignal },
      ),
    );
  }
}

export function createTencentKmsClient(input: {
  readonly region: string;
  readonly credential: Credential | DynamicCredential;
  readonly endpoint?: string;
}): TencentKmsClient {
  return new kms.v20190118.Client({
    credential: input.credential,
    region: input.region,
    profile: {
      httpProfile: {
        reqMethod: "POST",
        reqTimeout: 30,
        endpoint: input.endpoint ?? "kms.tencentcloudapi.com",
      },
    },
  });
}

export class TencentKmsEnvelopeTokenVault implements TokenEnvelopeVault {
  readonly #kms: TencentKmsClient;
  readonly #masterKeyId: string;
  readonly #keyStore: WrappedDataKeyStore;

  constructor(input: {
    readonly kms: TencentKmsClient;
    readonly masterKeyId: string;
    readonly keyStore: WrappedDataKeyStore;
  }) {
    if (input.masterKeyId.trim().length === 0) throw new Error("kms_master_key_id_required");
    this.#kms = input.kms;
    this.#masterKeyId = input.masterKeyId;
    this.#keyStore = input.keyStore;
  }

  async seal(value: unknown): Promise<{ ciphertext: string; keyReference: string }> {
    const objectReference = `${objectReferencePrefix}${randomUUID()}`;
    let dataKey: Buffer | undefined;
    let storedVersionId: string | undefined;
    try {
      const generated = await this.#kms.GenerateDataKey({
        KeyId: this.#masterKeyId,
        KeySpec: "AES_256",
        EncryptionContext: encryptionContext(objectReference),
        IsHostedByKms: 0,
        ParametersValidTo: 0,
      });
      if (!generated.Plaintext || !generated.CiphertextBlob) {
        throw new Error("kms_data_key_response_invalid");
      }
      dataKey = Buffer.from(generated.Plaintext, "base64");
      if (dataKey.byteLength !== 32) throw new Error("kms_data_key_length_invalid");
      const stored = await this.#keyStore.put(
        objectReference,
        JSON.stringify({
          v: 1,
          keyId: generated.KeyId ?? this.#masterKeyId,
          ciphertextBlob: generated.CiphertextBlob,
        } satisfies WrappedDataKeyV1),
      );
      storedVersionId = stored.versionId;

      const dataIv = randomBytes(12);
      const cipher = createCipheriv(algorithm, dataKey, dataIv);
      cipher.setAAD(associatedData(objectReference));
      const plaintext = Buffer.from(JSON.stringify(value), "utf8");
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const serialized: TokenCiphertextV1 = {
        v: 1,
        dataIv: encode(dataIv),
        ciphertext: encode(ciphertext),
        dataTag: encode(cipher.getAuthTag()),
      };
      return {
        ciphertext: `${envelopePrefix}${Buffer.from(JSON.stringify(serialized)).toString("base64url")}`,
        keyReference: versionedKeyReference(objectReference, stored.versionId),
      };
    } catch {
      if (storedVersionId) {
        await this.#keyStore.delete(objectReference, storedVersionId).catch(() => undefined);
      }
      throw new ApplicationError(
        "service_unavailable",
        "OAuth token encryption is temporarily unavailable",
        503,
      );
    } finally {
      dataKey?.fill(0);
    }
  }

  async open<T>(serialized: string, keyReference: string | null): Promise<T> {
    let dataKey: Buffer | undefined;
    try {
      if (!keyReference) throw new Error("key_reference_invalid");
      const locator = parseVersionedKeyReference(keyReference);
      const parsed = parseTokenCiphertext(serialized);
      const stored = await this.#keyStore.get(locator.objectReference, locator.versionId);
      if (!stored) throw new Error("wrapped_key_missing");
      const wrapped = parseWrappedDataKey(stored);
      const decrypted = await this.#kms.Decrypt({
        CiphertextBlob: wrapped.ciphertextBlob,
        EncryptionContext: encryptionContext(locator.objectReference),
      });
      if (!decrypted.Plaintext) throw new Error("kms_decrypt_response_invalid");
      if (decrypted.KeyId && decrypted.KeyId !== wrapped.keyId) throw new Error("kms_key_mismatch");
      dataKey = Buffer.from(decrypted.Plaintext, "base64");
      if (dataKey.byteLength !== 32) throw new Error("kms_data_key_length_invalid");
      const decipher = createDecipheriv(algorithm, dataKey, decode(parsed.dataIv));
      decipher.setAAD(associatedData(locator.objectReference));
      decipher.setAuthTag(decode(parsed.dataTag));
      const plaintext = Buffer.concat([
        decipher.update(decode(parsed.ciphertext)),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(plaintext) as T;
    } catch (error) {
      if (error instanceof Error && error.message === "wrapped_key_missing") {
        throw new ApplicationError(
          "authentication_failed",
          "OAuth token key has been destroyed",
          500,
        );
      }
      if (
        error instanceof SyntaxError ||
        (error instanceof Error &&
          ["invalid_envelope", "key_reference_invalid", "wrapped_key_invalid"].includes(
            error.message,
          ))
      ) {
        throw new ApplicationError(
          "authentication_failed",
          "OAuth token envelope could not be authenticated",
          500,
        );
      }
      throw new ApplicationError(
        "service_unavailable",
        "OAuth token decryption is temporarily unavailable",
        503,
      );
    } finally {
      dataKey?.fill(0);
    }
  }

  async destroy(keyReference: string): Promise<void> {
    const locator = parseVersionedKeyReference(keyReference);
    try {
      await this.#keyStore.delete(locator.objectReference, locator.versionId);
    } catch {
      throw new ApplicationError(
        "service_unavailable",
        "OAuth token key deletion is temporarily unavailable",
        503,
      );
    }
  }
}
