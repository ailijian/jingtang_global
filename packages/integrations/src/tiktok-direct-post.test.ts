import { describe, expect, it, vi } from "vitest";

import { tikTokOAuthScopes } from "@jingtang/application";

import { TikTokDirectPostProvider, tikTokFailureDiagnostics } from "./tiktok-direct-post.js";

function provider(fetchImplementation: typeof fetch = vi.fn<typeof fetch>()) {
  return new TikTokDirectPostProvider({
    clientKey: "company-client-key",
    clientSecret: "company-client-secret",
    fetchImplementation,
  });
}

function stream(bytes: readonly number[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

const settings = {
  privacyLevel: "SELF_ONLY" as const,
  disableComment: true,
  disableDuet: true,
  disableStitch: true,
  brandContentToggle: false as const,
  brandOrganicToggle: false,
  isAigc: false,
  musicUsageConfirmed: true as const,
  creatorInfoConfirmed: true as const,
};

describe("TikTok Login Kit and Direct Post provider", () => {
  it("builds Login Kit Web authorization with exactly the approved scopes", () => {
    const url = provider().authorizationUrl({
      state: "opaque-state",
      redirectUri: "https://review.jingtangai.com/api/v1/channels/tiktok/oauth/callback",
    });
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("scope")?.split(",")).toEqual(tikTokOAuthScopes);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  it("exchanges a code and rejects missing or expanded scopes", async () => {
    const valid = {
      access_token: "access-token",
      expires_in: 86_400,
      refresh_token: "refresh-token",
      refresh_expires_in: 31_536_000,
      open_id: "creator-open-id",
      scope: tikTokOAuthScopes.join(","),
    };
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(valid))
      .mockResolvedValueOnce(Response.json({ ...valid, scope: "user.info.basic" }))
      .mockResolvedValueOnce(
        Response.json({ ...valid, scope: `${tikTokOAuthScopes.join(",")},video.list` }),
      );
    await expect(
      provider(fetchImplementation).exchangeAuthorizationCode({
        code: "authorization-code",
        redirectUri: "https://review.jingtangai.com/api/v1/channels/tiktok/oauth/callback",
      }),
    ).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      openId: "creator-open-id",
      grantedScopes: tikTokOAuthScopes,
    });
    const [, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(request?.body).toBeInstanceOf(URLSearchParams);
    expect((request?.body as URLSearchParams).get("client_secret")).toBe("company-client-secret");
    await expect(
      provider(fetchImplementation).refreshAuthorization("refresh-token"),
    ).rejects.toMatchObject({ code: "permission_denied" });
    await expect(
      provider(fetchImplementation).refreshAuthorization("refresh-token"),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("queries fresh Creator Info and initializes only SELF_ONLY FILE_UPLOAD", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            creator_username: "creator",
            creator_nickname: "Creator",
            privacy_level_options: ["SELF_ONLY"],
            comment_disabled: false,
            duet_disabled: true,
            stitch_disabled: true,
            max_video_post_duration_sec: 60,
          },
          error: { code: "ok", message: "", log_id: "log" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            publish_id: "publish-id",
            upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=opaque",
          },
          error: { code: "ok", message: "", log_id: "log" },
        }),
      );
    const instance = provider(fetchImplementation);
    await expect(instance.readCreatorInfo("access-token")).resolves.toMatchObject({
      creatorUsername: "creator",
      privacyLevelOptions: ["SELF_ONLY"],
      duetDisabled: true,
      maximumVideoDurationSeconds: 60,
    });
    await expect(
      instance.initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        byteSize: 3,
        chunkSize: 3,
        totalChunkCount: 1,
        settings,
      }),
    ).resolves.toEqual({
      publishId: "publish-id",
      uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=opaque",
    });
    const [, init] = fetchImplementation.mock.calls[1] ?? [];
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
      post_info?: Record<string, unknown>;
      source_info?: Record<string, unknown>;
    };
    expect(body.post_info).toMatchObject({
      privacy_level: "SELF_ONLY",
      brand_content_toggle: false,
    });
    expect(body.source_info).toEqual({
      source: "FILE_UPLOAD",
      video_size: 3,
      chunk_size: 3,
      total_chunk_count: 1,
    });
  });

  it("uploads exact byte ranges and rejects non-TikTok upload hosts", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 201 }));
    await provider(fetchImplementation).uploadVideo({
      uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=opaque",
      body: stream([1, 2, 3]),
      byteSize: 3,
      chunkSize: 3,
      totalChunkCount: 1,
    });
    const [, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(new Headers(request?.headers).get("content-range")).toBe("bytes 0-2/3");
    expect(new Headers(request?.headers).get("content-type")).toBe("video/mp4");

    const invalidHostFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { publish_id: "publish-id", upload_url: "https://example.com/upload" },
        error: { code: "ok" },
      }),
    );
    let invalidHostError: unknown;
    try {
      await provider(invalidHostFetch).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        byteSize: 3,
        chunkSize: 3,
        totalChunkCount: 1,
        settings,
      });
    } catch (error) {
      invalidHostError = error;
    }
    expect(invalidHostError).toMatchObject({ code: "service_unavailable" });
    expect(tikTokFailureDiagnostics(invalidHostError)).toEqual({
      operation: "direct_post_init",
      httpStatus: 200,
      providerCode: "upload_host_rejected",
    });
  });

  it("accepts provider-controlled regional TikTok upload hosts", async () => {
    const uploadUrl =
      "https://open-upload-region.tiktokapis.com/video/?upload_id=opaque&upload_token=opaque";
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        data: { publish_id: "publish-id", upload_url: uploadUrl },
        error: { code: "ok" },
      }),
    );

    await expect(
      provider(fetchImplementation).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        byteSize: 3,
        chunkSize: 3,
        totalChunkCount: 1,
        settings,
      }),
    ).resolves.toEqual({ publishId: "publish-id", uploadUrl });
  });

  it("classifies Direct Post provider failures with safe diagnostics", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        data: {},
        error: {
          code: "unaudited_client_can_only_post_to_private_accounts",
          message: "must not be logged",
          log_id: "must-not-be-logged",
        },
      }),
    );
    let caught: unknown;
    try {
      await provider(fetchImplementation).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        byteSize: 3,
        chunkSize: 3,
        totalChunkCount: 1,
        settings,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "service_unavailable" });
    expect(tikTokFailureDiagnostics(caught)).toEqual({
      operation: "direct_post_init",
      httpStatus: 200,
      providerCode: "unaudited_client_can_only_post_to_private_accounts",
    });
    expect(tikTokFailureDiagnostics(caught)).not.toHaveProperty("message");
    expect(tikTokFailureDiagnostics(caught)).not.toHaveProperty("logId");
  });

  it("diagnoses successful Direct Post responses that omit upload data", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: {}, error: { code: "ok" } }));
    let caught: unknown;
    try {
      await provider(fetchImplementation).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        byteSize: 3,
        chunkSize: 3,
        totalChunkCount: 1,
        settings,
      });
    } catch (error) {
      caught = error;
    }
    expect(tikTokFailureDiagnostics(caught)).toEqual({
      operation: "direct_post_init",
      httpStatus: 200,
      providerCode: "upload_data_missing",
    });
  });

  it("merges trailing bytes into the final sequential chunk", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 206 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    await provider(fetchImplementation).uploadVideo({
      uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=opaque",
      body: stream([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      byteSize: 10,
      chunkSize: 4,
      totalChunkCount: 2,
    });
    expect(new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers).get("content-range")).toBe(
      "bytes 0-3/10",
    );
    expect(new Headers(fetchImplementation.mock.calls[1]?.[1]?.headers).get("content-range")).toBe(
      "bytes 4-9/10",
    );
  });

  it("maps TikTok publish completion without exposing provider diagnostics", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["post-id"] },
        error: { code: "ok", message: "private", log_id: "log" },
      }),
    );
    await expect(
      provider(fetchImplementation).readPostStatus({
        accessToken: "access-token",
        publishId: "publish-id",
      }),
    ).resolves.toEqual({ state: "published", publicPostId: "post-id" });
  });
});
