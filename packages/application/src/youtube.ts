export const youtubeOAuthScopes = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export const youtubeOAuthCallbackPath = "/api/v1/channels/youtube/oauth/callback" as const;

export interface YouTubeAuthorizationTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: Date;
  readonly grantedScopes: readonly string[];
}

export interface YouTubeChannelIdentity {
  readonly id: string;
  readonly displayName: string;
}

export interface StoredYouTubeAuthorization {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly grantedScopes: readonly string[];
}

export function parseStoredYouTubeAuthorization(value: unknown): StoredYouTubeAuthorization {
  if (typeof value !== "object" || value === null) throw new Error("token_envelope_invalid");
  const entry = value as Partial<StoredYouTubeAuthorization>;
  if (
    typeof entry.accessToken !== "string" ||
    typeof entry.refreshToken !== "string" ||
    typeof entry.expiresAt !== "string" ||
    !Array.isArray(entry.grantedScopes) ||
    !youtubeOAuthScopes.every((scope) => entry.grantedScopes?.includes(scope))
  ) {
    throw new Error("token_envelope_invalid");
  }
  return {
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
    expiresAt: entry.expiresAt,
    grantedScopes: entry.grantedScopes,
  };
}

export interface YouTubeUploadResult {
  readonly videoId: string;
  readonly videoUrl: string;
}

export interface YouTubeVideoStatus {
  readonly state: "processing" | "published" | "failed";
  readonly failureCategory?: string;
}

export interface YouTubeOAuthProvider {
  authorizationUrl(input: {
    readonly state: string;
    readonly codeChallenge: string;
    readonly redirectUri: string;
  }): URL;
  exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<YouTubeAuthorizationTokens>;
  refreshAuthorization(refreshToken: string): Promise<YouTubeAuthorizationTokens>;
  revokeAuthorization(token: string): Promise<void>;
  readAuthorizedChannel(accessToken: string): Promise<YouTubeChannelIdentity>;
  uploadPrivateVideo(input: {
    readonly accessToken: string;
    readonly title: string;
    readonly description: string;
    readonly madeForKids: boolean;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly body: ReadableStream<Uint8Array>;
    readonly signal?: AbortSignal;
  }): Promise<YouTubeUploadResult>;
  readVideoStatus(
    accessToken: string,
    videoId: string,
    signal?: AbortSignal,
  ): Promise<YouTubeVideoStatus>;
}

export interface TokenEnvelopeVault {
  seal(value: unknown): Promise<{
    readonly ciphertext: string;
    readonly keyReference: string;
  }>;
  open<T>(ciphertext: string, keyReference: string | null): Promise<T>;
  destroy(keyReference: string): Promise<void>;
}

export async function persistSealedTokenEnvelope<T>(
  vault: TokenEnvelopeVault,
  value: unknown,
  persist: (envelope: { readonly ciphertext: string; readonly keyReference: string }) => Promise<T>,
): Promise<T> {
  const envelope = await vault.seal(value);
  try {
    return await persist(envelope);
  } catch (error) {
    try {
      await vault.destroy(envelope.keyReference);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "token_envelope_persistence_cleanup_failed");
    }
    throw error;
  }
}

export type YouTubeTestFault =
  "none" | "timeout" | "quota" | "oauth_expired" | "processing_failed" | "ambiguous_upload";

export function youtubeExecutionFailureDisposition(
  failureCategory: string,
  attempt: number,
): {
  readonly needsAttention: boolean;
  readonly terminal: boolean;
} {
  const needsAttention = [
    "authentication_failed",
    "permission_denied",
    "channel_reauthorization_required",
    "conflict",
    "execution_recovery_required",
    "token_envelope_invalid",
  ].includes(failureCategory);
  const nonRetryable = [
    "execution_terminal",
    "execution_not_authorized",
    "source_asset_size_mismatch",
    "source_asset_body_missing",
  ].includes(failureCategory);
  return {
    needsAttention,
    terminal: needsAttention || nonRetryable || attempt >= 4,
  };
}

export function shouldResetYouTubeExecutionForRetry(input: {
  readonly executionState: string;
  readonly providerReferencePersisted: boolean;
}): boolean {
  return input.executionState === "publishing" && !input.providerReferencePersisted;
}

const unrecoverableAuthorizedDataRefreshFailures = new Set([
  "authentication_failed",
  "permission_denied",
  "not_found",
  "authorized_channel_identity_mismatch",
  "token_envelope_invalid",
  "invalid_envelope",
  "key_destroyed",
  "authorized_data_refresh_deadline_exceeded",
]);

export function authorizedDataRefreshFailureRequiresDeletion(
  failureCategory: string,
  deadlineExceeded: boolean,
): boolean {
  return deadlineExceeded || unrecoverableAuthorizedDataRefreshFailures.has(failureCategory);
}

const permanentlyUnreadableAuthorizationFailures = new Set([
  "authentication_failed",
  "token_envelope_invalid",
  "invalid_envelope",
  "key_destroyed",
]);

export function authorizationMaterialFailureRequiresLocalErasure(
  failureCategory: string,
  deadlineExceeded: boolean,
): boolean {
  return deadlineExceeded || permanentlyUnreadableAuthorizationFailures.has(failureCategory);
}
