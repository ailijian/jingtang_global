import { createCipheriv, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LocalEnvelopeTokenVault } from "./local-envelope-token-vault.js";

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function legacyEnvelope(value: unknown): string {
  const keyEncryptionKey = Buffer.from(key, "base64url");
  const dataKey = randomBytes(32);
  const wrapIv = randomBytes(12);
  const dataIv = randomBytes(12);
  const aad = Buffer.from("jingtang.oauth-token-envelope.v1", "utf8");
  const wrapCipher = createCipheriv("aes-256-gcm", keyEncryptionKey, wrapIv);
  wrapCipher.setAAD(aad);
  const wrappedKey = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);
  const dataCipher = createCipheriv("aes-256-gcm", dataKey, dataIv);
  dataCipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    dataCipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    dataCipher.final(),
  ]);
  const encode = (entry: Uint8Array): string => Buffer.from(entry).toString("base64url");
  return `local:v1:${Buffer.from(
    JSON.stringify({
      v: 1,
      wrapIv: encode(wrapIv),
      wrappedKey: encode(wrappedKey),
      wrapTag: encode(wrapCipher.getAuthTag()),
      dataIv: encode(dataIv),
      ciphertext: encode(ciphertext),
      dataTag: encode(dataCipher.getAuthTag()),
    }),
    "utf8",
  ).toString("base64url")}`;
}

describe("local envelope token vault", () => {
  it("round-trips a token without placing plaintext in the envelope", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const envelope = await vault.seal({ refreshToken: "refresh-token-value" });
    expect(envelope.ciphertext).not.toContain("refresh-token-value");
    await expect(vault.open(envelope.ciphertext, envelope.keyReference)).resolves.toEqual({
      refreshToken: "refresh-token-value",
    });
  });

  it("uses a fresh data key and nonce for every sealed value", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const first = await vault.seal({ accessToken: "same-token" });
    const second = await vault.seal({ accessToken: "same-token" });
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.keyReference).not.toBe(second.keyReference);
  });

  it("opens a D5 local:v1 envelope without a detached key reference", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const envelope = legacyEnvelope({ refreshToken: "d5-refresh-token" });
    await expect(vault.open(envelope, null)).resolves.toEqual({
      refreshToken: "d5-refresh-token",
    });
  });

  it("rejects a tampered envelope", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const envelope = await vault.seal({ accessToken: "access-token" });
    const replacement = envelope.ciphertext.endsWith("A") ? "B" : "A";
    await expect(
      vault.open(`${envelope.ciphertext.slice(0, -1)}${replacement}`, envelope.keyReference),
    ).rejects.toMatchObject({ code: "authentication_failed" });
  });

  it("cryptographically erases a sealed value by destroying its data key", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const envelope = await vault.seal({ accessToken: "access-token" });
    await vault.destroy(envelope.keyReference);
    await expect(vault.open(envelope.ciphertext, envelope.keyReference)).rejects.toMatchObject({
      code: "authentication_failed",
    });
  });

  it("shares wrapped data keys across independent worker instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jingtang-token-keys-"));
    const keyStorePath = join(directory, "wrapped-keys.json");
    try {
      const callbackVault = new LocalEnvelopeTokenVault(key, keyStorePath);
      const workerVault = new LocalEnvelopeTokenVault(key, keyStorePath);
      const envelope = await callbackVault.seal({ refreshToken: "cross-process-token" });

      await expect(workerVault.open(envelope.ciphertext, envelope.keyReference)).resolves.toEqual({
        refreshToken: "cross-process-token",
      });
      await workerVault.destroy(envelope.keyReference);
      await expect(
        callbackVault.open(envelope.ciphertext, envelope.keyReference),
      ).rejects.toMatchObject({ code: "authentication_failed" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports key-store I/O failures as retryable service unavailability", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jingtang-token-unavailable-"));
    const keyStorePath = join(directory, "wrapped-keys.json");
    try {
      const vault = new LocalEnvelopeTokenVault(key, keyStorePath);
      const envelope = await vault.seal({ refreshToken: "retry-after-store-recovery" });
      await rm(keyStorePath);
      await mkdir(keyStorePath);

      await expect(vault.open(envelope.ciphertext, envelope.keyReference)).rejects.toMatchObject({
        code: "service_unavailable",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers a lock left behind by a crashed local process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jingtang-token-stale-lock-"));
    const keyStorePath = join(directory, "wrapped-keys.json");
    const lockPath = `${keyStorePath}.lock`;
    try {
      await writeFile(
        lockPath,
        `${JSON.stringify({
          pid: 2_147_483_647,
          acquiredAt: new Date().toISOString(),
          nonce: "crashed-owner",
        })}\n`,
        { mode: 0o600 },
      );
      const vault = new LocalEnvelopeTokenVault(key, keyStorePath);
      const envelope = await vault.seal({ refreshToken: "recovered-after-crash" });
      await expect(vault.open(envelope.ciphertext, envelope.keyReference)).resolves.toEqual({
        refreshToken: "recovered-after-crash",
      });
      await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
