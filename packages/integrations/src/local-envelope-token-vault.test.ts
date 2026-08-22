import { describe, expect, it } from "vitest";

import { LocalEnvelopeTokenVault } from "./local-envelope-token-vault.js";

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("local envelope token vault", () => {
  it("round-trips a token without placing plaintext in the envelope", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const envelope = await vault.seal({ refreshToken: "refresh-token-value" });
    expect(envelope).not.toContain("refresh-token-value");
    await expect(vault.open(envelope)).resolves.toEqual({ refreshToken: "refresh-token-value" });
  });

  it("uses a fresh data key and nonce for every sealed value", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const first = await vault.seal({ accessToken: "same-token" });
    const second = await vault.seal({ accessToken: "same-token" });
    expect(first).not.toBe(second);
  });

  it("rejects a tampered envelope", async () => {
    const vault = new LocalEnvelopeTokenVault(key);
    const envelope = await vault.seal({ accessToken: "access-token" });
    const replacement = envelope.endsWith("A") ? "B" : "A";
    await expect(vault.open(`${envelope.slice(0, -1)}${replacement}`)).rejects.toMatchObject({
      code: "authentication_failed",
    });
  });
});
