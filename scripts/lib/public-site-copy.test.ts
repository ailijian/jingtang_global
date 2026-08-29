import { describe, expect, it } from "vitest";

import { extractPublicCopy } from "./public-site-copy.js";

describe("extractPublicCopy", () => {
  it("includes rendered text and public text attributes", () => {
    const copy = extractPublicCopy(
      '<html><head><meta name="description" content="Public description"></head>' +
        '<body><img alt="Public image"><p>Visible D7 copy</p></body></html>',
    );

    expect(copy).toContain("Public description");
    expect(copy).toContain("Public image");
    expect(copy).toContain("Visible D7 copy");
  });

  it("includes JSON-LD structured data", () => {
    const copy = extractPublicCopy(
      '<script type="application/ld+json">{"description":"Public D7 metadata"}</script>',
    );

    expect(copy).toContain("Public D7 metadata");
  });

  it("ignores opaque hydration and asset identifiers", () => {
    const copy = extractPublicCopy(
      '<link href="/_next/static/D7.css"><main>Public page</main>' +
        '<script>self.__next_f.push([1,"build-id-D7"])</script>',
    );

    expect(copy).toContain("Public page");
    expect(copy).not.toContain("D7");
  });

  it("decodes entities before evaluating public copy", () => {
    expect(extractPublicCopy("<p>D&#55; &amp; public</p>")).toContain("D7 & public");
  });
});
