import { describe, expect, it, vi } from "vitest";

import { TikTokMediaAccessTokenCodec, tikTokOAuthScopes } from "@jingtang/application";

import { TikTokDirectPostProvider, tikTokFailureDiagnostics } from "./tiktok-direct-post.js";

function provider(fetchImplementation: typeof fetch = vi.fn<typeof fetch>()) {
  return new TikTokDirectPostProvider({
    clientKey: "company-client-key",
    clientSecret: "company-client-secret",
    fetchImplementation,
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

function mediaUrl() {
  return new TikTokMediaAccessTokenCodec(
    "a-dedicated-tiktok-media-signing-secret",
    "https://review.jingtangai.com",
  ).issueReadUrl({
    objectKey: "workspaces/workspace/source-assets/asset/video.mp4",
    expectedByteSize: 3,
    expectedSha256: "a".repeat(64),
  });
}

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

  it("requires reauthorization when TikTok rejects a refresh token", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: "invalid_grant", error_description: "Refresh token was revoked" },
          { status: 400 },
        ),
      );
    let caught: unknown;
    try {
      await provider(fetchImplementation).refreshAuthorization("revoked-refresh-token");
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "authentication_failed" });
    expect(tikTokFailureDiagnostics(caught)).toEqual({
      operation: "authorization_refresh",
      httpStatus: 400,
      providerCode: "invalid_grant",
    });
  });

  it("queries fresh Creator Info and initializes only SELF_ONLY PULL_FROM_URL", async () => {
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
          data: { publish_id: "publish-id" },
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
    const url = mediaUrl();
    await expect(
      instance.initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        mediaUrl: url,
        settings,
      }),
    ).resolves.toEqual({ publishId: "publish-id" });
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
      source: "PULL_FROM_URL",
      video_url: url.revealForProviderRequest(),
    });
    expect(JSON.stringify(url)).not.toContain("token=");
  });

  it("treats an ambiguous initialization network result as non-repeatable", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    let caught: unknown;
    try {
      await provider(fetchImplementation).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        mediaUrl: mediaUrl(),
        settings,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "conflict" });
    expect(tikTokFailureDiagnostics(caught)).toEqual({
      operation: "direct_post_init",
      httpStatus: 0,
      providerCode: "network_ambiguous",
    });
  });

  it("treats an unreadable successful initialization response as non-repeatable", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    let caught: unknown;
    try {
      await provider(fetchImplementation).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        mediaUrl: mediaUrl(),
        settings,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "conflict" });
    expect(tikTokFailureDiagnostics(caught)).toEqual({
      operation: "direct_post_init",
      httpStatus: 200,
      providerCode: "invalid_response_ambiguous",
    });
  });

  it.each(["unaudited_client_can_only_post_to_private_accounts", "url_ownership_unverified"])(
    "keeps Direct Post policy failure %s terminal without disconnecting",
    async (code) => {
      const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
        Response.json(
          {
            data: {},
            error: { code, message: "must not be logged", log_id: "must-not-be-logged" },
          },
          { status: 403 },
        ),
      );
      let caught: unknown;
      try {
        await provider(fetchImplementation).initializeDirectPost({
          accessToken: "access-token",
          title: "Private test",
          mediaUrl: mediaUrl(),
          settings,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "invalid_input" });
      expect(tikTokFailureDiagnostics(caught)).toEqual({
        operation: "direct_post_init",
        httpStatus: 403,
        providerCode: code,
      });
      expect(tikTokFailureDiagnostics(caught)).not.toHaveProperty("message");
      expect(tikTokFailureDiagnostics(caught)).not.toHaveProperty("logId");
    },
  );

  it("reserves permission failure for an explicit missing TikTok scope", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { data: {}, error: { code: "scope_not_authorized", message: "missing scope" } },
          { status: 403 },
        ),
      );
    await expect(
      provider(fetchImplementation).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        mediaUrl: mediaUrl(),
        settings,
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("diagnoses successful Direct Post responses that omit the publish reference", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: {}, error: { code: "ok" } }));
    let caught: unknown;
    try {
      await provider(fetchImplementation).initializeDirectPost({
        accessToken: "access-token",
        title: "Private test",
        mediaUrl: mediaUrl(),
        settings,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "conflict" });
    expect(tikTokFailureDiagnostics(caught)).toEqual({
      operation: "direct_post_init",
      httpStatus: 200,
      providerCode: "publish_reference_missing",
    });
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

  it("preserves TikTok publish failure reasons for worker recovery policy", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: { status: "FAILED", fail_reason: "auth_removed" },
          error: { code: "ok" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { status: "FAILED", fail_reason: "internal" },
          error: { code: "ok" },
        }),
      );
    const instance = provider(fetchImplementation);
    await expect(
      instance.readPostStatus({ accessToken: "access-token", publishId: "publish-id" }),
    ).resolves.toEqual({ state: "failed", failureCategory: "tiktok_auth_removed" });
    await expect(
      instance.readPostStatus({ accessToken: "access-token", publishId: "publish-id" }),
    ).resolves.toEqual({ state: "failed", failureCategory: "tiktok_internal" });
  });
});
