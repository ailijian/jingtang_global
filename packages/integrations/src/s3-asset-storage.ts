import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AssetStorage } from "@jingtang/application";

import type { S3Credentials } from "./tencent-cloud-credentials.js";

export class S3AssetStorage implements AssetStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #autoCreateBucket: boolean;
  readonly #serverSideEncryption: false | "AES256" | "bucket_default";
  readonly #requestTimeoutMs: number;
  #ready: Promise<void> | undefined;

  constructor(input: {
    readonly endpoint?: string;
    readonly region: string;
    readonly bucket: string;
    readonly credentials: S3Credentials;
    readonly forcePathStyle: boolean;
    readonly autoCreateBucket: boolean;
    readonly serverSideEncryption: false | "AES256" | "bucket_default";
    readonly requestTimeoutMs?: number;
  }) {
    this.#bucket = input.bucket;
    this.#autoCreateBucket = input.autoCreateBucket;
    this.#serverSideEncryption = input.serverSideEncryption;
    this.#requestTimeoutMs = input.requestTimeoutMs ?? 120_000;
    this.#client = new S3Client({
      ...(input.endpoint ? { endpoint: input.endpoint } : {}),
      region: input.region,
      forcePathStyle: input.forcePathStyle,
      credentials: input.credentials,
    });
  }

  async #withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  async #ensureBucket(): Promise<void> {
    if (!this.#autoCreateBucket) return;
    this.#ready ??= (async () => {
      try {
        await this.#withTimeout((abortSignal) =>
          this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }), { abortSignal }),
        );
      } catch {
        await this.#withTimeout((abortSignal) =>
          this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }), { abortSignal }),
        );
      }
    })();
    await this.#ready;
  }

  async put(input: {
    readonly key: string;
    readonly body: Uint8Array;
    readonly contentType: string;
    readonly sha256Base64: string;
  }): Promise<void> {
    await this.#ensureBucket();
    await this.#withTimeout((abortSignal) =>
      this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ChecksumSHA256: input.sha256Base64,
          ...(this.#serverSideEncryption === "AES256"
            ? { ServerSideEncryption: "AES256" as const }
            : {}),
        }),
        { abortSignal },
      ),
    );
  }

  async createDirectUpload(input: {
    readonly key: string;
    readonly contentType: string;
    readonly contentLength: number;
    readonly sha256Hex: string;
    readonly sha256Base64: string;
    readonly expiresInSeconds: number;
  }): Promise<{ readonly url: string; readonly headers: Readonly<Record<string, string>> }> {
    await this.#ensureBucket();
    const metadataHeader = "x-amz-meta-jingtang-sha256";
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      ChecksumSHA256: input.sha256Base64,
      Metadata: { "jingtang-sha256": input.sha256Hex },
      ...(this.#serverSideEncryption === "AES256"
        ? { ServerSideEncryption: "AES256" as const }
        : {}),
    });
    const url = await getSignedUrl(this.#client, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: new Set([
        "content-length",
        "content-type",
        "x-amz-checksum-sha256",
        metadataHeader,
      ]),
      unhoistableHeaders: new Set(["x-amz-checksum-sha256", metadataHeader]),
    });
    return {
      url,
      headers: {
        "content-type": input.contentType,
        "x-amz-checksum-sha256": input.sha256Base64,
        [metadataHeader]: input.sha256Hex,
      },
    };
  }

  async stat(key: string): Promise<{
    readonly contentType?: string;
    readonly contentLength?: number;
    readonly sha256Hex?: string;
  }> {
    const result = await this.#withTimeout((abortSignal) =>
      this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }), {
        abortSignal,
      }),
    );
    return {
      ...(result.ContentType ? { contentType: result.ContentType } : {}),
      ...(result.ContentLength !== undefined ? { contentLength: result.ContentLength } : {}),
      ...(result.Metadata?.["jingtang-sha256"]
        ? { sha256Hex: result.Metadata["jingtang-sha256"] }
        : {}),
    };
  }

  async activeBytes(prefix: string): Promise<number> {
    let continuationToken: string | undefined;
    let bytes = 0;
    do {
      const result = await this.#withTimeout((abortSignal) =>
        this.#client.send(
          new ListObjectsV2Command({
            Bucket: this.#bucket,
            Prefix: prefix,
            ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
          }),
          { abortSignal },
        ),
      );
      for (const object of result.Contents ?? []) {
        if (object.Size !== undefined) bytes += object.Size;
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      if (result.IsTruncated && !continuationToken) {
        throw new Error("object_storage_list_continuation_missing");
      }
    } while (continuationToken);
    return bytes;
  }

  async delete(key: string): Promise<void> {
    await this.#withTimeout((abortSignal) =>
      this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }), {
        abortSignal,
      }),
    );
  }

  async open(key: string): Promise<{
    readonly body: ReadableStream<Uint8Array>;
    readonly contentType?: string;
    readonly contentLength?: number;
  }> {
    const result = await this.#withTimeout((abortSignal) =>
      this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }), {
        abortSignal,
      }),
    );
    if (!result.Body) throw new Error("source_asset_body_missing");
    return {
      body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      ...(result.ContentType ? { contentType: result.ContentType } : {}),
      ...(result.ContentLength !== undefined ? { contentLength: result.ContentLength } : {}),
    };
  }
}
