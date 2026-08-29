import { describe, expect, it } from "vitest";

import {
  InstagramMediaReadUrl,
  instagramCallbackReplayDigest,
  instagramOAuthScopes,
  instagramProviderOperationAllowlist,
  instagramSubjectCorrelationHash,
  nextInstagramExecutionAction,
  parseStoredInstagramAuthorization,
  validateInstagramMediaUrlRequest,
} from "./instagram.js";

describe("Instagram provider-independent contract", () => {
  it("freezes the exact permissions and provider operation surface", () => {
    expect(instagramOAuthScopes).toEqual([
      "instagram_business_basic",
      "instagram_business_content_publish",
    ]);
    expect(Object.keys(instagramProviderOperationAllowlist)).toEqual([
      "authorize",
      "exchangeCode",
      "exchangeLongLivedToken",
      "refreshToken",
      "readIdentity",
      "readPublishingLimit",
      "createReelContainer",
      "readContainer",
      "publishContainer",
    ]);
    expect(instagramProviderOperationAllowlist.createReelContainer.fields).toEqual([
      "access_token",
      "caption",
      "media_type=REELS",
      "share_to_feed=false",
      "video_url",
    ]);
    expect(JSON.stringify(instagramProviderOperationAllowlist)).not.toContain("permissions");
  });

  it("rejects missing or expanded stored permissions", () => {
    const valid = {
      accessToken: "secret-token",
      expiresAt: "2026-10-27T00:00:00.000Z",
      userId: "provider-user",
      grantedScopes: [...instagramOAuthScopes],
    };
    expect(parseStoredInstagramAuthorization(valid)).toEqual(valid);
    expect(() =>
      parseStoredInstagramAuthorization({
        ...valid,
        grantedScopes: [instagramOAuthScopes[0]],
      }),
    ).toThrow("token_envelope_invalid");
    expect(() =>
      parseStoredInstagramAuthorization({
        ...valid,
        grantedScopes: [...instagramOAuthScopes, "instagram_business_manage_comments"],
      }),
    ).toThrow("token_envelope_invalid");
  });

  it("uses domain-separated keyed one-way callback values", () => {
    const secret = "instagram-callback-correlation-secret-32-bytes";
    const subject = instagramSubjectCorrelationHash(secret, "provider-subject");
    const replay = instagramCallbackReplayDigest(secret, "provider-subject");
    expect(subject).toMatch(/^[0-9a-f]{64}$/u);
    expect(replay).toMatch(/^[0-9a-f]{64}$/u);
    expect(subject).not.toBe(replay);
    expect(subject).not.toContain("provider-subject");
  });

  it("redacts the signed media URL and bounds object/read authorization", () => {
    const url = new InstagramMediaReadUrl(
      "https://private.example.test/object.mp4?signature=secret",
    );
    expect(String(url)).toBe("[REDACTED_INSTAGRAM_MEDIA_URL]");
    expect(JSON.stringify({ url })).not.toContain("signature");
    expect(url.revealForProviderRequest()).toContain("signature=secret");
    expect(() => new InstagramMediaReadUrl("http://private.example.test/object.mp4")).toThrow();
    expect(() =>
      validateInstagramMediaUrlRequest({
        objectKey: "workspaces/1/object.mp4",
        method: "GET",
        expiresInSeconds: 3_601,
        expectedByteSize: 100,
        expectedSha256: "a".repeat(64),
      }),
    ).toThrow("instagram_media_url_request_invalid");
  });

  it("reconciles ambiguous writes instead of issuing duplicates", () => {
    expect(
      nextInstagramExecutionAction({
        createState: "ambiguous",
        publishState: "not_started",
        containerId: null,
        mediaId: null,
      }),
    ).toBe("reconcile_container_create");
    expect(
      nextInstagramExecutionAction({
        createState: "succeeded",
        publishState: "ambiguous",
        containerId: "container-1",
        mediaId: null,
      }),
    ).toBe("reconcile_media_publish");
    expect(
      nextInstagramExecutionAction(
        {
          createState: "succeeded",
          publishState: "not_started",
          containerId: "container-1",
          mediaId: null,
        },
        true,
      ),
    ).toBe("claim_media_publish");
  });
});
