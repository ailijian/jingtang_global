import { createServer } from "node:http";

import {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { S3AssetStorage } from "./s3-asset-storage.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

describe("S3AssetStorage", () => {
  function storage() {
    return new S3AssetStorage({
      endpoint: "https://cos.ap-seoul.myqcloud.com",
      region: "ap-seoul",
      bucket: "review-test-1234567890",
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
      forcePathStyle: false,
      autoCreateBucket: false,
      serverSideEncryption: "bucket_default",
    });
  }

  it("creates a short-lived direct upload constrained by media integrity headers", async () => {
    const upload = await storage().createDirectUpload({
      key: "workspaces/w/source-assets/a/video.mp4",
      contentType: "video/mp4",
      contentLength: 7,
      sha256Hex: "0".repeat(64),
      sha256Base64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      expiresInSeconds: 600,
    });

    const url = new URL(upload.url);
    expect(url.hostname).toContain("review-test-1234567890");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("x-amz-checksum-sha256");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("x-amz-meta-jingtang-sha256");
    expect(url.searchParams.has("x-amz-checksum-sha256")).toBe(false);
    expect(url.searchParams.has("x-amz-meta-jingtang-sha256")).toBe(false);
    expect(upload.headers).toEqual({
      "content-type": "video/mp4",
      "x-amz-checksum-sha256": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "x-amz-meta-jingtang-sha256": "0".repeat(64),
    });
  });

  it("reads upload metadata and totals every object-list page", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({
        ContentType: "video/mp4",
        ContentLength: 7,
        Metadata: { "jingtang-sha256": "a".repeat(64) },
      } as never)
      .mockResolvedValueOnce({
        Contents: [{ Size: 5 }, { Size: 7 }],
        IsTruncated: true,
        NextContinuationToken: "next",
      } as never)
      .mockResolvedValueOnce({ Contents: [{ Size: 11 }], IsTruncated: false } as never);
    const objectStorage = storage();

    await expect(objectStorage.stat("object")).resolves.toEqual({
      contentType: "video/mp4",
      contentLength: 7,
      sha256Hex: "a".repeat(64),
    });
    await expect(objectStorage.activeBytes("workspaces/")).resolves.toBe(23);

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(ListObjectsV2Command);
    expect((send.mock.calls[2]?.[0] as ListObjectsV2Command).input.ContinuationToken).toBe("next");
  });

  it("defers to the COS KMS bucket default without an object-level AES override", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = new S3AssetStorage({
      endpoint: "https://cos.ap-seoul.myqcloud.com",
      region: "ap-seoul",
      bucket: "kms-default-test",
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
      forcePathStyle: false,
      autoCreateBucket: false,
      serverSideEncryption: "bucket_default",
    });

    await storage.put({
      key: "opaque-source-id",
      body: new Uint8Array([1]),
      contentType: "application/octet-stream",
      sha256Base64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input.ServerSideEncryption).toBeUndefined();
  });

  it("aborts a storage request that does not return", async () => {
    const server = createServer(() => undefined);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test_server_address_missing");
    const storage = new S3AssetStorage({
      endpoint: `http://127.0.0.1:${address.port}`,
      region: "ap-southeast-1",
      bucket: "timeout-test",
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
      forcePathStyle: true,
      autoCreateBucket: false,
      serverSideEncryption: false,
      requestTimeoutMs: 20,
    });

    await expect(storage.delete("hung-object")).rejects.toBeDefined();
  });
});
