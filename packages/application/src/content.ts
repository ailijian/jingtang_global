export interface AssetStorage {
  createDirectUpload(input: {
    readonly key: string;
    readonly contentType: string;
    readonly contentLength: number;
    readonly sha256Hex: string;
    readonly sha256Base64: string;
    readonly expiresInSeconds: number;
  }): Promise<{
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
  }>;
  stat(key: string): Promise<{
    readonly contentType?: string;
    readonly contentLength?: number;
    readonly sha256Hex?: string;
  }>;
  activeBytes(prefix: string): Promise<number>;
  put(input: {
    readonly key: string;
    readonly body: Uint8Array;
    readonly contentType: string;
    readonly sha256Base64: string;
  }): Promise<void>;
  open(key: string): Promise<{
    readonly body: ReadableStream<Uint8Array>;
    readonly contentType?: string;
    readonly contentLength?: number;
  }>;
  delete(key: string): Promise<void>;
}
