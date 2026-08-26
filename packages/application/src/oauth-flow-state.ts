import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { Locale } from "@jingtang/domain";

import { ApplicationError } from "./errors.js";

const algorithm = "aes-256-gcm";
const aad = Buffer.from("jingtang.youtube-oauth-state.v1", "utf8");
const facebookAad = Buffer.from("jingtang.facebook-oauth-state.v1", "utf8");

export interface YouTubeOAuthFlowContext {
  readonly state: string;
  readonly codeVerifier: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly channelId: string;
  readonly consentRecordId: string;
  readonly locale: Locale;
  readonly expiresAt: number;
}

export interface FacebookOAuthFlowContext {
  readonly state: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly channelId: string;
  readonly consentRecordId: string;
  readonly locale: Locale;
  readonly expiresAt: number;
}

function invalidState(): ApplicationError {
  return new ApplicationError(
    "invalid_input",
    "YouTube authorization state is invalid or expired",
    400,
  );
}

function isContext(value: unknown): value is YouTubeOAuthFlowContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof YouTubeOAuthFlowContext, unknown>>;
  return (
    typeof candidate.state === "string" &&
    typeof candidate.codeVerifier === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.channelId === "string" &&
    typeof candidate.consentRecordId === "string" &&
    (candidate.locale === "en" || candidate.locale === "zh-CN") &&
    typeof candidate.expiresAt === "number" &&
    Number.isSafeInteger(candidate.expiresAt)
  );
}

function sameOpaqueValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function invalidFacebookState(): ApplicationError {
  return new ApplicationError(
    "invalid_input",
    "Facebook authorization state is invalid or expired",
    400,
  );
}

function isFacebookContext(value: unknown): value is FacebookOAuthFlowContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof FacebookOAuthFlowContext, unknown>>;
  return (
    typeof candidate.state === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.channelId === "string" &&
    typeof candidate.consentRecordId === "string" &&
    (candidate.locale === "en" || candidate.locale === "zh-CN") &&
    typeof candidate.expiresAt === "number" &&
    Number.isSafeInteger(candidate.expiresAt)
  );
}

export function createOAuthPkce(): {
  readonly state: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
} {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { state, codeVerifier, codeChallenge };
}

export class YouTubeOAuthFlowStateCodec {
  readonly #key: Buffer;

  public constructor(secret: string) {
    if (secret.length < 32)
      throw new ApplicationError("invalid_input", "OAuth state key is invalid", 500);
    this.#key = createHash("sha256").update(secret, "utf8").digest();
  }

  public seal(context: YouTubeOAuthFlowContext): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.#key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(context), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");
  }

  public open(
    serialized: string,
    returnedState: string,
    now: number = Date.now(),
  ): YouTubeOAuthFlowContext {
    try {
      const [version, iv, ciphertext, tag, ...rest] = serialized.split(".");
      if (version !== "v1" || !iv || !ciphertext || !tag || rest.length > 0) throw invalidState();
      const decipher = createDecipheriv(algorithm, this.#key, Buffer.from(iv, "base64url"));
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      const context = JSON.parse(plaintext) as unknown;
      if (
        !isContext(context) ||
        context.expiresAt <= now ||
        !sameOpaqueValue(context.state, returnedState)
      ) {
        throw invalidState();
      }
      return context;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw invalidState();
    }
  }
}

export class FacebookOAuthFlowStateCodec {
  readonly #key: Buffer;

  public constructor(secret: string) {
    if (secret.length < 32)
      throw new ApplicationError("invalid_input", "OAuth state key is invalid", 500);
    this.#key = createHash("sha256").update(secret, "utf8").digest();
  }

  public seal(context: FacebookOAuthFlowContext): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.#key, iv);
    cipher.setAAD(facebookAad);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(context), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");
  }

  public open(
    serialized: string,
    returnedState: string,
    now: number = Date.now(),
  ): FacebookOAuthFlowContext {
    try {
      const [version, iv, ciphertext, tag, ...rest] = serialized.split(".");
      if (version !== "v1" || !iv || !ciphertext || !tag || rest.length > 0) {
        throw invalidFacebookState();
      }
      const decipher = createDecipheriv(algorithm, this.#key, Buffer.from(iv, "base64url"));
      decipher.setAAD(facebookAad);
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const context = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8"),
      ) as unknown;
      if (
        !isFacebookContext(context) ||
        context.expiresAt <= now ||
        !sameOpaqueValue(context.state, returnedState)
      ) {
        throw invalidFacebookState();
      }
      return context;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw invalidFacebookState();
    }
  }
}

export function facebookOAuthStateDigest(state: string): string {
  return createHash("sha256").update(`facebook:${state}`, "utf8").digest("hex");
}

export function assertYouTubeOAuthFlowBinding(
  context: Pick<YouTubeOAuthFlowContext, "sessionId" | "userId" | "workspaceId" | "locale">,
  current: {
    readonly sessionId: string;
    readonly userId: string;
    readonly workspaceId: string | null;
    readonly locale: Locale;
  },
): void {
  if (
    context.sessionId !== current.sessionId ||
    context.userId !== current.userId ||
    context.workspaceId !== current.workspaceId ||
    context.locale !== current.locale
  ) {
    throw new ApplicationError(
      "permission_denied",
      "YouTube authorization no longer matches the active session and Workspace",
      403,
    );
  }
}

export function assertFacebookOAuthFlowBinding(
  context: Pick<FacebookOAuthFlowContext, "sessionId" | "userId" | "workspaceId" | "locale">,
  current: {
    readonly sessionId: string;
    readonly userId: string;
    readonly workspaceId: string | null;
    readonly locale: Locale;
  },
): void {
  if (
    context.sessionId !== current.sessionId ||
    context.userId !== current.userId ||
    context.workspaceId !== current.workspaceId ||
    context.locale !== current.locale
  ) {
    throw new ApplicationError(
      "permission_denied",
      "Facebook authorization no longer matches the active session and Workspace",
      403,
    );
  }
}
