export interface AssetStorage {
  put(input: {
    readonly key: string;
    readonly body: Uint8Array;
    readonly contentType: string;
    readonly sha256Base64: string;
  }): Promise<void>;
  delete(key: string): Promise<void>;
}
