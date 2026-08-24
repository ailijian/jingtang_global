import { describe, expect, it } from "vitest";

import { hasTrustedSameOriginMetadata } from "./http";

const expectedOrigin = "https://review.jingtangai.com";

describe("hasTrustedSameOriginMetadata", () => {
  it("accepts an exact Origin header", () => {
    expect(hasTrustedSameOriginMetadata(expectedOrigin, null, expectedOrigin)).toBe(true);
  });

  it("rejects an explicit mismatched Origin even when Fetch Metadata says same-origin", () => {
    expect(
      hasTrustedSameOriginMetadata("https://attacker.example", "same-origin", expectedOrigin),
    ).toBe(false);
  });

  it("accepts same-origin Fetch Metadata when the browser omits Origin", () => {
    expect(hasTrustedSameOriginMetadata(null, "same-origin", expectedOrigin)).toBe(true);
  });

  it.each([null, "same-site", "cross-site", "none"])(
    "rejects a missing Origin with Fetch Metadata %s",
    (fetchSite) => {
      expect(hasTrustedSameOriginMetadata(null, fetchSite, expectedOrigin)).toBe(false);
    },
  );
});
