import type { AssetStorage, TikTokMediaAccessTokenCodec } from "@jingtang/application";

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

function mediaHeaders(contentLength: number): Headers {
  return new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-length": String(contentLength),
    "content-type": "video/mp4",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
  });
}

function parseRange(value: string | null, totalBytes: number): ByteRange | undefined | null {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, totalBytes - suffixLength),
      end: totalBytes - 1,
    };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : totalBytes - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= totalBytes ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, totalBytes - 1) };
}

function hidden(status = 404): Response {
  return new Response(null, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function serveTikTokMedia(
  request: Request,
  dependencies: {
    readonly codec: TikTokMediaAccessTokenCodec;
    readonly assets: AssetStorage;
  },
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return hidden(405);
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return hidden();

  let claims: ReturnType<TikTokMediaAccessTokenCodec["verifyToken"]>;
  try {
    claims = dependencies.codec.verifyToken(token);
  } catch {
    return hidden();
  }

  let metadata: Awaited<ReturnType<AssetStorage["stat"]>>;
  try {
    metadata = await dependencies.assets.stat(claims.objectKey);
  } catch {
    return hidden(503);
  }
  if (
    metadata.contentType !== "video/mp4" ||
    metadata.contentLength !== claims.expectedByteSize ||
    metadata.sha256Hex !== claims.expectedSha256
  ) {
    return hidden();
  }

  const range = parseRange(request.headers.get("range"), claims.expectedByteSize);
  if (range === null) {
    return new Response(null, {
      status: 416,
      headers: {
        "cache-control": "no-store",
        "content-range": `bytes */${claims.expectedByteSize}`,
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const contentLength = range ? range.end - range.start + 1 : claims.expectedByteSize;
  const headers = mediaHeaders(contentLength);
  if (range)
    headers.set("content-range", `bytes ${range.start}-${range.end}/${claims.expectedByteSize}`);
  if (request.method === "HEAD") {
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  try {
    const asset = await dependencies.assets.open(claims.objectKey, range ?? undefined);
    const expectedContentRange = range
      ? `bytes ${range.start}-${range.end}/${claims.expectedByteSize}`
      : undefined;
    if (
      asset.contentType !== "video/mp4" ||
      asset.contentLength !== contentLength ||
      (expectedContentRange && asset.contentRange !== expectedContentRange)
    ) {
      await asset.body.cancel().catch(() => undefined);
      return hidden();
    }
    return new Response(asset.body, { status: range ? 206 : 200, headers });
  } catch {
    return hidden(503);
  }
}
