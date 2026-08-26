import { describe, expect, it } from "vitest";

import { facebookExecutionFailureDisposition } from "./facebook.js";

describe("facebook publishing failure policy", () => {
  it("requires attention when pre-publish identity or Page capability validation changes", () => {
    expect(facebookExecutionFailureDisposition("authorized_channel_identity_mismatch", 1)).toEqual({
      needsAttention: true,
      terminal: true,
    });
  });
});
