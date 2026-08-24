import { describe, expect, it } from "vitest";

import { tencentCredentialToS3Provider } from "./tencent-cloud-credentials.js";

describe("Tencent Cloud temporary credentials", () => {
  it("maps a CVM role credential to the COS S3 credential shape", async () => {
    const provider = tencentCredentialToS3Provider({
      getCredential: () =>
        Promise.resolve({
          secretId: "temporary-id",
          secretKey: "temporary-key",
          token: "temporary-token",
        }),
    });

    await expect(provider()).resolves.toEqual({
      accessKeyId: "temporary-id",
      secretAccessKey: "temporary-key",
      sessionToken: "temporary-token",
    });
  });

  it("rejects an incomplete metadata credential", async () => {
    const provider = tencentCredentialToS3Provider({
      getCredential: () =>
        Promise.resolve({ secretId: "temporary-id", secretKey: "temporary-key" }),
    });

    await expect(provider()).rejects.toThrow("tencent_temporary_credential_invalid");
  });
});
