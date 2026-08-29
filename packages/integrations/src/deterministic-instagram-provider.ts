import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  InstagramMediaReadUrl,
  instagramOAuthScopes,
  instagramReelSettings,
  validateInstagramMediaUrlRequest,
  type InstagramAuthorizationTokens,
  type InstagramCallbackCorrelationBinder,
  type InstagramCallbackKind,
  type InstagramCallbackVerifier,
  type InstagramMediaUrlIssuer,
  type InstagramOAuthProvider,
  type InstagramProfessionalIdentity,
  type InstagramReelSettings,
  type VerifiedInstagramCallback,
} from "@jingtang/application";

const fixtureOrigin = "https://instagram.local.invalid";
const fixtureUserId = "instagram-professional-fixture";
const fixtureUsername = "jingtang_fixture";

function fixtureSignature(secret: string, body: Uint8Array): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function validSignature(actual: string | undefined, expected: string): boolean {
  if (!actual || !/^[0-9a-f]{64}$/u.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export class DeterministicInstagramProvider
  implements
    InstagramOAuthProvider,
    InstagramCallbackCorrelationBinder,
    InstagramCallbackVerifier,
    InstagramMediaUrlIssuer
{
  readonly #fixtureSecret: string;
  readonly #createdContainers = new Set<string>();
  readonly #publishedContainers = new Set<string>();

  public constructor(fixtureSecret: string) {
    if (fixtureSecret.length < 32) throw new Error("instagram_fixture_secret_invalid");
    this.#fixtureSecret = fixtureSecret;
  }

  public authorizationUrl(input: { readonly state: string; readonly redirectUri: string }): URL {
    const url = new URL("/oauth/authorize", fixtureOrigin);
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", instagramOAuthScopes.join(","));
    return url;
  }

  public async exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<InstagramAuthorizationTokens> {
    await Promise.resolve();
    if (input.code !== "controlled-instagram-code" || !input.redirectUri) {
      throw new Error("instagram_fixture_authorization_denied");
    }
    return {
      accessToken: "controlled-instagram-access-token",
      expiresAt: new Date("2026-10-27T00:00:00.000Z"),
      grantedScopes: instagramOAuthScopes,
    };
  }

  public async refreshAuthorization(accessToken: string): Promise<InstagramAuthorizationTokens> {
    await Promise.resolve();
    if (accessToken !== "controlled-instagram-access-token") {
      throw new Error("instagram_fixture_authorization_expired");
    }
    return {
      accessToken,
      expiresAt: new Date("2026-12-26T00:00:00.000Z"),
      grantedScopes: instagramOAuthScopes,
    };
  }

  public async readProfessionalIdentity(
    accessToken: string,
  ): Promise<InstagramProfessionalIdentity> {
    await Promise.resolve();
    if (accessToken !== "controlled-instagram-access-token") {
      throw new Error("instagram_fixture_authorization_expired");
    }
    return {
      userId: fixtureUserId,
      username: fixtureUsername,
      professionalAccount: true,
    };
  }

  public async bindAuthorization(input: {
    readonly authorization: InstagramAuthorizationTokens;
    readonly identity: InstagramProfessionalIdentity;
  }): Promise<{ readonly correlationSubject: string }> {
    await Promise.resolve();
    if (
      input.authorization.accessToken !== "controlled-instagram-access-token" ||
      input.identity.userId !== fixtureUserId
    ) {
      throw new Error("instagram_fixture_correlation_unavailable");
    }
    return { correlationSubject: `fixture-authorization:${fixtureUserId}` };
  }

  public async readPublishingLimit(input: {
    readonly accessToken: string;
    readonly userId: string;
  }): Promise<{ readonly quotaTotal: 100; readonly quotaUsage: number }> {
    await Promise.resolve();
    if (
      input.accessToken !== "controlled-instagram-access-token" ||
      input.userId !== fixtureUserId
    ) {
      throw new Error("instagram_fixture_authorization_expired");
    }
    return { quotaTotal: 100, quotaUsage: this.#publishedContainers.size };
  }

  public async issueReadUrl(input: {
    readonly objectKey: string;
    readonly method: "GET";
    readonly expiresInSeconds: number;
    readonly expectedByteSize: number;
    readonly expectedSha256: string;
  }): Promise<InstagramMediaReadUrl> {
    await Promise.resolve();
    validateInstagramMediaUrlRequest(input);
    const objectDigest = createHmac("sha256", this.#fixtureSecret)
      .update(input.method)
      .update("\0")
      .update(input.objectKey)
      .update("\0")
      .update(String(input.expectedByteSize))
      .update("\0")
      .update(input.expectedSha256)
      .digest("hex");
    const url = new URL(
      `/private/${encodeURIComponent(input.objectKey)}`,
      "https://cos.local.invalid",
    );
    url.searchParams.set("fixture_expires", String(input.expiresInSeconds));
    url.searchParams.set("fixture_signature", objectDigest);
    return new InstagramMediaReadUrl(url.toString());
  }

  public async createReelContainer(input: {
    readonly accessToken: string;
    readonly userId: string;
    readonly caption: string;
    readonly mediaUrl: InstagramMediaReadUrl;
    readonly settings: InstagramReelSettings;
  }): Promise<{ readonly containerId: string }> {
    await Promise.resolve();
    if (
      input.accessToken !== "controlled-instagram-access-token" ||
      input.userId !== fixtureUserId ||
      input.settings.mediaType !== instagramReelSettings.mediaType ||
      input.settings.shareToFeed !== instagramReelSettings.shareToFeed ||
      input.settings.publishMode !== instagramReelSettings.publishMode
    ) {
      throw new Error("instagram_fixture_publish_rejected");
    }
    const mediaDigest = createHash("sha256")
      .update(input.mediaUrl.revealForProviderRequest())
      .update("\0")
      .update(input.caption)
      .digest("hex")
      .slice(0, 24);
    const containerId = `fixture-container-${mediaDigest}`;
    this.#createdContainers.add(containerId);
    return { containerId };
  }

  public async readContainerStatus(input: {
    readonly accessToken: string;
    readonly containerId: string;
  }): Promise<{
    readonly state: "in_progress" | "finished" | "published" | "expired" | "failed";
    readonly failureCategory?: string;
  }> {
    await Promise.resolve();
    if (input.accessToken !== "controlled-instagram-access-token") {
      throw new Error("instagram_fixture_authorization_expired");
    }
    if (this.#publishedContainers.has(input.containerId)) return { state: "published" };
    return this.#createdContainers.has(input.containerId)
      ? { state: "finished" }
      : { state: "expired" };
  }

  public async publishContainer(input: {
    readonly accessToken: string;
    readonly userId: string;
    readonly containerId: string;
  }): Promise<{ readonly mediaId: string }> {
    await Promise.resolve();
    if (
      input.accessToken !== "controlled-instagram-access-token" ||
      input.userId !== fixtureUserId ||
      !this.#createdContainers.has(input.containerId) ||
      this.#publishedContainers.has(input.containerId)
    ) {
      throw new Error("instagram_fixture_publish_rejected");
    }
    this.#publishedContainers.add(input.containerId);
    return {
      mediaId: `fixture-media-${createHash("sha256").update(input.containerId).digest("hex").slice(0, 24)}`,
    };
  }

  public async verify(input: {
    readonly kind: InstagramCallbackKind;
    readonly headers: Readonly<Record<string, string>>;
    readonly rawBody: Uint8Array;
  }): Promise<VerifiedInstagramCallback> {
    await Promise.resolve();
    const expected = fixtureSignature(this.#fixtureSecret, input.rawBody);
    if (!validSignature(input.headers["x-jingtang-fixture-signature"], expected)) {
      throw new Error("instagram_fixture_callback_signature_invalid");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(input.rawBody));
    } catch {
      throw new Error("instagram_fixture_callback_invalid");
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("instagram_fixture_callback_invalid");
    }
    const entry = payload as Record<string, unknown>;
    if (
      entry.kind !== input.kind ||
      typeof entry.correlation_subject !== "string" ||
      !entry.correlation_subject ||
      typeof entry.replay_key !== "string" ||
      !entry.replay_key
    ) {
      throw new Error("instagram_fixture_callback_invalid");
    }
    return {
      kind: input.kind,
      correlationSubject: entry.correlation_subject,
      replayKey: entry.replay_key,
    };
  }

  public signCallbackFixture(rawBody: Uint8Array): string {
    return fixtureSignature(this.#fixtureSecret, rawBody);
  }
}
