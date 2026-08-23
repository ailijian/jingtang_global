import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { AssetStorage } from "@jingtang/application";

export class S3AssetStorage implements AssetStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #autoCreateBucket: boolean;
  readonly #serverSideEncryption: boolean;
  readonly #requestTimeoutMs: number;
  #ready: Promise<void> | undefined;

  constructor(input: {
    readonly endpoint?: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
    readonly autoCreateBucket: boolean;
    readonly serverSideEncryption: boolean;
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
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
      },
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
          ...(this.#serverSideEncryption ? { ServerSideEncryption: "AES256" as const } : {}),
        }),
        { abortSignal },
      ),
    );
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
