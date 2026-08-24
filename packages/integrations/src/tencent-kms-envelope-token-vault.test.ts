import { randomBytes } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  S3WrappedDataKeyStore,
  TencentKmsEnvelopeTokenVault,
  type TencentKmsClient,
  type WrappedDataKeyStore,
} from "./tencent-kms-envelope-token-vault.js";

class MemoryKeyStore implements WrappedDataKeyStore {
  readonly values = new Map<string, Map<string, string>>();
  readonly deleted: { readonly objectReference: string; readonly versionId: string }[] = [];
  #version = 0;
  put(objectReference: string, value: string): Promise<{ readonly versionId: string }> {
    const versionId = `version-${++this.#version}`;
    this.values.set(objectReference, new Map([[versionId, value]]));
    return Promise.resolve({ versionId });
  }
  get(objectReference: string, versionId: string): Promise<string | null> {
    return Promise.resolve(this.values.get(objectReference)?.get(versionId) ?? null);
  }
  delete(objectReference: string, versionId: string): Promise<void> {
    this.deleted.push({ objectReference, versionId });
    const versions = this.values.get(objectReference);
    versions?.delete(versionId);
    if (versions?.size === 0) this.values.delete(objectReference);
    return Promise.resolve();
  }
}

class FakeKms implements TencentKmsClient {
  readonly wrapped = new Map<string, { key: string; context: string }>();
  GenerateDataKey(input: Parameters<TencentKmsClient["GenerateDataKey"]>[0]) {
    const key = randomBytes(32).toString("base64");
    const wrapped = randomBytes(32).toString("base64url");
    this.wrapped.set(wrapped, { key, context: input.EncryptionContext });
    return Promise.resolve({ KeyId: input.KeyId, Plaintext: key, CiphertextBlob: wrapped });
  }
  Decrypt(input: Parameters<TencentKmsClient["Decrypt"]>[0]) {
    const entry = this.wrapped.get(input.CiphertextBlob);
    if (!entry || entry.context !== input.EncryptionContext) throw new Error("kms_rejected");
    return Promise.resolve({ KeyId: "kms-master-key", Plaintext: entry.key });
  }
}

function createVault() {
  const kms = new FakeKms();
  const keyStore = new MemoryKeyStore();
  return {
    keyStore,
    vault: new TencentKmsEnvelopeTokenVault({
      kms,
      masterKeyId: "kms-master-key",
      keyStore,
    }),
  };
}

describe("Tencent KMS envelope token vault", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips without storing a plaintext token or plaintext data key", async () => {
    const { vault, keyStore } = createVault();
    const envelope = await vault.seal({ refreshToken: "production-refresh-token" });
    expect(envelope.ciphertext).not.toContain("production-refresh-token");
    expect(envelope.keyReference).toMatch(/^tencent-kms-key:v2:/u);
    expect([...keyStore.values.values()].flatMap((versions) => [...versions.values()])).not.toEqual(
      expect.arrayContaining([expect.stringContaining("production-refresh-token")]),
    );
    await expect(vault.open(envelope.ciphertext, envelope.keyReference)).resolves.toEqual({
      refreshToken: "production-refresh-token",
    });
  });

  it("binds the encrypted data key and token envelope to its key reference", async () => {
    const { vault } = createVault();
    const first = await vault.seal({ accessToken: "one" });
    const second = await vault.seal({ accessToken: "two" });
    await expect(vault.open(first.ciphertext, second.keyReference)).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });

  it("cryptographically erases a token by deleting its separately stored wrapped key", async () => {
    const { vault, keyStore } = createVault();
    const envelope = await vault.seal({ accessToken: "erase-me" });
    await vault.destroy(envelope.keyReference);
    expect(keyStore.values.size).toBe(0);
    expect(keyStore.deleted).toHaveLength(1);
    expect(keyStore.deleted[0]?.versionId).toBe("version-1");
    await expect(vault.open(envelope.ciphertext, envelope.keyReference)).rejects.toMatchObject({
      code: "authentication_failed",
    });
  });

  it("rejects a modified token envelope", async () => {
    const { vault } = createVault();
    const envelope = await vault.seal({ accessToken: "protected" });
    const replacement = envelope.ciphertext.endsWith("A") ? "B" : "A";
    await expect(
      vault.open(`${envelope.ciphertext.slice(0, -1)}${replacement}`, envelope.keyReference),
    ).rejects.toMatchObject({ code: "authentication_failed" });
  });

  it("uses the COS KMS bucket default and addresses the exact wrapped-key version", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");
    send
      .mockResolvedValueOnce({ VersionId: "cos-version/1" } as never)
      .mockResolvedValueOnce({
        Body: { transformToString: () => Promise.resolve('{"v":1}') },
      } as never)
      .mockResolvedValueOnce({} as never);
    const store = new S3WrappedDataKeyStore({
      endpoint: "https://cos.ap-seoul.myqcloud.com",
      region: "ap-seoul",
      bucket: "jingtang-oauth-keys",
      credentials: { accessKeyId: "test-id", secretAccessKey: "test-key" },
      forcePathStyle: false,
    });

    await expect(
      store.put("tencent-kms-key:11111111-1111-4111-8111-111111111111", "{}"),
    ).resolves.toEqual({ versionId: "cos-version/1" });
    await store.get("tencent-kms-key:11111111-1111-4111-8111-111111111111", "cos-version/1");
    await store.delete("tencent-kms-key:11111111-1111-4111-8111-111111111111", "cos-version/1");

    const put = send.mock.calls[0]?.[0];
    const get = send.mock.calls[1]?.[0];
    const deletion = send.mock.calls[2]?.[0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect((put as PutObjectCommand).input.ServerSideEncryption).toBeUndefined();
    expect(get).toBeInstanceOf(GetObjectCommand);
    expect((get as GetObjectCommand).input.VersionId).toBe("cos-version/1");
    expect(deletion).toBeInstanceOf(DeleteObjectCommand);
    expect((deletion as DeleteObjectCommand).input.VersionId).toBe("cos-version/1");
  });
});
