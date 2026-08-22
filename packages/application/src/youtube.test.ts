import { describe, expect, it } from "vitest";

import { youtubeExecutionFailureDisposition } from "./youtube.js";

describe("YouTube execution failure disposition", () => {
  it.each(["service_unavailable", "rate_limited", "provider_processing_pending"])(
    "retries transient %s failures before the bounded final attempt",
    (failureCategory) => {
      expect(youtubeExecutionFailureDisposition(failureCategory, 1)).toEqual({
        needsAttention: false,
        terminal: false,
      });
      expect(youtubeExecutionFailureDisposition(failureCategory, 4)).toEqual({
        needsAttention: false,
        terminal: true,
      });
    },
  );

  it.each(["authentication_failed", "permission_denied", "execution_recovery_required"])(
    "moves user-correctable %s failures to Needs Attention",
    (failureCategory) => {
      expect(youtubeExecutionFailureDisposition(failureCategory, 1)).toEqual({
        needsAttention: true,
        terminal: true,
      });
    },
  );

  it("does not retry invalid source assets", () => {
    expect(youtubeExecutionFailureDisposition("source_asset_size_mismatch", 1)).toEqual({
      needsAttention: false,
      terminal: true,
    });
  });
});
