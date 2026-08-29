import { createHmac, timingSafeEqual } from "node:crypto";
import { inspect } from "node:util";

export const tikTokOAuthScopes = ["user.info.basic", "video.publish"] as const;

export const tikTokOAuthCallbackPath = "/api/v1/channels/tiktok/oauth/callback" as const;
export const tikTokMediaPath = "/api/v1/media/tiktok" as const;
export const tikTokMediaUrlTtlSeconds = 65 * 60;

const maximumTikTokMediaBytes = 500 * 1024 * 1024;
const tikTokMediaTokenDomain = "jingtang.tiktok-media.v1";

export interface TikTokMediaAccessClaims {
  readonly objectKey: string;
  readonly expectedByteSize: number;
  readonly expectedSha256: string;
  readonly method: "GET";
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export class TikTokMediaReadUrl {
  readonly #href: string;

  public constructor(href: string) {
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      throw new Error("tiktok_media_url_invalid");
    }
    if (parsed.protocol !== "https:") throw new Error("tiktok_media_url_https_required");
    if (parsed.username || parsed.password || parsed.hash) {
      throw new Error("tiktok_media_url_invalid");
    }
    this.#href = parsed.toString();
  }

  public revealForProviderRequest(): string {
    return this.#href;
  }

  public toJSON(): string {
    return "[REDACTED_TIKTOK_MEDIA_URL]";
  }

  public toString(): string {
    return "[REDACTED_TIKTOK_MEDIA_URL]";
  }

  public [inspect.custom](): string {
    return "TikTokMediaReadUrl [REDACTED]";
  }
}

function validTikTokMediaInput(input: {
  readonly objectKey: string;
  readonly expectedByteSize: number;
  readonly expectedSha256: string;
}): boolean {
  return (
    input.objectKey.length > 0 &&
    input.objectKey.length <= 1024 &&
    input.objectKey.startsWith("workspaces/") &&
    !input.objectKey.includes("\0") &&
    Number.isSafeInteger(input.expectedByteSize) &&
    input.expectedByteSize > 0 &&
    input.expectedByteSize <= maximumTikTokMediaBytes &&
    /^[a-f0-9]{64}$/u.test(input.expectedSha256)
  );
}

function tikTokMediaSignature(secret: string, encodedPayload: string): string {
  return createHmac("sha256", secret)
    .update(tikTokMediaTokenDomain)
    .update("\0")
    .update(encodedPayload)
    .digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    actualBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export class TikTokMediaAccessTokenCodec {
  readonly #secret: string;
  readonly #baseUrl: URL;

  public constructor(secret: string, baseUrl: string) {
    if (secret.length < 32) throw new Error("tiktok_media_signing_secret_invalid");
    const parsed = new URL(baseUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("tiktok_media_base_url_invalid");
    }
    this.#secret = secret;
    this.#baseUrl = parsed;
  }

  public issueReadUrl(
    input: {
      readonly objectKey: string;
      readonly expectedByteSize: number;
      readonly expectedSha256: string;
    },
    now = Date.now(),
  ): TikTokMediaReadUrl {
    if (!validTikTokMediaInput(input)) throw new Error("tiktok_media_url_request_invalid");
    const issuedAt = Math.floor(now / 1000);
    const payload = {
      v: 1,
      k: input.objectKey,
      s: input.expectedByteSize,
      h: input.expectedSha256,
      m: "GET",
      iat: issuedAt,
      exp: issuedAt + tikTokMediaUrlTtlSeconds,
    } as const;
    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const token = `${encodedPayload}.${tikTokMediaSignature(this.#secret, encodedPayload)}`;
    const url = new URL(tikTokMediaPath, this.#baseUrl);
    url.searchParams.set("token", token);
    return new TikTokMediaReadUrl(url.toString());
  }

  public verifyToken(token: string, now = Date.now()): TikTokMediaAccessClaims {
    if (token.length < 1 || token.length > 4096) throw new Error("tiktok_media_token_invalid");
    const parts = token.split(".");
    const encodedPayload = parts[0];
    const signature = parts[1];
    if (
      parts.length !== 2 ||
      !encodedPayload ||
      !signature ||
      !signaturesMatch(signature, tikTokMediaSignature(this.#secret, encodedPayload))
    ) {
      throw new Error("tiktok_media_token_invalid");
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    } catch {
      throw new Error("tiktok_media_token_invalid");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("tiktok_media_token_invalid");
    }
    const entry = value as Record<string, unknown>;
    const keys = Object.keys(entry).sort();
    if (
      JSON.stringify(keys) !== JSON.stringify(["exp", "h", "iat", "k", "m", "s", "v"]) ||
      entry.v !== 1 ||
      entry.m !== "GET" ||
      typeof entry.k !== "string" ||
      typeof entry.s !== "number" ||
      typeof entry.h !== "string" ||
      typeof entry.iat !== "number" ||
      typeof entry.exp !== "number" ||
      !Number.isSafeInteger(entry.iat) ||
      !Number.isSafeInteger(entry.exp) ||
      !validTikTokMediaInput({
        objectKey: entry.k,
        expectedByteSize: entry.s,
        expectedSha256: entry.h,
      })
    ) {
      throw new Error("tiktok_media_token_invalid");
    }
    const nowSeconds = Math.floor(now / 1000);
    if (
      entry.iat > nowSeconds + 5 * 60 ||
      entry.exp <= nowSeconds ||
      entry.exp - entry.iat !== tikTokMediaUrlTtlSeconds
    ) {
      throw new Error("tiktok_media_token_expired");
    }
    return {
      objectKey: entry.k,
      expectedByteSize: entry.s,
      expectedSha256: entry.h,
      method: "GET",
      issuedAt: entry.iat,
      expiresAt: entry.exp,
    };
  }
}

export interface TikTokAuthorizationTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
  readonly openId: string;
  readonly grantedScopes: readonly string[];
}

export interface StoredTikTokAuthorization {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
  readonly openId: string;
  readonly grantedScopes: readonly string[];
}

export interface TikTokCreatorInfo {
  readonly creatorUsername: string;
  readonly creatorNickname: string;
  readonly creatorAvatarUrl?: string;
  readonly privacyLevelOptions: readonly string[];
  readonly commentDisabled: boolean;
  readonly duetDisabled: boolean;
  readonly stitchDisabled: boolean;
  readonly maximumVideoDurationSeconds: number;
}

export interface TikTokDirectPostSettings {
  readonly privacyLevel: "SELF_ONLY";
  readonly disableComment: boolean;
  readonly disableDuet: boolean;
  readonly disableStitch: boolean;
  readonly brandContentToggle: false;
  readonly brandOrganicToggle: boolean;
  readonly isAigc: boolean;
  readonly musicUsageConfirmed: true;
  readonly creatorInfoConfirmed: true;
}

export interface TikTokOAuthProvider {
  authorizationUrl(input: { readonly state: string; readonly redirectUri: string }): URL;
  exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<TikTokAuthorizationTokens>;
  refreshAuthorization(refreshToken: string): Promise<TikTokAuthorizationTokens>;
  revokeAuthorization(accessToken: string): Promise<void>;
  readCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo>;
  initializeDirectPost(input: {
    readonly accessToken: string;
    readonly title: string;
    readonly mediaUrl: TikTokMediaReadUrl;
    readonly settings: TikTokDirectPostSettings;
  }): Promise<{ readonly publishId: string }>;
  readPostStatus(input: {
    readonly accessToken: string;
    readonly publishId: string;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly state: "processing" | "published" | "failed";
    readonly publicPostId?: string;
    readonly failureCategory?: string;
    readonly uploadedBytes?: number;
  }>;
}

export function parseStoredTikTokAuthorization(value: unknown): StoredTikTokAuthorization {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("token_envelope_invalid");
  }
  const entry = value as Partial<StoredTikTokAuthorization>;
  if (
    typeof entry.accessToken !== "string" ||
    typeof entry.accessTokenExpiresAt !== "string" ||
    typeof entry.refreshToken !== "string" ||
    typeof entry.refreshTokenExpiresAt !== "string" ||
    typeof entry.openId !== "string" ||
    !Array.isArray(entry.grantedScopes) ||
    entry.grantedScopes.length !== tikTokOAuthScopes.length ||
    !tikTokOAuthScopes.every((scope) => entry.grantedScopes?.includes(scope))
  ) {
    throw new Error("token_envelope_invalid");
  }
  return {
    accessToken: entry.accessToken,
    accessTokenExpiresAt: entry.accessTokenExpiresAt,
    refreshToken: entry.refreshToken,
    refreshTokenExpiresAt: entry.refreshTokenExpiresAt,
    openId: entry.openId,
    grantedScopes: entry.grantedScopes,
  };
}

export function tikTokAuthorizationRequiresRefresh(
  accessTokenExpiresAt: string,
  now = Date.now(),
): boolean {
  const expiry = new Date(accessTokenExpiresAt).getTime();
  return !Number.isFinite(expiry) || expiry <= now + 5 * 60_000;
}

export function tikTokExecutionFailureDisposition(
  failureCategory: string,
  attempt: number,
): { readonly needsAttention: boolean; readonly terminal: boolean } {
  const needsAttention = [
    "authentication_failed",
    "permission_denied",
    "channel_reauthorization_required",
    "authorized_channel_identity_mismatch",
    "creator_info_changed",
    "conflict",
    "execution_recovery_required",
    "token_envelope_invalid",
  ].includes(failureCategory);
  const nonRetryable = [
    "execution_terminal",
    "invalid_input",
    "invalid_video_size",
    "tiktok_private_publish_settings_invalid",
    "tiktok_self_only_required",
    "tiktok_duration_exceeded",
    "source_asset_size_mismatch",
    "source_asset_hash_mismatch",
    "source_asset_content_type_mismatch",
    "source_asset_body_missing",
  ].includes(failureCategory);
  return { needsAttention, terminal: needsAttention || nonRetryable || attempt >= 4 };
}

export function tikTokPublishStatusFailureDisposition(
  failureCategory: string,
  statusAttempt: number,
  maximumStatusAttempts: number,
): {
  readonly needsAttention: boolean;
  readonly terminal: boolean;
  readonly requireReauthorization: boolean;
} {
  if (failureCategory === "tiktok_auth_removed") {
    return { needsAttention: true, terminal: true, requireReauthorization: true };
  }
  if (failureCategory === "tiktok_internal") {
    const terminal = statusAttempt >= maximumStatusAttempts;
    return { needsAttention: terminal, terminal, requireReauthorization: false };
  }
  return { needsAttention: false, terminal: true, requireReauthorization: false };
}
