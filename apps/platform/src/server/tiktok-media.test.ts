import { createHash } from "node:crypto";

import type { AssetStorage } from "@jingtang/application";
import { TikTokMediaAccessTokenCodec, tikTokMediaUrlTtlSeconds } from "@jingtang/application";
import { describe, expect, it, vi } from "vitest";

import { serveTikTokMedia } from "./tiktok-media.js";

const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const objectKey = "workspaces/workspace/source-assets/asset/video.mp4";
const secret = "a-dedicated-tiktok-media-url-signing-secret";

function stream(body: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
}

function storage(overrides: Partial<AssetStorage> = {}): {
  readonly assets: AssetStorage;
  readonly open: ReturnType<typeof vi.fn>;
} {
  const open = vi
    .fn()
    .mockImplementation(
      (_key: string, range?: { readonly start: number; readonly end: number }) => {
        const selected = range ? bytes.slice(range.start, range.end + 1) : bytes;
        return Promise.resolve({
          body: stream(selected),
          contentType: "video/mp4",
          contentLength: selected.byteLength,
          ...(range
            ? { contentRange: `bytes ${range.start}-${range.end}/${bytes.byteLength}` }
            : {}),
        });
      },
    );
  return {
    open,
    assets: {
      createDirectUpload: vi.fn(),
      stat: vi.fn().mockResolvedValue({
        contentType: "video/mp4",
        contentLength: bytes.byteLength,
        sha256Hex: sha256,
      }),
      activeBytes: vi.fn(),
      put: vi.fn(),
      open,
      delete: vi.fn(),
      ...overrides,
    },
  };
}

function requestUrl(codec: TikTokMediaAccessTokenCodec, now = Date.now()): string {
  return codec
    .issueReadUrl(
      {
        objectKey,
        expectedByteSize: bytes.byteLength,
        expectedSha256: sha256,
      },
      now,
    )
    .revealForProviderRequest();
}

describe("TikTok provider-only media endpoint", () => {
  it("serves only the integrity-bound private object without caching", async () => {
    const codec = new TikTokMediaAccessTokenCodec(secret, "https://review.jingtangai.com");
    const { assets, open } = storage();
    const response = await serveTikTokMedia(new Request(requestUrl(codec)), { codec, assets });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(open).toHaveBeenCalledWith(objectKey, undefined);
  });

  it("supports provider byte ranges and HEAD without reading the object body", async () => {
    const codec = new TikTokMediaAccessTokenCodec(secret, "https://review.jingtangai.com");
    const { assets, open } = storage();
    const url = requestUrl(codec);
    const ranged = await serveTikTokMedia(new Request(url, { headers: { range: "bytes=2-4" } }), {
      codec,
      assets,
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe("bytes 2-4/7");
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(bytes.slice(2, 5));

    const suffix = await serveTikTokMedia(new Request(url, { headers: { range: "bytes=-2" } }), {
      codec,
      assets,
    });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe("bytes 5-6/7");
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(bytes.slice(5));

    open.mockClear();
    const head = await serveTikTokMedia(new Request(url, { method: "HEAD" }), {
      codec,
      assets,
    });
    expect(head.status).toBe(200);
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect(open).not.toHaveBeenCalled();
  });

  it("fails closed for invalid ranges, expired grants, and changed object metadata", async () => {
    const now = Date.now();
    const codec = new TikTokMediaAccessTokenCodec(secret, "https://review.jingtangai.com");
    const { assets } = storage();
    const url = requestUrl(codec, now);
    const invalidRange = await serveTikTokMedia(
      new Request(url, { headers: { range: "bytes=99-100" } }),
      { codec, assets },
    );
    expect(invalidRange.status).toBe(416);

    const expiredUrl = requestUrl(codec, now - (tikTokMediaUrlTtlSeconds + 1) * 1000);
    const expired = await serveTikTokMedia(new Request(expiredUrl), { codec, assets });
    expect(expired.status).toBe(404);

    const { assets: changedAssets, open: changedOpen } = storage({
      stat: vi.fn().mockResolvedValue({
        contentType: "video/mp4",
        contentLength: bytes.byteLength,
        sha256Hex: "0".repeat(64),
      }),
    });
    const changed = await serveTikTokMedia(new Request(url), {
      codec,
      assets: changedAssets,
    });
    expect(changed.status).toBe(404);
    expect(changedOpen).not.toHaveBeenCalled();
  });

  it("does not echo a secret-equivalent token in failure responses", async () => {
    const codec = new TikTokMediaAccessTokenCodec(secret, "https://review.jingtangai.com");
    const token = "secret-equivalent-media-token";
    const response = await serveTikTokMedia(
      new Request(`https://review.jingtangai.com/api/v1/media/tiktok?token=${token}`),
      { codec, assets: storage().assets },
    );
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(token);
  });
});
