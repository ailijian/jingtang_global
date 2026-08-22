import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { ApplicationError, type TokenEnvelopeVault } from "@jingtang/application";

const algorithm = "aes-256-gcm";
const aad = Buffer.from("jingtang.oauth-token-envelope.v1", "utf8");

interface EnvelopeV1 {
  readonly v: 1;
  readonly wrapIv: string;
  readonly wrappedKey: string;
  readonly wrapTag: string;
  readonly dataIv: string;
  readonly ciphertext: string;
  readonly dataTag: string;
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function isEnvelope(value: unknown): value is EnvelopeV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof EnvelopeV1, unknown>>;
  return (
    candidate.v === 1 &&
    typeof candidate.wrapIv === "string" &&
    typeof candidate.wrappedKey === "string" &&
    typeof candidate.wrapTag === "string" &&
    typeof candidate.dataIv === "string" &&
    typeof candidate.ciphertext === "string" &&
    typeof candidate.dataTag === "string"
  );
}

export class LocalEnvelopeTokenVault implements TokenEnvelopeVault {
  readonly #keyEncryptionKey: Buffer;

  public constructor(base64UrlKey: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(base64UrlKey)) {
      throw new ApplicationError("invalid_input", "OAuth token encryption key is invalid", 500);
    }
    const key = decode(base64UrlKey);
    if (key.byteLength !== 32) {
      throw new ApplicationError("invalid_input", "OAuth token encryption key is invalid", 500);
    }
    this.#keyEncryptionKey = key;
  }

  public seal(value: unknown): Promise<string> {
    try {
      const dataKey = randomBytes(32);
      const wrapIv = randomBytes(12);
      const dataIv = randomBytes(12);

      const wrapCipher = createCipheriv(algorithm, this.#keyEncryptionKey, wrapIv);
      wrapCipher.setAAD(aad);
      const wrappedKey = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);

      const dataCipher = createCipheriv(algorithm, dataKey, dataIv);
      dataCipher.setAAD(aad);
      const plaintext = Buffer.from(JSON.stringify(value), "utf8");
      const ciphertext = Buffer.concat([dataCipher.update(plaintext), dataCipher.final()]);

      const envelope: EnvelopeV1 = {
        v: 1,
        wrapIv: encode(wrapIv),
        wrappedKey: encode(wrappedKey),
        wrapTag: encode(wrapCipher.getAuthTag()),
        dataIv: encode(dataIv),
        ciphertext: encode(ciphertext),
        dataTag: encode(dataCipher.getAuthTag()),
      };
      return Promise.resolve(
        `local:v1:${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url")}`,
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error("token_encryption_failed"));
    }
  }

  public open<T>(serialized: string): Promise<T> {
    try {
      const prefix = "local:v1:";
      if (!serialized.startsWith(prefix)) throw new Error("invalid_envelope");
      const parsed = JSON.parse(
        Buffer.from(serialized.slice(prefix.length), "base64url").toString("utf8"),
      ) as unknown;
      if (!isEnvelope(parsed)) throw new Error("invalid_envelope");

      const wrapDecipher = createDecipheriv(
        algorithm,
        this.#keyEncryptionKey,
        decode(parsed.wrapIv),
      );
      wrapDecipher.setAAD(aad);
      wrapDecipher.setAuthTag(decode(parsed.wrapTag));
      const dataKey = Buffer.concat([
        wrapDecipher.update(decode(parsed.wrappedKey)),
        wrapDecipher.final(),
      ]);

      const dataDecipher = createDecipheriv(algorithm, dataKey, decode(parsed.dataIv));
      dataDecipher.setAAD(aad);
      dataDecipher.setAuthTag(decode(parsed.dataTag));
      const plaintext = Buffer.concat([
        dataDecipher.update(decode(parsed.ciphertext)),
        dataDecipher.final(),
      ]).toString("utf8");
      return Promise.resolve(JSON.parse(plaintext) as T);
    } catch {
      return Promise.reject(
        new ApplicationError(
          "authentication_failed",
          "OAuth token envelope could not be authenticated",
          500,
        ),
      );
    }
  }
}
