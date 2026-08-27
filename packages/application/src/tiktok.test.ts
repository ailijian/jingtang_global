import { describe, expect, it } from "vitest";

import {
  parseStoredTikTokAuthorization,
  tikTokAuthorizationRequiresRefresh,
  tikTokExecutionFailureDisposition,
  tikTokOAuthScopes,
  tikTokUploadChunkSize,
  tikTokUploadPlan,
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

  it("uses exact TikTok upload plans without an undersized trailing chunk", () => {
    const mebibyte = 1024 * 1024;
    expect(tikTokUploadPlan(4 * mebibyte)).toEqual({
      chunkSize: 4 * mebibyte,
      totalChunkCount: 1,
    });
    expect(tikTokUploadPlan(64 * mebibyte)).toEqual({
      chunkSize: 64 * mebibyte,
      totalChunkCount: 1,
    });
    expect(tikTokUploadPlan(65 * mebibyte)).toEqual({
      chunkSize: Math.floor((65 * mebibyte) / 2),
      totalChunkCount: 2,
    });
    expect(tikTokUploadPlan(500 * mebibyte)).toEqual({
      chunkSize: Math.floor((500 * mebibyte) / 8),
      totalChunkCount: 8,
    });
    expect(tikTokUploadChunkSize(100 * mebibyte)).toBe(50 * mebibyte);
    expect(() => tikTokUploadChunkSize(0)).toThrow("invalid_video_size");
  });

  it("never retries policy or identity drift as an unattended operation", () => {
    expect(tikTokExecutionFailureDisposition("creator_info_changed", 1)).toEqual({
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
});
