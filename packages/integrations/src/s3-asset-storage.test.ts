import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { S3AssetStorage } from "./s3-asset-storage.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
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
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      forcePathStyle: true,
      autoCreateBucket: false,
      serverSideEncryption: false,
      requestTimeoutMs: 20,
    });

    await expect(storage.delete("hung-object")).rejects.toBeDefined();
  });
});
