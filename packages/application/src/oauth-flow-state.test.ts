import { describe, expect, it } from "vitest";

import {
  assertFacebookOAuthFlowBinding,
  assertTikTokOAuthFlowBinding,
  assertYouTubeOAuthFlowBinding,
  createOAuthPkce,
  facebookOAuthStateDigest,
  FacebookOAuthFlowStateCodec,
  TikTokOAuthFlowStateCodec,
  YouTubeOAuthFlowStateCodec,
} from "./oauth-flow-state.js";

const secret = "a-test-oauth-state-secret-with-at-least-32-characters";

function context(expiresAt: number = Date.now() + 600_000) {
  return {
    state: "opaque-state",
    codeVerifier: "code-verifier",
    sessionId: "session-id",
    userId: "user-id",
    workspaceId: "workspace-id",
    channelId: "channel-id",
    consentRecordId: "consent-record-id",
    locale: "en" as const,
    expiresAt,
  };
}

describe("YouTube OAuth flow state", () => {
  it("creates RFC 7636 S256 PKCE material", () => {
    const flow = createOAuthPkce();
    expect(flow.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(flow.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(flow.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("round-trips session and Workspace binding without plaintext disclosure", () => {
    const codec = new YouTubeOAuthFlowStateCodec(secret);
    const sealed = codec.seal(context());
    expect(sealed).not.toContain("workspace-id");
    expect(codec.open(sealed, "opaque-state")).toMatchObject({
      sessionId: "session-id",
      userId: "user-id",
      workspaceId: "workspace-id",
      consentRecordId: "consent-record-id",
    });
  });

  it("rejects a mismatched state, expired context, and tampering", () => {
    const codec = new YouTubeOAuthFlowStateCodec(secret);
    const sealed = codec.seal(context());
    expect(() => codec.open(sealed, "different-state")).toThrow();
    expect(() => codec.open(codec.seal(context(1)), "opaque-state", 2)).toThrow();
    const segments = sealed.split(".");
    const ciphertext = segments[2];
    expect(ciphertext).toBeDefined();
    const replacement = ciphertext?.startsWith("A") ? "B" : "A";
    segments[2] = `${replacement}${ciphertext?.slice(1)}`;
    expect(() => codec.open(segments.join("."), "opaque-state")).toThrow();
  });

  it("rejects callback reuse after the active Session, User, Workspace, or locale changes", () => {
    const binding = context();
    const current = {
      sessionId: binding.sessionId,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      locale: binding.locale,
    };
    expect(() => assertYouTubeOAuthFlowBinding(binding, current)).not.toThrow();
    for (const mismatch of [
      { ...current, sessionId: "other-session" },
      { ...current, userId: "other-user" },
      { ...current, workspaceId: "other-workspace" },
      { ...current, locale: "zh-CN" as const },
    ]) {
      expect(() => assertYouTubeOAuthFlowBinding(binding, mismatch)).toThrow();
    }
  });
});

describe("Facebook OAuth flow state", () => {
  const facebookContext = {
    state: "facebook-state",
    sessionId: "session-id",
    userId: "user-id",
    workspaceId: "workspace-id",
    channelId: "channel-id",
    consentRecordId: "consent-record-id",
    locale: "en" as const,
    expiresAt: Date.now() + 600_000,
  };

  it("round-trips an opaque, authenticated session and Workspace binding", () => {
    const codec = new FacebookOAuthFlowStateCodec(secret);
    const sealed = codec.seal(facebookContext);
    expect(sealed).not.toContain("workspace-id");
    expect(codec.open(sealed, "facebook-state")).toEqual(facebookContext);
  });

  it("derives a stable non-reversible callback claim", () => {
    expect(facebookOAuthStateDigest("facebook-state")).toMatch(/^[0-9a-f]{64}$/);
    expect(facebookOAuthStateDigest("facebook-state")).not.toContain("facebook-state");
    expect(facebookOAuthStateDigest("other-state")).not.toBe(
      facebookOAuthStateDigest("facebook-state"),
    );
  });

  it("rejects state mismatch, expiry, tampering, and active-context changes", () => {
    const codec = new FacebookOAuthFlowStateCodec(secret);
    const sealed = codec.seal(facebookContext);
    expect(() => codec.open(sealed, "wrong-state")).toThrow();
    expect(() =>
      codec.open(codec.seal({ ...facebookContext, expiresAt: 1 }), "facebook-state", 2),
    ).toThrow();
    const segments = sealed.split(".");
    segments[2] = `${segments[2]?.startsWith("A") ? "B" : "A"}${segments[2]?.slice(1)}`;
    expect(() => codec.open(segments.join("."), "facebook-state")).toThrow();

    const current = {
      sessionId: facebookContext.sessionId,
      userId: facebookContext.userId,
      workspaceId: facebookContext.workspaceId,
      locale: facebookContext.locale,
    };
    expect(() => assertFacebookOAuthFlowBinding(facebookContext, current)).not.toThrow();
    expect(() =>
      assertFacebookOAuthFlowBinding(facebookContext, { ...current, workspaceId: "other" }),
    ).toThrow();
  });
});

describe("TikTok OAuth flow state", () => {
  const tikTokContext = {
    state: "tiktok-state",
    sessionId: "session-id",
    userId: "user-id",
    workspaceId: "workspace-id",
    channelId: "channel-id",
    consentRecordId: "consent-record-id",
    locale: "en" as const,
    expiresAt: Date.now() + 600_000,
  };

  it("round-trips opaque state and rejects a changed active Workspace", () => {
    const codec = new TikTokOAuthFlowStateCodec(secret);
    const sealed = codec.seal(tikTokContext);
    expect(sealed).not.toContain("workspace-id");
    expect(codec.open(sealed, "tiktok-state")).toEqual(tikTokContext);
    expect(() => codec.open(sealed, "wrong-state")).toThrow();
    expect(() =>
      assertTikTokOAuthFlowBinding(tikTokContext, {
        sessionId: "session-id",
        userId: "user-id",
        workspaceId: "other-workspace",
        locale: "en",
      }),
    ).toThrow();
  });
});
