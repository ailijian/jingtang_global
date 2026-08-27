import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  ApplicationError,
  facebookOAuthScopes,
  type FacebookAuthorizationTokens,
  type FacebookOAuthProvider,
  type FacebookPageAuthorization,
  type FacebookUserIdentity,
} from "@jingtang/application";

const requestTimeoutMs = 30_000;
const uploadTimeoutMs = 15 * 60_000;
const maximumJsonResponseBytes = 1024 * 1024;
const maximumSignedRequestAgeSeconds = 5 * 60;
const maximumTargetedPages = 100;
const targetedPageBatchSize = 10;
const facebookPageContentTasks = new Set(["CREATE_CONTENT", "PROFILE_PLUS_CREATE_CONTENT"]);
const facebookPageIdPattern = /^\d{1,32}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFacebookPageIdArray(value: unknown): value is string[] {
  return isStringArray(value) && value.every((entry) => facebookPageIdPattern.test(entry));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumJsonResponseBytes) {
      throw new Error("response_too_large");
    }
    if (!response.body) throw new Error("response_body_missing");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumJsonResponseBytes) {
        await reader.cancel();
        throw new Error("response_too_large");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, byteLength).toString("utf8")) as unknown;
  } catch {
    throw new ApplicationError("service_unavailable", "Meta returned an invalid response", 503);
  }
}

function graphError(response: Response, message: string): ApplicationError {
  if (response.status === 400 || response.status === 401) {
    return new ApplicationError("authentication_failed", message, 401);
  }
  if (response.status === 403) return new ApplicationError("permission_denied", message, 403);
  if (response.status === 429)
    return new ApplicationError("rate_limited", "Meta request quota was exceeded", 429);
  return new ApplicationError("service_unavailable", message, 503);
}

function combineSignal(signal: AbortSignal | undefined, timeout: number): AbortSignal {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
}

export class MetaFacebookOAuthProvider implements FacebookOAuthProvider {
  readonly #appId: string;
  readonly #appSecret: string;
  readonly #loginConfigurationId: string;
  readonly #version: string;
  readonly #fetch: typeof fetch;

  public constructor(input: {
    readonly appId: string;
    readonly appSecret: string;
    readonly loginConfigurationId: string;
    readonly graphApiVersion: string;
    readonly fetchImplementation?: typeof fetch;
  }) {
    this.#appId = input.appId;
    this.#appSecret = input.appSecret;
    this.#loginConfigurationId = input.loginConfigurationId;
    this.#version = input.graphApiVersion;
    this.#fetch = input.fetchImplementation ?? globalThis.fetch;
  }

  #graphUrl(path: string): URL {
    return new URL(`${this.#version}/${path.replace(/^\//u, "")}`, "https://graph.facebook.com/");
  }

  #graphVideoUrl(path: string): URL {
    return new URL(
      `${this.#version}/${path.replace(/^\//u, "")}`,
      "https://graph-video.facebook.com/",
    );
  }

  async #request(
    input: string | URL | Request,
    init: RequestInit,
    message: string,
    ambiguous = false,
  ): Promise<Response> {
    try {
      return await this.#fetch(input, init);
    } catch {
      throw new ApplicationError(
        ambiguous ? "conflict" : "service_unavailable",
        message,
        ambiguous ? 409 : 503,
      );
    }
  }

  public authorizationUrl(input: { readonly state: string; readonly redirectUri: string }): URL {
    const url = new URL(`${this.#version}/dialog/oauth`, "https://www.facebook.com/");
    url.search = new URLSearchParams({
      client_id: this.#appId,
      config_id: this.#loginConfigurationId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      state: input.state,
    }).toString();
    return url;
  }

  async #readToken(url: URL): Promise<FacebookAuthorizationTokens> {
    const response = await this.#request(
      url,
      { signal: AbortSignal.timeout(requestTimeoutMs) },
      "Meta authorization is unavailable",
    );
    const body = await readJson(response);
    if (!response.ok) throw graphError(response, "Facebook authorization could not be completed");
    const token = isRecord(body) ? body.access_token : undefined;
    const expiresIn = isRecord(body) ? body.expires_in : undefined;
    if (
      typeof token !== "string" ||
      typeof expiresIn !== "number" ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new ApplicationError("service_unavailable", "Meta omitted token expiry data", 503);
    }
    const grantedScopes = await this.#readGrantedScopes(token);
    const allowedScopes = new Set<string>([...facebookOAuthScopes, "public_profile"]);
    if (
      !facebookOAuthScopes.every((scope) => grantedScopes.includes(scope)) ||
      grantedScopes.some((scope) => !allowedScopes.has(scope))
    ) {
      throw new ApplicationError(
        "permission_denied",
        "Facebook did not grant all approved Page permissions",
        403,
      );
    }
    return {
      userAccessToken: token,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      grantedScopes,
    };
  }

  async #readGrantedScopes(accessToken: string): Promise<readonly string[]> {
    const url = this.#graphUrl("me/permissions");
    url.search = new URLSearchParams({ access_token: accessToken }).toString();
    const response = await this.#request(
      url,
      { signal: AbortSignal.timeout(requestTimeoutMs) },
      "Facebook permissions could not be verified",
    );
    const body = await readJson(response);
    if (!response.ok) throw graphError(response, "Facebook permissions could not be verified");
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new ApplicationError("service_unavailable", "Meta omitted permission data", 503);
    }
    return body.data.flatMap((entry) =>
      isRecord(entry) && entry.status === "granted" && typeof entry.permission === "string"
        ? [entry.permission]
        : [],
    );
  }

  public async exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<FacebookAuthorizationTokens> {
    const shortUrl = this.#graphUrl("oauth/access_token");
    shortUrl.search = new URLSearchParams({
      client_id: this.#appId,
      client_secret: this.#appSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }).toString();
    const response = await this.#request(
      shortUrl,
      { signal: AbortSignal.timeout(requestTimeoutMs) },
      "Meta authorization is unavailable",
    );
    const body = await readJson(response);
    if (!response.ok) throw graphError(response, "Facebook authorization could not be completed");
    const shortToken = isRecord(body) ? body.access_token : undefined;
    if (typeof shortToken !== "string") {
      throw new ApplicationError("service_unavailable", "Meta omitted the access token", 503);
    }
    return this.refreshAuthorization(shortToken);
  }

  public refreshAuthorization(userAccessToken: string): Promise<FacebookAuthorizationTokens> {
    const url = this.#graphUrl("oauth/access_token");
    url.search = new URLSearchParams({
      client_id: this.#appId,
      client_secret: this.#appSecret,
      fb_exchange_token: userAccessToken,
      grant_type: "fb_exchange_token",
    }).toString();
    return this.#readToken(url);
  }

  public async readAuthorizedUser(userAccessToken: string): Promise<FacebookUserIdentity> {
    const url = this.#graphUrl("me");
    url.search = new URLSearchParams({
      fields: "id,name",
      access_token: userAccessToken,
    }).toString();
    const response = await this.#request(
      url,
      { signal: AbortSignal.timeout(requestTimeoutMs) },
      "The authorized Facebook user could not be read",
    );
    const body = await readJson(response);
    if (!response.ok) throw graphError(response, "The authorized Facebook user could not be read");
    if (!isRecord(body) || typeof body.id !== "string" || typeof body.name !== "string") {
      throw new ApplicationError("service_unavailable", "Meta omitted the authorized user", 503);
    }
    return { id: body.id, displayName: body.name };
  }

  public async readManagedPages(
    userAccessToken: string,
  ): Promise<readonly FacebookPageAuthorization[]> {
    const url = this.#graphUrl("me/accounts");
    url.search = new URLSearchParams({
      fields: "id,name,tasks,access_token",
      limit: "100",
      access_token: userAccessToken,
    }).toString();
    const response = await this.#request(
      url,
      { signal: AbortSignal.timeout(requestTimeoutMs) },
      "Facebook Pages could not be read",
    );
    const body = await readJson(response);
    if (!response.ok) throw graphError(response, "Facebook Pages could not be read");
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new ApplicationError("service_unavailable", "Meta omitted Page data", 503);
    }
    const pages = body.data.flatMap((entry): FacebookPageAuthorization[] => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.access_token !== "string" ||
        !Array.isArray(entry.tasks) ||
        !entry.tasks.every((task) => typeof task === "string")
      ) {
        return [];
      }
      if (!entry.tasks.some((task) => facebookPageContentTasks.has(task))) return [];
      return [
        {
          id: entry.id,
          displayName: entry.name,
          accessToken: entry.access_token,
          capabilities: entry.tasks,
        },
      ];
    });
    if (pages.length > 0) return pages;

    const targetIds = await this.#readGranularPageTargets(userAccessToken);
    const targetedPages: FacebookPageAuthorization[] = [];
    for (let offset = 0; offset < targetIds.length; offset += targetedPageBatchSize) {
      targetedPages.push(
        ...(await Promise.all(
          targetIds
            .slice(offset, offset + targetedPageBatchSize)
            .map((pageId) => this.#readTargetedPage(userAccessToken, pageId)),
        )),
      );
    }
    if (targetedPages.length === 0) {
      throw new ApplicationError(
        "not_found",
        "No manageable Facebook Page is available for this account",
        404,
      );
    }
    return targetedPages;
  }

  async #readGranularPageTargets(userAccessToken: string): Promise<readonly string[]> {
    const url = this.#graphUrl("debug_token");
    url.search = new URLSearchParams({ input_token: userAccessToken }).toString();
    const response = await this.#request(
      url,
      {
        headers: { authorization: `Bearer ${this.#appId}|${this.#appSecret}` },
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
      "Facebook Page authorization targets could not be verified",
    );
    const body = await readJson(response);
    if (!response.ok) {
      throw graphError(response, "Facebook Page authorization targets could not be verified");
    }
    const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
    if (
      !data ||
      data.app_id !== this.#appId ||
      data.is_valid !== true ||
      typeof data.type !== "string" ||
      data.type.toUpperCase() !== "USER" ||
      typeof data.user_id !== "string" ||
      !isStringArray(data.scopes) ||
      !Array.isArray(data.granular_scopes)
    ) {
      throw new ApplicationError(
        "authentication_failed",
        "Meta returned invalid Page authorization targets",
        401,
      );
    }
    const scopes = data.scopes;
    const allowedScopes = new Set<string>([...facebookOAuthScopes, "public_profile"]);
    if (
      !facebookOAuthScopes.every((scope) => scopes.includes(scope)) ||
      scopes.some((scope) => !allowedScopes.has(scope))
    ) {
      throw new ApplicationError(
        "permission_denied",
        "Facebook did not grant all approved Page permissions",
        403,
      );
    }

    const targetsByScope = new Map<string, Set<string>>(
      facebookOAuthScopes.map((scope) => [scope, new Set<string>()]),
    );
    for (const granularScope of data.granular_scopes) {
      if (!isRecord(granularScope) || typeof granularScope.scope !== "string") {
        throw new ApplicationError(
          "service_unavailable",
          "Meta returned invalid granular Page authorization data",
          503,
        );
      }
      const targets = targetsByScope.get(granularScope.scope);
      if (!targets) continue;
      if (!isFacebookPageIdArray(granularScope.target_ids)) {
        throw new ApplicationError(
          "service_unavailable",
          "Meta returned invalid granular Page authorization data",
          503,
        );
      }
      for (const targetId of granularScope.target_ids) targets.add(targetId);
    }

    const [firstScope, ...remainingScopes] = facebookOAuthScopes;
    const firstTargets = targetsByScope.get(firstScope);
    const targetIds = [...(firstTargets ?? [])]
      .filter((targetId) =>
        remainingScopes.every((scope) => targetsByScope.get(scope)?.has(targetId) === true),
      )
      .sort();
    if (targetIds.length > maximumTargetedPages) {
      throw new ApplicationError(
        "service_unavailable",
        "Meta returned too many Page authorization targets",
        503,
      );
    }
    return targetIds;
  }

  async #readTargetedPage(
    userAccessToken: string,
    pageId: string,
  ): Promise<FacebookPageAuthorization> {
    const url = this.#graphUrl(pageId);
    url.search = new URLSearchParams({
      fields: "name,access_token",
      access_token: userAccessToken,
    }).toString();
    const response = await this.#request(
      url,
      { signal: AbortSignal.timeout(requestTimeoutMs) },
      "Facebook Page could not be read",
    );
    const body = await readJson(response);
    if (!response.ok) throw graphError(response, "Facebook Page could not be read");
    if (
      !isRecord(body) ||
      body.id !== pageId ||
      typeof body.name !== "string" ||
      typeof body.access_token !== "string"
    ) {
      throw new ApplicationError("service_unavailable", "Meta omitted targeted Page data", 503);
    }
    return {
      id: pageId,
      displayName: body.name,
      accessToken: body.access_token,
      capabilities: [...facebookOAuthScopes],
    };
  }

  public async revokeAuthorization(userAccessToken: string): Promise<void> {
    const url = this.#graphUrl("me/permissions");
    url.search = new URLSearchParams({ access_token: userAccessToken }).toString();
    const response = await this.#request(
      url,
      { method: "DELETE", signal: AbortSignal.timeout(requestTimeoutMs) },
      "Facebook authorization could not be revoked",
    );
    if (!response.ok && response.status !== 400 && response.status !== 401) {
      throw graphError(response, "Facebook authorization could not be revoked");
    }
  }

  public async uploadPageVideo(input: {
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
  }): Promise<{ readonly videoId: string; readonly videoUrl: string }> {
    const createUrl = this.#graphUrl(`${this.#appId}/uploads`);
    createUrl.search = new URLSearchParams({
      access_token: input.userAccessToken,
      file_length: String(input.byteSize),
      file_name: "jingtang-review.mp4",
      file_type: input.mediaType,
    }).toString();
    const created = await this.#request(
      createUrl,
      { method: "POST", signal: combineSignal(input.signal, requestTimeoutMs) },
      "Meta upload session could not be created",
    );
    const createdBody = await readJson(created);
    if (!created.ok) throw graphError(created, "Meta upload session could not be created");
    const uploadSessionHandle = isRecord(createdBody) ? createdBody.id : undefined;
    if (
      typeof uploadSessionHandle !== "string" ||
      !uploadSessionHandle.startsWith("upload:") ||
      uploadSessionHandle.length === "upload:".length
    ) {
      throw new ApplicationError("service_unavailable", "Meta omitted the upload session", 503);
    }

    const uploadSessionId = uploadSessionHandle.slice("upload:".length);
    const uploadUrl = this.#graphUrl(`upload:${encodeURIComponent(uploadSessionId)}`);
    const digest = createHash("sha256");
    let streamedBytes = 0;
    const verifiedBody = input.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          streamedBytes += chunk.byteLength;
          digest.update(chunk);
          controller.enqueue(chunk);
        },
      }),
    );
    const upload = await this.#request(
      uploadUrl,
      {
        method: "POST",
        headers: {
          authorization: `OAuth ${input.userAccessToken}`,
          file_offset: "0",
          "content-length": String(input.byteSize),
          "content-type": "application/octet-stream",
        },
        body: verifiedBody,
        duplex: "half",
        signal: combineSignal(input.signal, uploadTimeoutMs),
      } as RequestInit & { duplex: "half" },
      "Meta upload completion is unknown",
      true,
    );
    const uploadBody = await readJson(upload);
    if (!upload.ok) {
      if (upload.status >= 500)
        throw new ApplicationError("conflict", "Meta upload completion is unknown", 409);
      throw graphError(upload, "Meta rejected the video upload");
    }
    if (streamedBytes !== input.byteSize) throw new Error("source_asset_size_mismatch");
    if (digest.digest("hex") !== input.sha256) throw new Error("source_asset_hash_mismatch");
    const handle = isRecord(uploadBody) ? uploadBody.h : undefined;
    if (typeof handle !== "string") {
      throw new ApplicationError(
        "service_unavailable",
        "Meta omitted the uploaded file handle",
        503,
      );
    }

    const publishUrl = this.#graphVideoUrl(`${input.pageId}/videos`);
    const form = new FormData();
    form.set("access_token", input.pageAccessToken);
    form.set("fbuploader_video_file_chunk", handle);
    form.set("title", input.title);
    form.set("description", input.description);
    const published = await this.#request(
      publishUrl,
      {
        method: "POST",
        body: form,
        signal: combineSignal(input.signal, requestTimeoutMs),
      },
      "Facebook Page publish completion is unknown",
      true,
    );
    const publishedBody = await readJson(published);
    if (!published.ok) {
      if (published.status >= 500) {
        throw new ApplicationError("conflict", "Facebook Page publish completion is unknown", 409);
      }
      throw graphError(published, "Facebook Page rejected the video publish");
    }
    const videoId = isRecord(publishedBody) ? publishedBody.id : undefined;
    if (typeof videoId !== "string") {
      throw new ApplicationError("service_unavailable", "Meta omitted the Page video ID", 503);
    }
    return {
      videoId,
      videoUrl: `https://www.facebook.com/${encodeURIComponent(input.pageId)}/videos/${encodeURIComponent(videoId)}`,
    };
  }

  public async readVideoStatus(input: {
    readonly pageAccessToken: string;
    readonly videoId: string;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly state: "processing" | "published" | "failed";
    readonly failureCategory?: string;
  }> {
    const url = this.#graphUrl(input.videoId);
    url.search = new URLSearchParams({
      fields: "id,status,permalink_url",
      access_token: input.pageAccessToken,
    }).toString();
    const response = await this.#request(
      url,
      { signal: combineSignal(input.signal, requestTimeoutMs) },
      "Facebook Page video status could not be read",
    );
    const body = await readJson(response);
    if (!response.ok) throw graphError(response, "Facebook Page video status could not be read");
    const status = isRecord(body) && isRecord(body.status) ? body.status.video_status : undefined;
    if (status === "ready" || status === "published") return { state: "published" };
    if (status === "error")
      return { state: "failed", failureCategory: "provider_processing_failed" };
    return { state: "processing" };
  }

  public verifySignedRequest(
    signedRequest: string,
    now: number = Date.now(),
  ): { readonly userId: string; readonly issuedAt: number } {
    const [encodedSignature, encodedPayload, ...rest] = signedRequest.split(".");
    if (!encodedSignature || !encodedPayload || rest.length > 0) {
      throw new ApplicationError("invalid_input", "Invalid Meta signed request", 400);
    }
    const received = Buffer.from(encodedSignature, "base64url");
    const expected = createHmac("sha256", this.#appSecret).update(encodedPayload).digest();
    if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
      throw new ApplicationError("permission_denied", "Invalid Meta signed request", 403);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    } catch {
      throw new ApplicationError("invalid_input", "Invalid Meta signed request", 400);
    }
    if (
      !isRecord(payload) ||
      payload.algorithm !== "HMAC-SHA256" ||
      typeof payload.user_id !== "string" ||
      !payload.user_id ||
      typeof payload.issued_at !== "number" ||
      !Number.isSafeInteger(payload.issued_at) ||
      payload.issued_at > Math.floor(now / 1000) + 60 ||
      payload.issued_at < Math.floor(now / 1000) - maximumSignedRequestAgeSeconds
    ) {
      throw new ApplicationError("invalid_input", "Meta signed request omitted the user", 400);
    }
    return { userId: payload.user_id, issuedAt: payload.issued_at };
  }
}
