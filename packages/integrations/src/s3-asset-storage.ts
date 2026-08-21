import {
  CreateBucketCommand,
  DeleteObjectCommand,
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
  }) {
    this.#bucket = input.bucket;
    this.#autoCreateBucket = input.autoCreateBucket;
    this.#serverSideEncryption = input.serverSideEncryption;
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

  async #ensureBucket(): Promise<void> {
    if (!this.#autoCreateBucket) return;
    this.#ready ??= (async () => {
      try {
        await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
      } catch {
        await this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }));
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
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ChecksumSHA256: input.sha256Base64,
        ...(this.#serverSideEncryption ? { ServerSideEncryption: "AES256" as const } : {}),
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }
}
