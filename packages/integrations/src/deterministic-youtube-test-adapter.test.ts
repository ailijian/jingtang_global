import type { YouTubeOAuthProvider } from "@jingtang/application";
import { describe, expect, it, vi } from "vitest";

import { DeterministicYouTubeTestAdapter } from "./deterministic-youtube-test-adapter.js";

function delegate() {
  const uploadPrivateVideo = vi.fn();
  const readVideoStatus = vi.fn();
  const provider: YouTubeOAuthProvider = {
    authorizationUrl: vi.fn(() => new URL("https://accounts.example.test")),
    exchangeAuthorizationCode: vi.fn(),
    refreshAuthorization: vi.fn(),
    readAuthorizedChannel: vi.fn(),
    uploadPrivateVideo,
    readVideoStatus,
  };
  return { provider, uploadPrivateVideo, readVideoStatus };
}

const upload = {
  accessToken: "access",
  title: "title",
  description: "description",
  madeForKids: false,
  mediaType: "video/mp4",
  byteSize: 1,
  body: new ReadableStream<Uint8Array>(),
} as const;

describe("Deterministic YouTube test adapter", () => {
  it.each([
    ["timeout", "service_unavailable"],
    ["quota", "rate_limited"],
    ["oauth_expired", "authentication_failed"],
    ["ambiguous_upload", "conflict"],
  ] as const)("produces the %s fault without calling YouTube", async (fault, code) => {
    const base = delegate();
    const adapter = new DeterministicYouTubeTestAdapter(base.provider, fault);
    await expect(adapter.uploadPrivateVideo(upload)).rejects.toMatchObject({ code });
    expect(base.uploadPrivateVideo).not.toHaveBeenCalled();
  });

  it("produces a deterministic provider processing failure without an external write", async () => {
    const base = delegate();
    const adapter = new DeterministicYouTubeTestAdapter(base.provider, "processing_failed");
    const result = await adapter.uploadPrivateVideo(upload);
    await expect(adapter.readVideoStatus("access", result.videoId)).resolves.toEqual({
      state: "failed",
      failureCategory: "controlled_test_fault",
    });
    expect(base.uploadPrivateVideo).not.toHaveBeenCalled();
    expect(base.readVideoStatus).not.toHaveBeenCalled();
  });
});
