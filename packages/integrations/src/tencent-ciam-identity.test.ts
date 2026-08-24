import { describe, expect, it } from "vitest";

import {
  TencentCiamIdentityDeletionProvider,
  TencentCiamIdentityProvider,
} from "./tencent-ciam-identity.js";

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}

function requestBody(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error("expected_text_request_body");
}

function provider(responses: Response[]): {
  readonly provider: TencentCiamIdentityProvider;
  readonly calls: FetchCall[];
  readonly deleted: Array<{ readonly UserStoreId: string; readonly UserIds: readonly string[] }>;
} {
  const calls: FetchCall[] = [];
  const deleted: Array<{ readonly UserStoreId: string; readonly UserIds: readonly string[] }> = [];
  return {
    calls,
    deleted,
    provider: new TencentCiamIdentityProvider({
      issuer: "https://ciam.example.test/",
      clientId: "client-id",
      clientSecret: "client-secret",
      passwordAuthSourceId: "password-source",
      userStoreId: "user-store",
      fetch: (input, init) => {
        calls.push({ url: requestUrl(input), init: init ?? {} });
        const next = responses.shift();
        if (!next) return Promise.reject(new Error("unexpected_request"));
        return Promise.resolve(next);
      },
      admin: {
        DeleteUsers: (input) => {
          deleted.push(input);
          return Promise.resolve({});
        },
      },
    }),
  };
}

describe("TencentCiamIdentityProvider", () => {
  it("keeps passwords out of the server challenge and confirms signup with CIAM", async () => {
    const fixture = provider([response({ otp_token: "otp-token" }), response({ sub: "ciam-sub" })]);
    const signup = await fixture.provider.signUp({
      email: " Owner@Example.test ",
      password: "a-private-password",
      name: "Owner",
    });
    expect(signup.confirmed).toBe(false);
    if (!signup.challenge) throw new Error("signup_challenge_missing");
    const challenge = JSON.parse(
      Buffer.from(signup.challenge, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(challenge).toEqual({
      v: 1,
      purpose: "signup",
      email: "owner@example.test",
      otpToken: "otp-token",
    });
    expect(signup.challenge).not.toContain("a-private-password");

    await expect(
      fixture.provider.confirmSignUp({
        email: "owner@example.test",
        code: "123456",
        password: "a-private-password",
        name: "Owner",
        challenge: signup.challenge,
      }),
    ).resolves.toEqual({ subject: "ciam-sub", email: "owner@example.test", name: "Owner" });
    expect(JSON.parse(requestBody(fixture.calls[1]?.init.body)) as unknown).toMatchObject({
      password: "a-private-password",
      nickname: "Owner",
      email_otp_token: "otp-token",
      email_otp: "123456",
    });
  });

  it("uses the password source and resolves the immutable profile from userinfo", async () => {
    const fixture = provider([
      response({ access_token: "access-token" }),
      response({ sub: "ciam-sub", email: "owner@example.test", name: "Owner" }),
    ]);
    await expect(
      fixture.provider.authenticate({
        email: "OWNER@example.test",
        password: "a-private-password",
      }),
    ).resolves.toEqual({ subject: "ciam-sub", email: "owner@example.test", name: "Owner" });
    expect(requestBody(fixture.calls[0]?.init.body)).toContain("auth_source_id=password-source");
    expect(fixture.calls[0]?.init.headers).not.toMatchObject({ authorization: "" });
    expect(fixture.calls[1]?.init.headers).toMatchObject({ authorization: "Bearer access-token" });
  });

  it("keeps reset requests enumeration-safe and deletes by immutable CIAM subject", async () => {
    const fixture = provider([response({ error: "user_not_found" }, 404)]);
    await expect(fixture.provider.requestPasswordReset("missing@example.test")).resolves.toEqual(
      {},
    );
    await fixture.provider.deleteAccount({ email: "owner@example.test", subject: "ciam-sub" });
    expect(fixture.deleted).toEqual([{ UserStoreId: "user-store", UserIds: ["ciam-sub"] }]);
  });

  it("supports worker account deletion without a browser OAuth client secret", async () => {
    const deleted: Array<{ readonly UserStoreId: string; readonly UserIds: readonly string[] }> =
      [];
    const deletion = new TencentCiamIdentityDeletionProvider({
      userStoreId: "user-store",
      admin: {
        DeleteUsers: (input) => {
          deleted.push(input);
          return Promise.resolve({});
        },
      },
    });
    await deletion.deleteAccount({ email: "owner@example.test", subject: "ciam-sub" });
    expect(deleted).toEqual([{ UserStoreId: "user-store", UserIds: ["ciam-sub"] }]);
  });

  it("rejects a non-HTTPS issuer", () => {
    expect(
      () =>
        new TencentCiamIdentityProvider({
          issuer: "http://ciam.example.test",
          clientId: "client-id",
          clientSecret: "client-secret",
          passwordAuthSourceId: "password-source",
          userStoreId: "user-store",
          fetch: globalThis.fetch,
          admin: { DeleteUsers: () => Promise.resolve({}) },
        }),
    ).toThrow("ciam_issuer_https_required");
  });
});
