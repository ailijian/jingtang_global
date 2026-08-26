import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { hasTrustedSameOriginMetadata, parseFormBody } from "./http";

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

  it("accepts an opaque Origin for a same-origin browser navigation", () => {
    expect(hasTrustedSameOriginMetadata("null", "same-origin", expectedOrigin, "navigate")).toBe(
      true,
    );
  });

  it.each([
    ["cross-site", "navigate"],
    ["same-site", "navigate"],
    ["same-origin", "cors"],
    ["same-origin", null],
  ])("rejects an opaque Origin with Fetch Metadata %s/%s", (fetchSite, fetchMode) => {
    expect(hasTrustedSameOriginMetadata("null", fetchSite, expectedOrigin, fetchMode)).toBe(false);
  });

  it.each([null, "same-site", "cross-site", "none"])(
    "rejects a missing Origin with Fetch Metadata %s",
    (fetchSite) => {
      expect(hasTrustedSameOriginMetadata(null, fetchSite, expectedOrigin)).toBe(false);
    },
  );
});

describe("parseFormBody", () => {
  it("accepts a bounded form-encoded body", async () => {
    const request = new NextRequest(`${expectedOrigin}/form`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: "consent=accepted",
    });
    await expect(parseFormBody(request)).resolves.toEqual(new URLSearchParams("consent=accepted"));
  });

  it("rejects unsupported encoding and oversized declared or streamed bodies", async () => {
    const wrongEncoding = new NextRequest(`${expectedOrigin}/form`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await expect(parseFormBody(wrongEncoding)).rejects.toMatchObject({
      code: "invalid_input",
      status: 400,
    });
    const declaredTooLarge = new NextRequest(`${expectedOrigin}/form`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": "5000",
      },
      body: "x=1",
    });
    await expect(parseFormBody(declaredTooLarge)).rejects.toMatchObject({
      code: "payload_too_large",
      status: 413,
    });
    const streamedTooLarge = new NextRequest(`${expectedOrigin}/form`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `x=${"a".repeat(32)}`,
    });
    await expect(parseFormBody(streamedTooLarge, 16)).rejects.toMatchObject({
      code: "payload_too_large",
      status: 413,
    });
  });
});
