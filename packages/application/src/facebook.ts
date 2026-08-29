export const facebookOAuthScopes = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;

export const facebookOAuthCallbackPath = "/api/v1/channels/facebook/oauth/callback" as const;

export interface FacebookAuthorizationTokens {
  readonly userAccessToken: string;
  readonly expiresAt: Date;
  readonly grantedScopes: readonly string[];
}

export interface FacebookUserIdentity {
  readonly id: string;
  readonly displayName: string;
}

export interface FacebookPageAuthorization {
  readonly id: string;
  readonly displayName: string;
  readonly accessToken: string;
  readonly capabilities: readonly string[];
}

export interface StoredFacebookAuthorization {
  readonly userAccessToken: string;
  readonly pageAccessToken: string;
  readonly expiresAt: string;
  readonly grantedScopes: readonly string[];
  readonly metaUserId: string;
  readonly pageId: string;
}

export interface StoredFacebookConnectionCandidate {
  readonly userAccessToken: string;
  readonly expiresAt: string;
  readonly pages: readonly FacebookPageAuthorization[];
}

function parseFacebookPageAuthorization(value: unknown): FacebookPageAuthorization {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("token_envelope_invalid");
  }
  const page = value as Record<string, unknown>;
  const capabilities = page.capabilities ?? page.tasks;
  if (
    typeof page.id !== "string" ||
    typeof page.displayName !== "string" ||
    typeof page.accessToken !== "string" ||
    !Array.isArray(capabilities) ||
    !capabilities.every((capability: unknown) => typeof capability === "string")
  ) {
    throw new Error("token_envelope_invalid");
  }
  return {
    id: page.id,
    displayName: page.displayName,
    accessToken: page.accessToken,
    capabilities,
  };
}

export function parseStoredFacebookConnectionCandidate(
  value: unknown,
): StoredFacebookConnectionCandidate {
  if (typeof value !== "object" || value === null) throw new Error("token_envelope_invalid");
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.userAccessToken !== "string" ||
    typeof entry.expiresAt !== "string" ||
    !Array.isArray(entry.pages)
  ) {
    throw new Error("token_envelope_invalid");
  }
  return {
    userAccessToken: entry.userAccessToken,
    expiresAt: entry.expiresAt,
    pages: entry.pages.map(parseFacebookPageAuthorization),
  };
}

export function parseStoredFacebookAuthorization(value: unknown): StoredFacebookAuthorization {
  if (typeof value !== "object" || value === null) throw new Error("token_envelope_invalid");
  const entry = value as Partial<StoredFacebookAuthorization>;
  if (
    typeof entry.userAccessToken !== "string" ||
    typeof entry.pageAccessToken !== "string" ||
    typeof entry.expiresAt !== "string" ||
    typeof entry.metaUserId !== "string" ||
    typeof entry.pageId !== "string" ||
    !Array.isArray(entry.grantedScopes) ||
    !facebookOAuthScopes.every((scope) => entry.grantedScopes?.includes(scope))
  ) {
    throw new Error("token_envelope_invalid");
  }
  return {
    userAccessToken: entry.userAccessToken,
    pageAccessToken: entry.pageAccessToken,
    expiresAt: entry.expiresAt,
    grantedScopes: entry.grantedScopes,
    metaUserId: entry.metaUserId,
    pageId: entry.pageId,
  };
}

export function facebookAuthorizationRequiresRefresh(expiresAt: string, now = Date.now()): boolean {
  const expiresAtMs = new Date(expiresAt).getTime();
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now + 60_000;
}

export interface FacebookOAuthProvider {
  authorizationUrl(input: { readonly state: string; readonly redirectUri: string }): URL;
  exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<FacebookAuthorizationTokens>;
  refreshAuthorization(userAccessToken: string): Promise<FacebookAuthorizationTokens>;
  readAuthorizedUser(userAccessToken: string): Promise<FacebookUserIdentity>;
  readManagedPages(userAccessToken: string): Promise<readonly FacebookPageAuthorization[]>;
  revokeAuthorization(userAccessToken: string): Promise<void>;
  uploadPageVideo(input: {
    readonly userAccessToken: string;
    readonly pageAccessToken: string;
    readonly pageId: string;
    readonly title: string;
    readonly description: string;
    readonly mediaType: "video/mp4";
    readonly byteSize: number;
    readonly sha256: string;
    readonly body: ReadableStream<Uint8Array>;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly videoId: string; readonly videoUrl: string }>;
  readVideoStatus(input: {
    readonly pageAccessToken: string;
    readonly videoId: string;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly state: "processing" | "published" | "failed";
    readonly failureCategory?: string;
  }>;
  verifySignedRequest(
    signedRequest: string,
    now?: number,
  ): { readonly userId: string; readonly issuedAt: number };
}

export function facebookExecutionFailureDisposition(
  failureCategory: string,
  attempt: number,
): { readonly needsAttention: boolean; readonly terminal: boolean } {
  const needsAttention = [
    "authentication_failed",
    "permission_denied",
    "channel_reauthorization_required",
    "authorized_channel_identity_mismatch",
    "conflict",
    "execution_recovery_required",
    "token_envelope_invalid",
  ].includes(failureCategory);
  const nonRetryable = [
    "execution_terminal",
    "execution_not_authorized",
    "facebook_mp4_required",
    "facebook_video_too_large",
    "invalid_input",
    "source_asset_size_mismatch",
    "source_asset_hash_mismatch",
    "source_asset_body_missing",
  ].includes(failureCategory);
  return { needsAttention, terminal: needsAttention || nonRetryable || attempt >= 4 };
}
