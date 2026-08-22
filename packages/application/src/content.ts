export interface AssetStorage {
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
