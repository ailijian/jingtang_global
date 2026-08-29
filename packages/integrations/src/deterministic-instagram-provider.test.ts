import { inspect } from "node:util";

import {
  instagramOAuthScopes,
  instagramReelSettings,
  InstagramMediaReadUrl,
} from "@jingtang/application";
import { describe, expect, it } from "vitest";

import { DeterministicInstagramProvider } from "./deterministic-instagram-provider.js";

const secret = "instagram-fixture-secret-with-at-least-32-characters";
const sha256 = "a".repeat(64);

describe("Deterministic Instagram provider", () => {
  it("models exact OAuth scope and minimal Professional identity without network access", async () => {
    const provider = new DeterministicInstagramProvider(secret);
    const authorizationUrl = provider.authorizationUrl({
      state: "sealed-state",
      redirectUri: "https://platform.local.invalid/api/v1/channels/instagram/oauth/callback",
    });
    expect(authorizationUrl.origin).toBe("https://instagram.local.invalid");
    expect(authorizationUrl.searchParams.get("scope")?.split(",")).toEqual(instagramOAuthScopes);
    const authorization = await provider.exchangeAuthorizationCode({
      code: "controlled-instagram-code",
      redirectUri: "https://platform.local.invalid/api/v1/channels/instagram/oauth/callback",
    });
    await expect(provider.readProfessionalIdentity(authorization.accessToken)).resolves.toEqual({
      userId: "instagram-professional-fixture",
      username: "jingtang_fixture",
      professionalAccount: true,
    });
    expect("revokeAuthorization" in provider).toBe(false);
  });

  it("issues an object-bound GET-only URL that redacts every ordinary representation", async () => {
    const provider = new DeterministicInstagramProvider(secret);
    const mediaUrl = await provider.issueReadUrl({
      objectKey: "workspace/asset.mp4",
      method: "GET",
      expiresInSeconds: 300,
      expectedByteSize: 1024,
      expectedSha256: sha256,
    });
    expect(String(mediaUrl)).toBe("[REDACTED_INSTAGRAM_MEDIA_URL]");
    expect(JSON.stringify({ mediaUrl })).not.toContain("fixture_signature");
    expect(inspect(mediaUrl)).toBe("InstagramMediaReadUrl [REDACTED]");
    await expect(
      provider.issueReadUrl({
        objectKey: "workspace/asset.mp4",
        method: "GET",
        expiresInSeconds: 3_601,
        expectedByteSize: 1024,
        expectedSha256: sha256,
      }),
    ).rejects.toThrow("instagram_media_url_request_invalid");
  });

  it("creates and publishes exactly one deterministic Reels-tab-only fixture", async () => {
    const provider = new DeterministicInstagramProvider(secret);
    const mediaUrl = new InstagramMediaReadUrl(
      "https://cos.local.invalid/private/asset.mp4?fixture_signature=secret",
    );
    const created = await provider.createReelContainer({
      accessToken: "controlled-instagram-access-token",
      userId: "instagram-professional-fixture",
      caption: "Confirmed caption",
      mediaUrl,
      settings: instagramReelSettings,
    });
    await expect(
      provider.readContainerStatus({
        accessToken: "controlled-instagram-access-token",
        containerId: created.containerId,
      }),
    ).resolves.toEqual({ state: "finished" });
    const published = await provider.publishContainer({
      accessToken: "controlled-instagram-access-token",
      userId: "instagram-professional-fixture",
      containerId: created.containerId,
    });
    expect(published.mediaId).toMatch(/^fixture-media-/u);
    await expect(
      provider.publishContainer({
        accessToken: "controlled-instagram-access-token",
        userId: "instagram-professional-fixture",
        containerId: created.containerId,
      }),
    ).rejects.toThrow("instagram_fixture_publish_rejected");
  });

  it("verifies only the explicit local callback fixture format", async () => {
    const provider = new DeterministicInstagramProvider(secret);
    const rawBody = new TextEncoder().encode(
      JSON.stringify({
        kind: "deauthorization",
        correlation_subject: "fixture-authorization:instagram-professional-fixture",
        replay_key: "fixture-callback-1",
      }),
    );
    await expect(
      provider.verify({
        kind: "deauthorization",
        headers: { "x-jingtang-fixture-signature": provider.signCallbackFixture(rawBody) },
        rawBody,
      }),
    ).resolves.toEqual({
      kind: "deauthorization",
      correlationSubject: "fixture-authorization:instagram-professional-fixture",
      replayKey: "fixture-callback-1",
    });
    await expect(
      provider.verify({
        kind: "deauthorization",
        headers: { "x-jingtang-fixture-signature": "0".repeat(64) },
        rawBody,
      }),
    ).rejects.toThrow("instagram_fixture_callback_signature_invalid");
  });
});
