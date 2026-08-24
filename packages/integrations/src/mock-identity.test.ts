import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MockIdentityProvider } from "./mock-identity.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function storePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "jingtang-local-identity-"));
  temporaryDirectories.push(directory);
  return join(directory, "identity.json");
}

describe("MockIdentityProvider persistence", () => {
  it("allows protected provisioning while denying public identity self-service", async () => {
    const storagePath = storePath();
    const provider = new MockIdentityProvider({ storagePath, selfServiceEnabled: false });
    provider.provisionIdentity({
      email: "reviewer@example.com",
      password: "a-review-password-123",
      name: "Platform Reviewer",
    });
    await expect(
      provider.authenticate({ email: "reviewer@example.com", password: "a-review-password-123" }),
    ).resolves.toMatchObject({ email: "reviewer@example.com" });
    await expect(
      Promise.resolve().then(() =>
        provider.signUp({
          email: "public@example.com",
          password: "a-public-password-123",
          name: "Public User",
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(provider.requestPasswordReset("reviewer@example.com")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("authenticates an account after the provider restarts", async () => {
    const storagePath = storePath();
    const first = new MockIdentityProvider({ storagePath });
    const signedUp = await first.signUp({
      email: "owner@example.test",
      password: "durable-local-password",
      name: "Local Owner",
    });

    const restarted = new MockIdentityProvider({ storagePath });
    await expect(
      restarted.authenticate({
        email: "owner@example.test",
        password: "durable-local-password",
      }),
    ).resolves.toMatchObject({ subject: signedUp.profile?.subject, name: "Local Owner" });
    expect(readFileSync(storagePath, "utf8")).not.toContain("durable-local-password");
  });

  it("recovers an existing database identity through the local reset flow", async () => {
    const storagePath = storePath();
    const provider = new MockIdentityProvider({
      storagePath,
      resolveExistingProfile: (email) =>
        Promise.resolve({
          subject: "existing-subject",
          email,
          name: "Existing Owner",
        }),
    });

    await provider.requestPasswordReset("existing@example.test");
    await provider.confirmPasswordReset({
      email: "existing@example.test",
      code: "000000",
      newPassword: "restored-local-password",
    });

    await expect(
      new MockIdentityProvider({ storagePath }).authenticate({
        email: "existing@example.test",
        password: "restored-local-password",
      }),
    ).resolves.toMatchObject({ subject: "existing-subject" });
  });
});
