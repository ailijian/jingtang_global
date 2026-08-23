import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ApplicationError, type TokenEnvelopeVault } from "@jingtang/application";

const algorithm = "aes-256-gcm";
const aadV1 = Buffer.from("jingtang.oauth-token-envelope.v1", "utf8");
const aadV2 = Buffer.from("jingtang.oauth-token-envelope.v2", "utf8");

interface WrappedKey {
  readonly wrapIv: string;
  readonly wrappedKey: string;
  readonly wrapTag: string;
}

interface CiphertextV2 {
  readonly v: 2;
  readonly dataIv: string;
  readonly ciphertext: string;
  readonly dataTag: string;
}

interface CiphertextV1 {
  readonly v: 1;
  readonly wrapIv: string;
  readonly wrappedKey: string;
  readonly wrapTag: string;
  readonly dataIv: string;
  readonly ciphertext: string;
  readonly dataTag: string;
}

type KeyStore = Record<string, WrappedKey>;

interface FileLockOwner {
  readonly pid: number;
  readonly acquiredAt: string;
  readonly nonce: string;
}

const incompleteLockRecoveryMs = 500;
const maximumLocalLockLifetimeMs = 5 * 60 * 1000;

function parseFileLockOwner(value: string): FileLockOwner | null {
  try {
    const owner = JSON.parse(value) as Partial<FileLockOwner>;
    if (
      typeof owner.pid !== "number" ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.acquiredAt !== "string" ||
      !Number.isFinite(Date.parse(owner.acquiredAt)) ||
      typeof owner.nonce !== "string" ||
      owner.nonce.length === 0
    ) {
      return null;
    }
    return owner as FileLockOwner;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function parseCiphertextV2(serialized: string): CiphertextV2 {
  const prefix = "local:v2:";
  if (!serialized.startsWith(prefix)) throw new Error("invalid_envelope");
  const value = JSON.parse(
    Buffer.from(serialized.slice(prefix.length), "base64url").toString("utf8"),
  ) as Partial<CiphertextV2>;
  if (
    value.v !== 2 ||
    typeof value.dataIv !== "string" ||
    typeof value.ciphertext !== "string" ||
    typeof value.dataTag !== "string"
  ) {
    throw new Error("invalid_envelope");
  }
  return value as CiphertextV2;
}

function parseCiphertextV1(serialized: string): CiphertextV1 {
  const prefix = "local:v1:";
  if (!serialized.startsWith(prefix)) throw new Error("invalid_envelope");
  const value = JSON.parse(
    Buffer.from(serialized.slice(prefix.length), "base64url").toString("utf8"),
  ) as Partial<CiphertextV1>;
  if (
    value.v !== 1 ||
    typeof value.wrapIv !== "string" ||
    typeof value.wrappedKey !== "string" ||
    typeof value.wrapTag !== "string" ||
    typeof value.dataIv !== "string" ||
    typeof value.ciphertext !== "string" ||
    typeof value.dataTag !== "string"
  ) {
    throw new Error("invalid_envelope");
  }
  return value as CiphertextV1;
}

export class LocalEnvelopeTokenVault implements TokenEnvelopeVault {
  readonly #keyEncryptionKey: Buffer;
  readonly #keyStorePath: string | undefined;
  readonly #memoryKeys = new Map<string, WrappedKey>();

  public constructor(base64UrlKey: string, keyStorePath?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(base64UrlKey)) {
      throw new ApplicationError("invalid_input", "OAuth token encryption key is invalid", 500);
    }
    const key = decode(base64UrlKey);
    if (key.byteLength !== 32) {
      throw new ApplicationError("invalid_input", "OAuth token encryption key is invalid", 500);
    }
    this.#keyEncryptionKey = key;
    this.#keyStorePath = keyStorePath;
  }

  async #recoverStaleFileLock(lockPath: string): Promise<void> {
    let snapshot: string;
    let modifiedAt: number;
    try {
      [snapshot, modifiedAt] = await Promise.all([
        readFile(lockPath, "utf8"),
        stat(lockPath).then((entry) => entry.mtimeMs),
      ]);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    const owner = parseFileLockOwner(snapshot);
    const ageMs = Date.now() - modifiedAt;
    const stale = owner
      ? !processIsAlive(owner.pid) || ageMs >= maximumLocalLockLifetimeMs
      : ageMs >= incompleteLockRecoveryMs;
    if (!stale) return;

    const current = await readFile(lockPath, "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    });
    if (current !== snapshot) return;
    const quarantinePath = `${lockPath}.stale.${randomUUID()}`;
    try {
      await rename(lockPath, quarantinePath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    await unlink(quarantinePath).catch(() => undefined);
  }

  async #withFileLock<T>(operation: (store: KeyStore) => T | Promise<T>): Promise<T> {
    if (!this.#keyStorePath) throw new Error("key_store_path_missing");
    await mkdir(dirname(this.#keyStorePath), { recursive: true });
    const lockPath = `${this.#keyStorePath}.lock`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let lockOwner: FileLockOwner | undefined;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const candidate = await open(lockPath, "wx", 0o600);
        const candidateOwner: FileLockOwner = {
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
          nonce: randomUUID(),
        };
        try {
          await candidate.writeFile(`${JSON.stringify(candidateOwner)}\n`, "utf8");
          await candidate.sync();
        } catch (error) {
          await candidate.close().catch(() => undefined);
          await unlink(lockPath).catch(() => undefined);
          throw error;
        }
        handle = candidate;
        lockOwner = candidateOwner;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
        await this.#recoverStaleFileLock(lockPath);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (!handle || !lockOwner) throw new Error("key_store_lock_timeout");
    try {
      const store = await readFile(this.#keyStorePath, "utf8")
        .then((value) => JSON.parse(value) as KeyStore)
        .catch((error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
          throw error;
        });
      const result = await operation(store);
      const temporaryPath = `${this.#keyStorePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(store)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.#keyStorePath);
      return result;
    } finally {
      await handle.close();
      const currentOwner = await readFile(lockPath, "utf8")
        .then(parseFileLockOwner)
        .catch(() => null);
      if (currentOwner?.nonce === lockOwner.nonce) {
        await unlink(lockPath).catch(() => undefined);
      }
    }
  }

  async #storeKey(keyReference: string, wrappedKey: WrappedKey): Promise<void> {
    if (!this.#keyStorePath) {
      this.#memoryKeys.set(keyReference, wrappedKey);
      return;
    }
    await this.#withFileLock((store) => {
      store[keyReference] = wrappedKey;
    });
  }

  async #readKey(keyReference: string): Promise<WrappedKey | undefined> {
    if (!this.#keyStorePath) return this.#memoryKeys.get(keyReference);
    return this.#withFileLock((store) => store[keyReference]);
  }

  public async seal(value: unknown): Promise<{ ciphertext: string; keyReference: string }> {
    const dataKey = randomBytes(32);
    const wrapIv = randomBytes(12);
    const dataIv = randomBytes(12);
    const keyReference = `local-key:${randomUUID()}`;
    const wrapCipher = createCipheriv(algorithm, this.#keyEncryptionKey, wrapIv);
    wrapCipher.setAAD(aadV2);
    const wrappedKeyBytes = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);
    await this.#storeKey(keyReference, {
      wrapIv: encode(wrapIv),
      wrappedKey: encode(wrappedKeyBytes),
      wrapTag: encode(wrapCipher.getAuthTag()),
    });

    const dataCipher = createCipheriv(algorithm, dataKey, dataIv);
    dataCipher.setAAD(aadV2);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    const ciphertextBytes = Buffer.concat([dataCipher.update(plaintext), dataCipher.final()]);
    const envelope: CiphertextV2 = {
      v: 2,
      dataIv: encode(dataIv),
      ciphertext: encode(ciphertextBytes),
      dataTag: encode(dataCipher.getAuthTag()),
    };
    return {
      ciphertext: `local:v2:${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url")}`,
      keyReference,
    };
  }

  public async open<T>(serialized: string, keyReference: string | null): Promise<T> {
    try {
      const legacy = serialized.startsWith("local:v1:");
      const parsed = legacy ? parseCiphertextV1(serialized) : parseCiphertextV2(serialized);
      let wrapped: WrappedKey;
      if (parsed.v === 1) {
        wrapped = {
          wrapIv: parsed.wrapIv,
          wrappedKey: parsed.wrappedKey,
          wrapTag: parsed.wrapTag,
        };
      } else {
        if (!keyReference) throw new Error("key_reference_missing");
        try {
          const persisted = await this.#readKey(keyReference);
          if (!persisted) throw new Error("wrapped_key_missing");
          wrapped = persisted;
        } catch (error) {
          if (error instanceof Error && error.message === "wrapped_key_missing") throw error;
          throw new ApplicationError(
            "service_unavailable",
            "OAuth token key store is temporarily unavailable",
            503,
          );
        }
      }
      const aad = parsed.v === 1 ? aadV1 : aadV2;
      const wrapDecipher = createDecipheriv(
        algorithm,
        this.#keyEncryptionKey,
        decode(wrapped.wrapIv),
      );
      wrapDecipher.setAAD(aad);
      wrapDecipher.setAuthTag(decode(wrapped.wrapTag));
      const dataKey = Buffer.concat([
        wrapDecipher.update(decode(wrapped.wrappedKey)),
        wrapDecipher.final(),
      ]);
      const dataDecipher = createDecipheriv(algorithm, dataKey, decode(parsed.dataIv));
      dataDecipher.setAAD(aad);
      dataDecipher.setAuthTag(decode(parsed.dataTag));
      const plaintext = Buffer.concat([
        dataDecipher.update(decode(parsed.ciphertext)),
        dataDecipher.final(),
      ]).toString("utf8");
      return JSON.parse(plaintext) as T;
    } catch (error) {
      if (error instanceof ApplicationError && error.code === "service_unavailable") throw error;
      throw new ApplicationError(
        "authentication_failed",
        "OAuth token envelope could not be authenticated",
        500,
      );
    }
  }

  public async destroy(keyReference: string): Promise<void> {
    if (!this.#keyStorePath) {
      this.#memoryKeys.delete(keyReference);
      return;
    }
    await this.#withFileLock((store) => {
      delete store[keyReference];
    });
  }
}
