import { describe, expect, it } from "vitest";

import {
  assertYouTubeOAuthFlowBinding,
  createOAuthPkce,
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
