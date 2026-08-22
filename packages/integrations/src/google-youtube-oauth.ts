import {
  ApplicationError,
  youtubeOAuthScopes,
  type YouTubeAuthorizationTokens,
  type YouTubeChannelIdentity,
  type YouTubeOAuthProvider,
} from "@jingtang/application";

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const channelEndpoint = "https://www.googleapis.com/youtube/v3/channels";
const videosEndpoint = "https://www.googleapis.com/youtube/v3/videos";
const videoUploadEndpoint = "https://www.googleapis.com/upload/youtube/v3/videos";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasApprovedScopes(scopes: readonly string[]): boolean {
  return (
    scopes.length === youtubeOAuthScopes.length &&
    youtubeOAuthScopes.every((scope) => scopes.includes(scope))
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApplicationError(
      "service_unavailable",
      "YouTube authorization service returned an invalid response",
      503,
    );
  }
}

function serviceError(response: Response, message: string): ApplicationError {
  if (response.status === 401) return new ApplicationError("authentication_failed", message, 401);
  if (response.status === 403) return new ApplicationError("permission_denied", message, 403);
  if (response.status === 429)
    return new ApplicationError("rate_limited", "YouTube request quota was exceeded", 429);
  return new ApplicationError("service_unavailable", message, 503);
}

export class GoogleYouTubeOAuthProvider implements YouTubeOAuthProvider {
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #fetch: typeof fetch;

  public constructor(input: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly fetchImplementation?: typeof fetch;
  }) {
    this.#clientId = input.clientId;
    this.#clientSecret = input.clientSecret;
    this.#fetch = input.fetchImplementation ?? globalThis.fetch;
  }

  public authorizationUrl(input: {
    readonly state: string;
    readonly codeChallenge: string;
    readonly redirectUri: string;
  }): URL {
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      access_type: "offline",
      client_id: this.#clientId,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      include_granted_scopes: "true",
      prompt: "consent",
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: youtubeOAuthScopes.join(" "),
      state: input.state,
    }).toString();
    return url;
  }

  public async exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<YouTubeAuthorizationTokens> {
    let response: Response;
    try {
      response = await this.#fetch(tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.#clientId,
          client_secret: this.#clientSecret,
          code: input.code,
          code_verifier: input.codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: input.redirectUri,
        }),
      });
    } catch {
      throw new ApplicationError(
        "service_unavailable",
        "YouTube authorization service is unavailable",
        503,
      );
    }
    const body = await readJson(response);
    if (!response.ok) {
      throw new ApplicationError(
        "authentication_failed",
        "YouTube authorization could not be completed",
        401,
      );
    }
    if (!isRecord(body)) {
      throw new ApplicationError("service_unavailable", "Invalid YouTube token response", 503);
    }
    const accessToken = body.access_token;
    const refreshToken = body.refresh_token;
    const expiresIn = body.expires_in;
    const scopes =
      typeof body.scope === "string" ? body.scope.split(/\s+/u).filter(Boolean) : undefined;
    if (
      typeof accessToken !== "string" ||
      typeof refreshToken !== "string" ||
      typeof expiresIn !== "number" ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      !scopes ||
      !hasApprovedScopes(scopes)
    ) {
      throw new ApplicationError(
        "permission_denied",
        "YouTube did not grant the required approved permissions",
        403,
      );
    }
    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      grantedScopes: scopes,
    };
  }

  public async readAuthorizedChannel(accessToken: string): Promise<YouTubeChannelIdentity> {
    const url = new URL(channelEndpoint);
    url.search = new URLSearchParams({
      part: "id,snippet",
      mine: "true",
      maxResults: "1",
    }).toString();
    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new ApplicationError("service_unavailable", "YouTube Data API is unavailable", 503);
    }
    const body = await readJson(response);
    if (!response.ok) {
      throw new ApplicationError(
        "authentication_failed",
        "The authorized YouTube channel could not be read",
        401,
      );
    }
    const item =
      isRecord(body) && Array.isArray(body.items) && isRecord(body.items[0])
        ? body.items[0]
        : undefined;
    const snippet = item && isRecord(item.snippet) ? item.snippet : undefined;
    if (!item || typeof item.id !== "string" || !snippet || typeof snippet.title !== "string") {
      throw new ApplicationError(
        "not_found",
        "No YouTube channel is available for this Google account",
        404,
      );
    }
    return { id: item.id, displayName: snippet.title };
  }

  public async refreshAuthorization(refreshToken: string): Promise<YouTubeAuthorizationTokens> {
    let response: Response;
    try {
      response = await this.#fetch(tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.#clientId,
          client_secret: this.#clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
    } catch {
      throw new ApplicationError(
        "service_unavailable",
        "YouTube token service is unavailable",
        503,
      );
    }
    const body = await readJson(response);
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        throw new ApplicationError(
          "authentication_failed",
          "YouTube authorization must be renewed",
          401,
        );
      }
      throw serviceError(response, "YouTube authorization must be renewed");
    }
    if (!isRecord(body))
      throw new ApplicationError("service_unavailable", "Invalid YouTube token response", 503);
    const accessToken = body.access_token;
    const expiresIn = body.expires_in;
    if (
      typeof accessToken !== "string" ||
      typeof expiresIn !== "number" ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new ApplicationError("service_unavailable", "Invalid YouTube token response", 503);
    }
    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      grantedScopes: youtubeOAuthScopes,
    };
  }

  public async uploadPrivateVideo(input: {
    readonly accessToken: string;
    readonly title: string;
    readonly description: string;
    readonly madeForKids: boolean;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly body: ReadableStream<Uint8Array>;
  }): Promise<{ readonly videoId: string; readonly videoUrl: string }> {
    const url = new URL(videoUploadEndpoint);
    url.search = new URLSearchParams({
      uploadType: "resumable",
      part: "snippet,status",
    }).toString();
    let initiation: Response;
    try {
      initiation = await this.#fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-length": String(input.byteSize),
          "x-upload-content-type": input.mediaType,
        },
        body: JSON.stringify({
          snippet: { title: input.title, description: input.description },
          status: { privacyStatus: "private", selfDeclaredMadeForKids: input.madeForKids },
        }),
      });
    } catch {
      throw new ApplicationError(
        "service_unavailable",
        "YouTube upload service is unavailable",
        503,
      );
    }
    if (!initiation.ok)
      throw serviceError(initiation, "YouTube upload session could not be created");
    const uploadUrl = initiation.headers.get("location");
    if (!uploadUrl)
      throw new ApplicationError("service_unavailable", "YouTube omitted the upload location", 503);

    let upload: Response;
    try {
      const streamRequest: RequestInit & { duplex: "half" } = {
        method: "PUT",
        headers: {
          "content-length": String(input.byteSize),
          "content-type": input.mediaType,
        },
        body: input.body,
        duplex: "half",
      };
      upload = await this.#fetch(uploadUrl, streamRequest);
    } catch {
      throw new ApplicationError("conflict", "YouTube upload completion is unknown", 409);
    }
    const body = await readJson(upload);
    if (!upload.ok) {
      if (upload.status >= 500)
        throw new ApplicationError("conflict", "YouTube upload completion is unknown", 409);
      throw serviceError(upload, "YouTube rejected the video upload");
    }
    const videoId = isRecord(body) ? body.id : undefined;
    if (typeof videoId !== "string" || !videoId)
      throw new ApplicationError(
        "service_unavailable",
        "YouTube omitted the uploaded video ID",
        503,
      );
    return { videoId, videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` };
  }

  public async readVideoStatus(accessToken: string, videoId: string) {
    const url = new URL(videosEndpoint);
    url.search = new URLSearchParams({
      part: "status,processingDetails",
      id: videoId,
      maxResults: "1",
    }).toString();
    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new ApplicationError("service_unavailable", "YouTube Data API is unavailable", 503);
    }
    const body = await readJson(response);
    if (!response.ok) throw serviceError(response, "YouTube video status could not be read");
    const item =
      isRecord(body) && Array.isArray(body.items) && isRecord(body.items[0])
        ? body.items[0]
        : undefined;
    if (!item) return { state: "failed" as const, failureCategory: "provider_video_not_found" };
    const processing = isRecord(item.processingDetails) ? item.processingDetails : undefined;
    const status = isRecord(item.status) ? item.status : undefined;
    const processingStatus = processing?.processingStatus;
    const uploadStatus = status?.uploadStatus;
    if (
      processingStatus === "failed" ||
      processingStatus === "terminated" ||
      uploadStatus === "failed" ||
      uploadStatus === "rejected" ||
      uploadStatus === "deleted"
    ) {
      return { state: "failed" as const, failureCategory: "provider_processing_failed" };
    }
    if (processingStatus === "succeeded" || uploadStatus === "processed") {
      return { state: "published" as const };
    }
    return { state: "processing" as const };
  }
}
