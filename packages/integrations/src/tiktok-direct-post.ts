import {
  ApplicationError,
  tikTokOAuthScopes,
  type TikTokAuthorizationTokens,
  type TikTokCreatorInfo,
  type TikTokOAuthProvider,
  type TikTokUserIdentity,
} from "@jingtang/application";

const requestTimeoutMs = 30_000;
const uploadTimeoutMs = 15 * 60_000;
const maximumUploadAttemptsPerChunk = 3;
const maximumJsonResponseBytes = 1024 * 1024;

type TikTokOperation =
  | "authorization_exchange"
  | "authorization_refresh"
  | "authorization_revocation"
  | "authorized_user"
  | "creator_info"
  | "direct_post_init"
  | "video_upload"
  | "publish_status";

export interface TikTokFailureDiagnostics {
  readonly operation: TikTokOperation;
  readonly httpStatus: number;
  readonly providerCode: string | null;
  readonly providerHost?: string;
}

class TikTokRequestError extends ApplicationError {
  public constructor(
    code: ApplicationError["code"],
    message: string,
    status: number,
    public readonly diagnostics: TikTokFailureDiagnostics,
  ) {
    super(code, message, status);
  }
}

export function tikTokFailureDiagnostics(error: unknown): TikTokFailureDiagnostics | null {
  return error instanceof TikTokRequestError ? error.diagnostics : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestError(
  code: ApplicationError["code"],
  message: string,
  status: number,
  operation: TikTokOperation,
  httpStatus: number,
  providerCode: string | null,
  providerHost?: string,
): TikTokRequestError {
  return new TikTokRequestError(code, message, status, {
    operation,
    httpStatus,
    providerCode,
    ...(providerHost ? { providerHost } : {}),
  });
}

async function readJson(response: Response, operation: TikTokOperation): Promise<unknown> {
  try {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maximumJsonResponseBytes) {
      throw new Error("response_too_large");
    }
    return JSON.parse(text) as unknown;
  } catch {
    throw requestError(
      "service_unavailable",
      "TikTok returned an invalid response",
      503,
      operation,
      response.status,
      "invalid_response",
    );
  }
}

function tikTokError(
  response: Response,
  body: unknown,
  fallback: string,
  operation: TikTokOperation,
): ApplicationError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = typeof error?.code === "string" ? error.code : null;
  const diagnostic = (applicationCode: ApplicationError["code"], status: number) =>
    requestError(applicationCode, fallback, status, operation, response.status, code);
  if (response.status === 401 || code === "access_token_invalid") {
    return diagnostic("authentication_failed", 401);
  }
  if (code === "scope_not_authorized") {
    return diagnostic("permission_denied", 403);
  }
  if (response.status === 429 || code === "rate_limit_exceeded") {
    return requestError(
      "rate_limited",
      "TikTok request quota was exceeded",
      429,
      operation,
      response.status,
      code,
    );
  }
  if (
    response.status === 400 ||
    code === "invalid_param" ||
    code?.startsWith("spam_risk_") ||
    [
      "privacy_level_option_mismatch",
      "reached_active_user_cap",
      "unaudited_client_can_only_post_to_private_accounts",
    ].includes(code ?? "")
  ) {
    return diagnostic("invalid_input", 400);
  }
  return diagnostic("service_unavailable", 503);
}

function tikTokOAuthError(
  response: Response,
  body: unknown,
  operation: Extract<TikTokOperation, "authorization_exchange" | "authorization_refresh">,
): ApplicationError {
  const code = isRecord(body) && typeof body.error === "string" ? body.error : null;
  const diagnostic = (applicationCode: ApplicationError["code"], status: number) =>
    requestError(
      applicationCode,
      "TikTok authorization could not be completed",
      status,
      operation,
      response.status,
      code,
    );
  if (code === "invalid_grant") return diagnostic("authentication_failed", 401);
  if (response.status === 429) return diagnostic("rate_limited", 429);
  if (response.status >= 500) return diagnostic("service_unavailable", 503);
  return diagnostic("invalid_input", 400);
}

function apiSucceeded(response: Response, body: unknown): boolean {
  if (!response.ok) return false;
  if (!isRecord(body) || !isRecord(body.error)) return true;
  return body.error.code === "ok";
}

function bearer(accessToken: string): HeadersInit {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json; charset=UTF-8",
  };
}

function isTikTokUploadUrl(uploadUrl: URL): boolean {
  const hostname = uploadUrl.hostname.toLowerCase().replace(/\.$/u, "");
  const isProviderUploadHost = ["tiktokapis.com", "tiktokapis.us"].some(
    (providerDomain) => hostname === providerDomain || hostname.endsWith(`.${providerDomain}`),
  );
  return (
    uploadUrl.protocol === "https:" &&
    uploadUrl.username === "" &&
    uploadUrl.password === "" &&
    uploadUrl.port === "" &&
    isProviderUploadHost
  );
}

async function* streamChunks(
  body: ReadableStream<Uint8Array>,
  targetSize: number,
  totalByteSize: number,
  totalChunkCount: number,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let parts: Uint8Array[] = [];
  let bufferedBytes = 0;
  let emittedBytes = 0;
  let emittedChunks = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      let value = result.value;
      while (value.byteLength > 0) {
        const desiredSize =
          emittedChunks === totalChunkCount - 1 ? totalByteSize - emittedBytes : targetSize;
        if (desiredSize < 1 || emittedChunks >= totalChunkCount) {
          throw new ApplicationError("invalid_input", "TikTok video size changed", 400);
        }
        const remaining = desiredSize - bufferedBytes;
        const taken = value.subarray(0, remaining);
        parts.push(taken);
        bufferedBytes += taken.byteLength;
        value = value.subarray(taken.byteLength);
        if (bufferedBytes === desiredSize) {
          yield Buffer.concat(parts, bufferedBytes);
          emittedBytes += bufferedBytes;
          emittedChunks += 1;
          parts = [];
          bufferedBytes = 0;
        }
      }
    }
    if (
      bufferedBytes !== 0 ||
      emittedBytes !== totalByteSize ||
      emittedChunks !== totalChunkCount
    ) {
      throw new ApplicationError("invalid_input", "TikTok video size changed", 400);
    }
  } finally {
    reader.releaseLock();
  }
}

export class TikTokDirectPostProvider implements TikTokOAuthProvider {
  readonly #clientKey: string;
  readonly #clientSecret: string;
  readonly #fetch: typeof fetch;

  public constructor(input: {
    readonly clientKey: string;
    readonly clientSecret: string;
    readonly fetchImplementation?: typeof fetch;
  }) {
    this.#clientKey = input.clientKey;
    this.#clientSecret = input.clientSecret;
    this.#fetch = input.fetchImplementation ?? globalThis.fetch;
  }

  public authorizationUrl(input: { readonly state: string; readonly redirectUri: string }): URL {
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.search = new URLSearchParams({
      client_key: this.#clientKey,
      scope: tikTokOAuthScopes.join(","),
      response_type: "code",
      redirect_uri: input.redirectUri,
      state: input.state,
    }).toString();
    return url;
  }

  async #tokenRequest(parameters: URLSearchParams): Promise<TikTokAuthorizationTokens> {
    let response: Response;
    try {
      response = await this.#fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: parameters,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new ApplicationError("service_unavailable", "TikTok authorization is unavailable", 503);
    }
    const operation =
      parameters.get("grant_type") === "refresh_token"
        ? "authorization_refresh"
        : "authorization_exchange";
    const body = await readJson(response, operation);
    if (!response.ok || !isRecord(body)) {
      throw tikTokOAuthError(response, body, operation);
    }
    const scope = typeof body.scope === "string" ? body.scope.split(",").filter(Boolean) : [];
    if (
      typeof body.access_token !== "string" ||
      typeof body.refresh_token !== "string" ||
      typeof body.open_id !== "string" ||
      typeof body.expires_in !== "number" ||
      typeof body.refresh_expires_in !== "number" ||
      scope.length !== tikTokOAuthScopes.length ||
      !tikTokOAuthScopes.every((entry) => scope.includes(entry))
    ) {
      throw new ApplicationError(
        "permission_denied",
        "TikTok did not grant exactly the approved permissions",
        403,
      );
    }
    return {
      accessToken: body.access_token,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
      refreshToken: body.refresh_token,
      refreshTokenExpiresAt: new Date(Date.now() + body.refresh_expires_in * 1000),
      openId: body.open_id,
      grantedScopes: scope,
    };
  }

  public exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<TikTokAuthorizationTokens> {
    return this.#tokenRequest(
      new URLSearchParams({
        client_key: this.#clientKey,
        client_secret: this.#clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      }),
    );
  }

  public refreshAuthorization(refreshToken: string): Promise<TikTokAuthorizationTokens> {
    return this.#tokenRequest(
      new URLSearchParams({
        client_key: this.#clientKey,
        client_secret: this.#clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    );
  }

  public async revokeAuthorization(accessToken: string): Promise<void> {
    const response = await this.#fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.#clientKey,
        client_secret: this.#clientSecret,
        token: accessToken,
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      throw requestError(
        "service_unavailable",
        "TikTok revoke failed",
        503,
        "authorization_revocation",
        response.status,
        null,
      );
    }
  }

  public async readAuthorizedUser(accessToken: string): Promise<TikTokUserIdentity> {
    const url = new URL("https://open.tiktokapis.com/v2/user/info/");
    url.searchParams.set("fields", "open_id,union_id,avatar_url,display_name");
    const response = await this.#fetch(url, {
      headers: bearer(accessToken),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const body = await readJson(response, "authorized_user");
    if (!apiSucceeded(response, body)) {
      throw tikTokError(response, body, "TikTok identity could not be read", "authorized_user");
    }
    const user =
      isRecord(body) && isRecord(body.data) && isRecord(body.data.user)
        ? body.data.user
        : undefined;
    if (!user || typeof user.open_id !== "string" || typeof user.display_name !== "string") {
      throw requestError(
        "service_unavailable",
        "TikTok omitted the authorized user",
        503,
        "authorized_user",
        response.status,
        "authorized_user_missing",
      );
    }
    return {
      openId: user.open_id,
      displayName: user.display_name,
      ...(typeof user.union_id === "string" ? { unionId: user.union_id } : {}),
      ...(typeof user.avatar_url === "string" ? { avatarUrl: user.avatar_url } : {}),
    };
  }

  public async readCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const response = await this.#fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: bearer(accessToken),
        body: "{}",
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
    const body = await readJson(response, "creator_info");
    if (!apiSucceeded(response, body)) {
      throw tikTokError(
        response,
        body,
        "TikTok creator settings could not be read",
        "creator_info",
      );
    }
    const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
    if (
      !data ||
      typeof data.creator_username !== "string" ||
      typeof data.creator_nickname !== "string" ||
      !Array.isArray(data.privacy_level_options) ||
      !data.privacy_level_options.every((entry) => typeof entry === "string") ||
      typeof data.comment_disabled !== "boolean" ||
      typeof data.duet_disabled !== "boolean" ||
      typeof data.stitch_disabled !== "boolean" ||
      typeof data.max_video_post_duration_sec !== "number"
    ) {
      throw requestError(
        "service_unavailable",
        "TikTok omitted creator settings",
        503,
        "creator_info",
        response.status,
        "creator_info_missing",
      );
    }
    return {
      creatorUsername: data.creator_username,
      creatorNickname: data.creator_nickname,
      ...(typeof data.creator_avatar_url === "string"
        ? { creatorAvatarUrl: data.creator_avatar_url }
        : {}),
      privacyLevelOptions: data.privacy_level_options,
      commentDisabled: data.comment_disabled,
      duetDisabled: data.duet_disabled,
      stitchDisabled: data.stitch_disabled,
      maximumVideoDurationSeconds: data.max_video_post_duration_sec,
    };
  }

  public async initializeDirectPost(
    input: Parameters<TikTokOAuthProvider["initializeDirectPost"]>[0],
  ): Promise<{ readonly publishId: string; readonly uploadUrl: string }> {
    if (input.settings.privacyLevel !== "SELF_ONLY" || input.settings.brandContentToggle) {
      throw new ApplicationError("invalid_input", "R4 TikTok publishing is private-only", 400);
    }
    const response = await this.#fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: bearer(input.accessToken),
      body: JSON.stringify({
        post_info: {
          title: input.title,
          privacy_level: "SELF_ONLY",
          disable_comment: input.settings.disableComment,
          disable_duet: input.settings.disableDuet,
          disable_stitch: input.settings.disableStitch,
          brand_content_toggle: false,
          brand_organic_toggle: input.settings.brandOrganicToggle,
          is_aigc: input.settings.isAigc,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: input.byteSize,
          chunk_size: input.chunkSize,
          total_chunk_count: input.totalChunkCount,
        },
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const body = await readJson(response, "direct_post_init");
    if (!apiSucceeded(response, body)) {
      throw tikTokError(
        response,
        body,
        "TikTok Direct Post could not be initialized",
        "direct_post_init",
      );
    }
    const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
    if (!data || typeof data.publish_id !== "string" || typeof data.upload_url !== "string") {
      throw requestError(
        "service_unavailable",
        "TikTok omitted upload data",
        503,
        "direct_post_init",
        response.status,
        "upload_data_missing",
      );
    }
    const uploadUrl = new URL(data.upload_url);
    if (!isTikTokUploadUrl(uploadUrl)) {
      throw requestError(
        "service_unavailable",
        "TikTok returned an invalid upload host",
        503,
        "direct_post_init",
        response.status,
        "upload_host_rejected",
        uploadUrl.hostname.toLowerCase().replace(/\.$/u, ""),
      );
    }
    return { publishId: data.publish_id, uploadUrl: uploadUrl.toString() };
  }

  public async uploadVideo(
    input: Parameters<TikTokOAuthProvider["uploadVideo"]>[0],
  ): Promise<void> {
    let offset = 0;
    for await (const chunk of streamChunks(
      input.body,
      input.chunkSize,
      input.byteSize,
      input.totalChunkCount,
    )) {
      const end = offset + chunk.byteLength - 1;
      const payload = new Uint8Array(chunk.byteLength);
      payload.set(chunk);
      const isFinal = end + 1 === input.byteSize;
      for (let attempt = 1; attempt <= maximumUploadAttemptsPerChunk; attempt += 1) {
        let response: Response;
        try {
          response = await this.#fetch(input.uploadUrl, {
            method: "PUT",
            headers: {
              "content-type": "video/mp4",
              "content-length": String(chunk.byteLength),
              "content-range": `bytes ${offset}-${end}/${input.byteSize}`,
            },
            body: payload.buffer,
            signal: input.signal
              ? AbortSignal.any([input.signal, AbortSignal.timeout(uploadTimeoutMs)])
              : AbortSignal.timeout(uploadTimeoutMs),
          });
        } catch {
          throw requestError(
            "conflict",
            "TikTok upload result is ambiguous",
            409,
            "video_upload",
            0,
            "network_ambiguous",
          );
        }
        const accepted = isFinal ? response.status === 201 : response.status === 206;
        if (accepted) break;
        await response.body?.cancel().catch(() => undefined);
        if (response.status < 500 || attempt === maximumUploadAttemptsPerChunk) {
          throw requestError(
            "service_unavailable",
            "TikTok rejected the video upload",
            503,
            "video_upload",
            response.status,
            "upload_rejected",
          );
        }
      }
      offset = end + 1;
    }
    if (offset !== input.byteSize) {
      throw new ApplicationError("invalid_input", "TikTok video size changed during upload", 400);
    }
  }

  public async readPostStatus(
    input: Parameters<TikTokOAuthProvider["readPostStatus"]>[0],
  ): Promise<Awaited<ReturnType<TikTokOAuthProvider["readPostStatus"]>>> {
    const response = await this.#fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: bearer(input.accessToken),
        body: JSON.stringify({ publish_id: input.publishId }),
        signal: input.signal
          ? AbortSignal.any([input.signal, AbortSignal.timeout(requestTimeoutMs)])
          : AbortSignal.timeout(requestTimeoutMs),
      },
    );
    const body = await readJson(response, "publish_status");
    if (!apiSucceeded(response, body)) {
      throw tikTokError(
        response,
        body,
        "TikTok publish status could not be read",
        "publish_status",
      );
    }
    const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
    if (!data || typeof data.status !== "string") {
      throw requestError(
        "service_unavailable",
        "TikTok omitted publish status",
        503,
        "publish_status",
        response.status,
        "publish_status_missing",
      );
    }
    if (data.status === "PUBLISH_COMPLETE") {
      const ids = Array.isArray(data.publicaly_available_post_id)
        ? data.publicaly_available_post_id.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      return { state: "published", ...(ids[0] ? { publicPostId: ids[0] } : {}) };
    }
    if (data.status === "FAILED") {
      return {
        state: "failed",
        failureCategory:
          typeof data.fail_reason === "string"
            ? `tiktok_${data.fail_reason.toLowerCase()}`
            : "tiktok_publish_failed",
      };
    }
    return {
      state: "processing",
      ...(typeof data.uploaded_bytes === "number" ? { uploadedBytes: data.uploaded_bytes } : {}),
    };
  }
}
