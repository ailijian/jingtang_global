export const tikTokOAuthScopes = ["user.info.basic", "video.publish"] as const;

export const tikTokOAuthCallbackPath = "/api/v1/channels/tiktok/oauth/callback" as const;

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

export interface TikTokUserIdentity {
  readonly openId: string;
  readonly unionId?: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
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
  readAuthorizedUser(accessToken: string): Promise<TikTokUserIdentity>;
  readCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo>;
  initializeDirectPost(input: {
    readonly accessToken: string;
    readonly title: string;
    readonly byteSize: number;
    readonly chunkSize: number;
    readonly totalChunkCount: number;
    readonly settings: TikTokDirectPostSettings;
  }): Promise<{ readonly publishId: string; readonly uploadUrl: string }>;
  uploadVideo(input: {
    readonly uploadUrl: string;
    readonly body: ReadableStream<Uint8Array>;
    readonly byteSize: number;
    readonly chunkSize: number;
    readonly totalChunkCount: number;
    readonly signal?: AbortSignal;
  }): Promise<void>;
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

export function tikTokUploadChunkSize(byteSize: number): number {
  return tikTokUploadPlan(byteSize).chunkSize;
}

export function tikTokUploadPlan(byteSize: number): {
  readonly chunkSize: number;
  readonly totalChunkCount: number;
} {
  if (!Number.isSafeInteger(byteSize) || byteSize < 1) throw new Error("invalid_video_size");
  const maximumChunkSize = 64 * 1024 * 1024;
  if (byteSize <= maximumChunkSize) return { chunkSize: byteSize, totalChunkCount: 1 };
  const targetChunkCount = Math.ceil(byteSize / maximumChunkSize);
  const chunkSize = Math.floor(byteSize / targetChunkCount);
  const totalChunkCount = Math.floor(byteSize / chunkSize);
  if (chunkSize < 5 * 1024 * 1024 || totalChunkCount > 1_000) {
    throw new Error("invalid_video_size");
  }
  return { chunkSize, totalChunkCount };
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
