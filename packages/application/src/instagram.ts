import { createHmac } from "node:crypto";
import { inspect } from "node:util";

export const instagramOAuthScopes = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

export const instagramOAuthCallbackPath = "/api/v1/channels/instagram/oauth/callback" as const;

export const instagramProviderOperationAllowlist = {
  authorize: {
    method: "GET",
    host: "www.instagram.com",
    path: "/oauth/authorize",
    fields: ["client_id", "redirect_uri", "response_type", "scope", "state"],
  },
  exchangeCode: {
    method: "POST",
    host: "api.instagram.com",
    path: "/oauth/access_token",
    fields: ["client_id", "client_secret", "code", "grant_type", "redirect_uri"],
  },
  exchangeLongLivedToken: {
    method: "GET",
    host: "graph.instagram.com",
    path: "/access_token",
    fields: ["access_token", "client_secret", "grant_type"],
  },
  refreshToken: {
    method: "GET",
    host: "graph.instagram.com",
    path: "/refresh_access_token",
    fields: ["access_token", "grant_type"],
  },
  readIdentity: {
    method: "GET",
    host: "graph.instagram.com",
    path: "/v26.0/me",
    fields: ["access_token", "fields=user_id,username"],
  },
  readPublishingLimit: {
    method: "GET",
    host: "graph.instagram.com",
    path: "/v26.0/{igUserId}/content_publishing_limit",
    fields: ["access_token"],
  },
  createReelContainer: {
    method: "POST",
    host: "graph.instagram.com",
    path: "/v26.0/{igUserId}/media",
    fields: ["access_token", "caption", "media_type=REELS", "share_to_feed=false", "video_url"],
  },
  readContainer: {
    method: "GET",
    host: "graph.instagram.com",
    path: "/v26.0/{containerId}",
    fields: ["access_token", "fields=status_code,status"],
  },
  publishContainer: {
    method: "POST",
    host: "graph.instagram.com",
    path: "/v26.0/{igUserId}/media_publish",
    fields: ["access_token", "creation_id"],
  },
} as const;

export interface InstagramAuthorizationTokens {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly grantedScopes: readonly string[];
}

export interface InstagramProfessionalIdentity {
  readonly userId: string;
  readonly username: string;
  readonly professionalAccount: true;
}

export interface StoredInstagramAuthorization {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly grantedScopes: readonly string[];
  readonly userId: string;
}

export interface InstagramReelSettings {
  readonly mediaType: "REELS";
  readonly shareToFeed: false;
  readonly publishMode: "IMMEDIATE";
}

export const instagramReelSettings: InstagramReelSettings = {
  mediaType: "REELS",
  shareToFeed: false,
  publishMode: "IMMEDIATE",
};

export class InstagramMediaReadUrl {
  readonly #href: string;

  public constructor(href: string) {
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      throw new Error("instagram_media_url_invalid");
    }
    if (parsed.protocol !== "https:") throw new Error("instagram_media_url_https_required");
    this.#href = parsed.toString();
  }

  public revealForProviderRequest(): string {
    return this.#href;
  }

  public toJSON(): string {
    return "[REDACTED_INSTAGRAM_MEDIA_URL]";
  }

  public toString(): string {
    return "[REDACTED_INSTAGRAM_MEDIA_URL]";
  }

  public [inspect.custom](): string {
    return "InstagramMediaReadUrl [REDACTED]";
  }
}

export interface InstagramMediaUrlIssuer {
  issueReadUrl(input: {
    readonly objectKey: string;
    readonly method: "GET";
    readonly expiresInSeconds: number;
    readonly expectedByteSize: number;
    readonly expectedSha256: string;
  }): Promise<InstagramMediaReadUrl>;
}

export interface InstagramOAuthProvider {
  authorizationUrl(input: { readonly state: string; readonly redirectUri: string }): URL;
  exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<InstagramAuthorizationTokens>;
  refreshAuthorization(accessToken: string): Promise<InstagramAuthorizationTokens>;
  readProfessionalIdentity(accessToken: string): Promise<InstagramProfessionalIdentity>;
  readPublishingLimit(input: {
    readonly accessToken: string;
    readonly userId: string;
  }): Promise<{ readonly quotaTotal: 100; readonly quotaUsage: number }>;
  createReelContainer(input: {
    readonly accessToken: string;
    readonly userId: string;
    readonly caption: string;
    readonly mediaUrl: InstagramMediaReadUrl;
    readonly settings: InstagramReelSettings;
  }): Promise<{ readonly containerId: string }>;
  readContainerStatus(input: {
    readonly accessToken: string;
    readonly containerId: string;
  }): Promise<{
    readonly state: "in_progress" | "finished" | "published" | "expired" | "failed";
    readonly failureCategory?: string;
  }>;
  publishContainer(input: {
    readonly accessToken: string;
    readonly userId: string;
    readonly containerId: string;
  }): Promise<{ readonly mediaId: string }>;
}

export type InstagramCallbackKind = "deauthorization" | "data_deletion";

export interface VerifiedInstagramCallback {
  readonly kind: InstagramCallbackKind;
  readonly correlationSubject: string;
  readonly replayKey: string;
}

export interface InstagramCallbackVerifier {
  verify(input: {
    readonly kind: InstagramCallbackKind;
    readonly headers: Readonly<Record<string, string>>;
    readonly rawBody: Uint8Array;
  }): Promise<VerifiedInstagramCallback>;
}

export interface InstagramCallbackCorrelationBinder {
  bindAuthorization(input: {
    readonly authorization: InstagramAuthorizationTokens;
    readonly identity: InstagramProfessionalIdentity;
  }): Promise<{ readonly correlationSubject: string }>;
}

function keyedDigest(secret: string, domain: string, value: string): string {
  if (secret.length < 32 || value.length === 0) throw new Error("instagram_correlation_invalid");
  return createHmac("sha256", secret).update(domain).update("\0").update(value).digest("hex");
}

export function instagramSubjectCorrelationHash(secret: string, subject: string): string {
  return keyedDigest(secret, "jingtang.instagram.callback-subject.v1", subject);
}

export function instagramCallbackReplayDigest(secret: string, replayKey: string): string {
  return keyedDigest(secret, "jingtang.instagram.callback-replay.v1", replayKey);
}

export function parseStoredInstagramAuthorization(value: unknown): StoredInstagramAuthorization {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("token_envelope_invalid");
  }
  const entry = value as Partial<StoredInstagramAuthorization>;
  if (
    typeof entry.accessToken !== "string" ||
    entry.accessToken.length === 0 ||
    typeof entry.expiresAt !== "string" ||
    !Number.isFinite(new Date(entry.expiresAt).getTime()) ||
    typeof entry.userId !== "string" ||
    entry.userId.length === 0 ||
    !Array.isArray(entry.grantedScopes) ||
    !entry.grantedScopes.every((scope) => typeof scope === "string") ||
    entry.grantedScopes.length !== instagramOAuthScopes.length ||
    !instagramOAuthScopes.every((scope) => entry.grantedScopes?.includes(scope))
  ) {
    throw new Error("token_envelope_invalid");
  }
  return {
    accessToken: entry.accessToken,
    expiresAt: entry.expiresAt,
    userId: entry.userId,
    grantedScopes: entry.grantedScopes,
  };
}

export function instagramAuthorizationRequiresRefresh(
  expiresAt: string,
  now = Date.now(),
): boolean {
  const expiry = new Date(expiresAt).getTime();
  return !Number.isFinite(expiry) || expiry <= now + 24 * 60 * 60_000;
}

export type InstagramProviderWriteState =
  "not_started" | "started" | "succeeded" | "ambiguous" | "failed";

export interface InstagramExecutionCheckpoint {
  readonly createState: InstagramProviderWriteState;
  readonly publishState: InstagramProviderWriteState;
  readonly containerId: string | null;
  readonly mediaId: string | null;
}

export type InstagramExecutionAction =
  | "claim_container_create"
  | "reconcile_container_create"
  | "read_container"
  | "claim_media_publish"
  | "reconcile_media_publish"
  | "complete";

export function nextInstagramExecutionAction(
  checkpoint: InstagramExecutionCheckpoint,
  containerReady = false,
): InstagramExecutionAction {
  if (checkpoint.publishState === "succeeded" && checkpoint.mediaId) return "complete";
  if (checkpoint.publishState === "started" || checkpoint.publishState === "ambiguous") {
    return "reconcile_media_publish";
  }
  if (checkpoint.createState === "not_started" || checkpoint.createState === "failed") {
    return "claim_container_create";
  }
  if (checkpoint.createState === "started" || checkpoint.createState === "ambiguous") {
    return "reconcile_container_create";
  }
  if (!checkpoint.containerId) throw new Error("instagram_container_reference_missing");
  return containerReady ? "claim_media_publish" : "read_container";
}

export function validateInstagramMediaUrlRequest(input: {
  readonly objectKey: string;
  readonly method: "GET";
  readonly expiresInSeconds: number;
  readonly expectedByteSize: number;
  readonly expectedSha256: string;
}): void {
  if (
    !input.objectKey ||
    input.method !== "GET" ||
    !Number.isInteger(input.expiresInSeconds) ||
    input.expiresInSeconds < 1 ||
    input.expiresInSeconds > 3_600 ||
    !Number.isSafeInteger(input.expectedByteSize) ||
    input.expectedByteSize < 1 ||
    !/^[0-9a-f]{64}$/u.test(input.expectedSha256)
  ) {
    throw new Error("instagram_media_url_request_invalid");
  }
}
