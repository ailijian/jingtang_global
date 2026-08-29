import { describe, expect, it } from "vitest";

import {
  parseStoredTikTokAuthorization,
  tikTokAuthorizationRequiresRefresh,
  tikTokExecutionFailureDisposition,
  TikTokMediaAccessTokenCodec,
  tikTokOAuthScopes,
  tikTokPublishStatusFailureDisposition,
  tikTokMediaUrlTtlSeconds,
} from "./tiktok.js";

describe("TikTok R4 policy", () => {
  it("accepts only the two approved scopes in stored authorization", () => {
    const authorization = {
      accessToken: "access-token",
      accessTokenExpiresAt: "2026-08-27T13:00:00.000Z",
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: "2027-08-27T13:00:00.000Z",
      openId: "creator-open-id",
      grantedScopes: [...tikTokOAuthScopes],
    };
    expect(parseStoredTikTokAuthorization(authorization)).toEqual(authorization);
    expect(() =>
      parseStoredTikTokAuthorization({
        ...authorization,
        grantedScopes: [...tikTokOAuthScopes, "video.upload"],
      }),
    ).toThrow("token_envelope_invalid");
  });

  it("refreshes access tokens before the five-minute safety boundary", () => {
    const now = Date.parse("2026-08-27T12:00:00.000Z");
    expect(tikTokAuthorizationRequiresRefresh("2026-08-27T12:04:59.999Z", now)).toBe(true);
    expect(tikTokAuthorizationRequiresRefresh("2026-08-27T12:05:00.001Z", now)).toBe(false);
    expect(tikTokAuthorizationRequiresRefresh("invalid", now)).toBe(true);
  });

  it("issues a redacted provider-only URL bound to object integrity, method, and lifetime", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    const codec = new TikTokMediaAccessTokenCodec(
      "a-dedicated-tiktok-media-signing-secret",
      "https://review.jingtangai.com",
    );
    const mediaUrl = codec.issueReadUrl(
      {
        objectKey: "workspaces/workspace/source-assets/asset/video.mp4",
        expectedByteSize: 7,
        expectedSha256: "a".repeat(64),
      },
      now,
    );
    const providerUrl = new URL(mediaUrl.revealForProviderRequest());
    const token = providerUrl.searchParams.get("token") ?? "";

    expect(providerUrl.origin + providerUrl.pathname).toBe(
      "https://review.jingtangai.com/api/v1/media/tiktok",
    );
    expect(codec.verifyToken(token, now)).toEqual({
      objectKey: "workspaces/workspace/source-assets/asset/video.mp4",
      expectedByteSize: 7,
      expectedSha256: "a".repeat(64),
      method: "GET",
      issuedAt: Math.floor(now / 1000),
      expiresAt: Math.floor(now / 1000) + tikTokMediaUrlTtlSeconds,
    });
    expect(String(mediaUrl)).toBe("[REDACTED_TIKTOK_MEDIA_URL]");
    expect(JSON.stringify({ mediaUrl })).not.toContain(token);
  });

  it("rejects tampered, expired, oversized, or non-Workspace TikTok media grants", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    const codec = new TikTokMediaAccessTokenCodec(
      "a-dedicated-tiktok-media-signing-secret",
      "https://review.jingtangai.com",
    );
    const mediaUrl = codec.issueReadUrl(
      {
        objectKey: "workspaces/workspace/source-assets/asset/video.mp4",
        expectedByteSize: 7,
        expectedSha256: "b".repeat(64),
      },
      now,
    );
    const token = new URL(mediaUrl.revealForProviderRequest()).searchParams.get("token") ?? "";

    expect(() => codec.verifyToken(`${token.slice(0, -1)}x`, now)).toThrow(
      "tiktok_media_token_invalid",
    );
    expect(() => codec.verifyToken(token, now + (tikTokMediaUrlTtlSeconds + 1) * 1000)).toThrow(
      "tiktok_media_token_expired",
    );
    expect(() =>
      codec.issueReadUrl({
        objectKey: "backups/postgres/not-media",
        expectedByteSize: 7,
        expectedSha256: "b".repeat(64),
      }),
    ).toThrow("tiktok_media_url_request_invalid");
    expect(() =>
      codec.issueReadUrl({
        objectKey: "workspaces/workspace/source-assets/asset/video.mp4",
        expectedByteSize: 500 * 1024 * 1024 + 1,
        expectedSha256: "b".repeat(64),
      }),
    ).toThrow("tiktok_media_url_request_invalid");
  });

  it("never retries policy or identity drift as an unattended operation", () => {
    expect(tikTokExecutionFailureDisposition("creator_info_changed", 1)).toEqual({
      needsAttention: true,
      terminal: true,
    });
    expect(tikTokExecutionFailureDisposition("conflict", 1)).toEqual({
      needsAttention: true,
      terminal: true,
    });
    expect(tikTokExecutionFailureDisposition("tiktok_self_only_required", 1)).toEqual({
      needsAttention: false,
      terminal: true,
    });
    expect(tikTokExecutionFailureDisposition("tiktok_private_publish_settings_invalid", 1)).toEqual(
      {
        needsAttention: false,
        terminal: true,
      },
    );
    expect(tikTokExecutionFailureDisposition("service_unavailable", 1)).toEqual({
      needsAttention: false,
      terminal: false,
    });
  });

  it("routes terminal TikTok publish failures by their provider recovery semantics", () => {
    expect(tikTokPublishStatusFailureDisposition("tiktok_auth_removed", 1, 90)).toEqual({
      needsAttention: true,
      terminal: true,
      requireReauthorization: true,
    });
    expect(tikTokPublishStatusFailureDisposition("tiktok_spam_risk", 1, 90)).toEqual({
      needsAttention: false,
      terminal: true,
      requireReauthorization: false,
    });
  });

  it("keeps internal retryable after prior processing polls until the status budget is exhausted", () => {
    expect(tikTokPublishStatusFailureDisposition("tiktok_internal", 4, 90)).toEqual({
      needsAttention: false,
      terminal: false,
      requireReauthorization: false,
    });
    expect(tikTokPublishStatusFailureDisposition("tiktok_internal", 90, 90)).toEqual({
      needsAttention: true,
      terminal: true,
      requireReauthorization: false,
    });
  });
});
