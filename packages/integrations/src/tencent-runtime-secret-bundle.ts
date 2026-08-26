import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Credential, DynamicCredential } from "tencentcloud-sdk-nodejs-common";

import {
  createTencentKmsClient,
  type TencentKmsClient,
} from "./tencent-kms-envelope-token-vault.js";
import { tencentCredentialToS3Provider, type S3Credentials } from "./tencent-cloud-credentials.js";

const algorithm = "aes-256-gcm";
const envelopePrefix = "jingtang-runtime-secrets:v1:";
const maximumPayloadBytes = 64 * 1024;

export type RuntimeSecretRole = "platform" | "dispatcher" | "worker";

const allowedKeys = {
  platform: [
    "DATABASE_URL",
    "CIAM_CLIENT_SECRET",
    "SESSION_COOKIE_SECRET",
    "YOUTUBE_OAUTH_CLIENT_SECRET",
    "YOUTUBE_OAUTH_STATE_SECRET",
    "FACEBOOK_APP_SECRET",
    "FACEBOOK_OAUTH_STATE_SECRET",
  ],
  dispatcher: ["DATABASE_WORKER_URL", "TDMQ_AMQP_URL"],
  worker: [
    "DATABASE_WORKER_URL",
    "YOUTUBE_OAUTH_CLIENT_SECRET",
    "FACEBOOK_APP_SECRET",
    "TDMQ_AMQP_URL",
  ],
} as const satisfies Record<RuntimeSecretRole, readonly string[]>;

interface RuntimeSecretEnvelopeV1 {
  readonly v: 1;
  readonly role: RuntimeSecretRole;
  readonly objectKey: string;
  readonly bundleVersion: string;
  readonly createdAt: string;
  readonly keyId: string;
  readonly ciphertextBlob: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly tag: string;
}

export interface RuntimeSecretObjectStore {
  put(input: {
    readonly objectKey: string;
    readonly body: string;
  }): Promise<{ readonly versionId?: string }>;
  get(input: { readonly objectKey: string; readonly versionId: string }): Promise<string>;
}

function objectKey(role: RuntimeSecretRole): string {
  return `${role}/runtime.enc`;
}

function encryptionContext(role: RuntimeSecretRole, key: string, bundleVersion: string): string {
  return JSON.stringify({
    purpose: "jingtang-runtime-secrets",
    role,
    object_key: key,
    bundle_version: bundleVersion,
  });
}

function associatedData(role: RuntimeSecretRole, key: string, bundleVersion: string): Buffer {
  return Buffer.from(`jingtang.runtime-secrets.v1:${role}:${key}:${bundleVersion}`, "utf8");
}

function parseRole(value: string | undefined): RuntimeSecretRole {
  if (value === "platform" || value === "dispatcher" || value === "worker") return value;
  throw new Error("runtime_secret_bundle_role_invalid");
}

function parsePayload(value: unknown, role: RuntimeSecretRole): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("runtime_secret_bundle_payload_invalid");
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > allowedKeys[role].length) {
    throw new Error("runtime_secret_bundle_payload_invalid");
  }
  const permitted = new Set<string>(allowedKeys[role]);
  const payload: Record<string, string> = {};
  for (const [key, entry] of entries) {
    if (!permitted.has(key) || typeof entry !== "string" || entry.length === 0) {
      throw new Error("runtime_secret_bundle_payload_invalid");
    }
    payload[key] = entry;
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > maximumPayloadBytes) {
    throw new Error("runtime_secret_bundle_payload_too_large");
  }
  return payload;
}

function parseEnvelope(serialized: string): RuntimeSecretEnvelopeV1 {
  if (!serialized.startsWith(envelopePrefix)) {
    throw new Error("runtime_secret_bundle_envelope_invalid");
  }
  const value = JSON.parse(
    Buffer.from(serialized.slice(envelopePrefix.length), "base64url").toString("utf8"),
  ) as Partial<RuntimeSecretEnvelopeV1>;
  if (
    value.v !== 1 ||
    (value.role !== "platform" && value.role !== "dispatcher" && value.role !== "worker") ||
    typeof value.objectKey !== "string" ||
    typeof value.bundleVersion !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.keyId !== "string" ||
    typeof value.ciphertextBlob !== "string" ||
    typeof value.iv !== "string" ||
    typeof value.ciphertext !== "string" ||
    typeof value.tag !== "string"
  ) {
    throw new Error("runtime_secret_bundle_envelope_invalid");
  }
  return value as RuntimeSecretEnvelopeV1;
}

function encodeEnvelope(value: RuntimeSecretEnvelopeV1): string {
  return `${envelopePrefix}${Buffer.from(JSON.stringify(value), "utf8").toString("base64url")}`;
}

export class S3RuntimeSecretObjectStore implements RuntimeSecretObjectStore {
  readonly #bucket: string;
  readonly #client: S3Client;
  readonly #requestTimeoutMs: number;

  public constructor(input: {
    readonly bucket: string;
    readonly region: string;
    readonly endpoint: string;
    readonly credentials: S3Credentials;
    readonly requestTimeoutMs?: number;
  }) {
    this.#bucket = input.bucket;
    this.#requestTimeoutMs = input.requestTimeoutMs ?? 30_000;
    this.#client = new S3Client({
      region: input.region,
      endpoint: input.endpoint,
      credentials: input.credentials,
      forcePathStyle: false,
    });
  }

  public async put(input: {
    readonly objectKey: string;
    readonly body: string;
  }): Promise<{ readonly versionId?: string }> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.#requestTimeoutMs);
    try {
      const result = await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: input.objectKey,
          Body: input.body,
          ContentType: "application/vnd.jingtang.runtime-secrets+json",
        }),
        { abortSignal: abort.signal },
      );
      return result.VersionId ? { versionId: result.VersionId } : {};
    } finally {
      clearTimeout(timeout);
    }
  }

  public async get(input: {
    readonly objectKey: string;
    readonly versionId: string;
  }): Promise<string> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.#requestTimeoutMs);
    try {
      const result = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: input.objectKey,
          VersionId: input.versionId,
        }),
        { abortSignal: abort.signal },
      );
      if (!result.Body) throw new Error("runtime_secret_bundle_body_missing");
      return result.Body.transformToString("utf8");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function publishRuntimeSecretBundle(input: {
  readonly role: RuntimeSecretRole;
  readonly payload: unknown;
  readonly masterKeyId: string;
  readonly kms: TencentKmsClient;
  readonly store: RuntimeSecretObjectStore;
}): Promise<{
  readonly objectKey: string;
  readonly versionId: string;
  readonly bundleVersion: string;
}> {
  const payload = parsePayload(input.payload, input.role);
  const key = objectKey(input.role);
  const bundleVersion = randomUUID();
  const context = encryptionContext(input.role, key, bundleVersion);
  let dataKey: Buffer | undefined;
  try {
    const generated = await input.kms.GenerateDataKey({
      KeyId: input.masterKeyId,
      KeySpec: "AES_256",
      EncryptionContext: context,
      IsHostedByKms: 0,
      ParametersValidTo: 0,
    });
    if (!generated.Plaintext || !generated.CiphertextBlob) {
      throw new Error("runtime_secret_bundle_data_key_invalid");
    }
    dataKey = Buffer.from(generated.Plaintext, "base64");
    if (dataKey.byteLength !== 32) throw new Error("runtime_secret_bundle_data_key_invalid");
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, dataKey, iv);
    cipher.setAAD(associatedData(input.role, key, bundleVersion));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
      cipher.final(),
    ]);
    const body = encodeEnvelope({
      v: 1,
      role: input.role,
      objectKey: key,
      bundleVersion,
      createdAt: new Date().toISOString(),
      keyId: generated.KeyId ?? input.masterKeyId,
      ciphertextBlob: generated.CiphertextBlob,
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    });
    const published = await input.store.put({ objectKey: key, body });
    if (!published.versionId) throw new Error("runtime_secret_bundle_version_id_missing");
    return { objectKey: key, versionId: published.versionId, bundleVersion };
  } finally {
    dataKey?.fill(0);
  }
}

export async function decryptRuntimeSecretBundle(input: {
  readonly role: RuntimeSecretRole;
  readonly serialized: string;
  readonly kms: TencentKmsClient;
}): Promise<Record<string, string>> {
  const envelope = parseEnvelope(input.serialized);
  const key = objectKey(input.role);
  if (envelope.role !== input.role || envelope.objectKey !== key) {
    throw new Error("runtime_secret_bundle_scope_mismatch");
  }
  const decrypted = await input.kms.Decrypt({
    CiphertextBlob: envelope.ciphertextBlob,
    EncryptionContext: encryptionContext(input.role, key, envelope.bundleVersion),
  });
  if (!decrypted.Plaintext || (decrypted.KeyId && decrypted.KeyId !== envelope.keyId)) {
    throw new Error("runtime_secret_bundle_decrypt_invalid");
  }
  const dataKey = Buffer.from(decrypted.Plaintext, "base64");
  try {
    if (dataKey.byteLength !== 32) throw new Error("runtime_secret_bundle_data_key_invalid");
    const decipher = createDecipheriv(algorithm, dataKey, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(associatedData(input.role, key, envelope.bundleVersion));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]);
    try {
      return parsePayload(JSON.parse(plaintext.toString("utf8")), input.role);
    } finally {
      plaintext.fill(0);
    }
  } finally {
    dataKey.fill(0);
  }
}

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key];
  if (!value) throw new Error(`runtime_secret_bundle_bootstrap_${key.toLowerCase()}_required`);
  return value;
}

export async function loadRuntimeSecretBundle(
  environment: NodeJS.ProcessEnv,
  expectedRole: RuntimeSecretRole,
  dependencies?: {
    readonly kms: TencentKmsClient;
    readonly store: RuntimeSecretObjectStore;
  },
): Promise<void> {
  if (environment.RUNTIME_SECRET_BUNDLE_ENABLED !== "true") return;
  const role = parseRole(environment.RUNTIME_SECRET_BUNDLE_ROLE);
  if (role !== expectedRole) throw new Error("runtime_secret_bundle_process_role_mismatch");
  if (
    !dependencies &&
    (environment.APP_ENV === "staging" || environment.APP_ENV === "production") &&
    environment.TENCENT_CREDENTIAL_PROVIDER !== "cvm_role"
  ) {
    throw new Error("runtime_secret_bundle_cvm_role_required");
  }
  const bucket = required(environment, "RUNTIME_SECRET_BUNDLE_BUCKET");
  const versionId = required(environment, "RUNTIME_SECRET_BUNDLE_VERSION_ID");
  const region = required(environment, "RUNTIME_SECRET_BUNDLE_REGION");
  const endpoint = required(environment, "RUNTIME_SECRET_BUNDLE_ENDPOINT");
  let kms = dependencies?.kms;
  let store = dependencies?.store;
  if (!kms || !store) {
    const { CvmRoleCredential } = await import("tencentcloud-sdk-nodejs-common");
    const credential = new CvmRoleCredential();
    kms = createTencentKmsClient({ region, credential });
    store = new S3RuntimeSecretObjectStore({
      bucket,
      region,
      endpoint,
      credentials: tencentCredentialToS3Provider(credential),
    });
  }
  const payload = await decryptRuntimeSecretBundle({
    role,
    serialized: await store.get({ objectKey: objectKey(role), versionId }),
    kms,
  });
  for (const [key, value] of Object.entries(payload)) {
    if (environment[key]) throw new Error("runtime_secret_plaintext_environment_forbidden");
    environment[key] = value;
  }
}

export function createRuntimeSecretPublisherDependencies(input: {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint: string;
  readonly credential: Credential | DynamicCredential;
}): { readonly kms: TencentKmsClient; readonly store: RuntimeSecretObjectStore } {
  let credentials: S3Credentials;
  if ("getCredential" in input.credential) {
    credentials = tencentCredentialToS3Provider(input.credential);
  } else {
    if (!input.credential.secretId || !input.credential.secretKey) {
      throw new Error("runtime_secret_publisher_credentials_invalid");
    }
    credentials = {
      accessKeyId: input.credential.secretId,
      secretAccessKey: input.credential.secretKey,
      ...(input.credential.token ? { sessionToken: input.credential.token } : {}),
    };
  }
  return {
    kms: createTencentKmsClient({ region: input.region, credential: input.credential }),
    store: new S3RuntimeSecretObjectStore({
      bucket: input.bucket,
      region: input.region,
      endpoint: input.endpoint,
      credentials,
    }),
  };
}
