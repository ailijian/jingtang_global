import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { facebookOAuthScopes } from "@jingtang/application";

import { MetaFacebookOAuthProvider } from "./meta-facebook.js";

const appSecret = "company-meta-app-secret";

function provider(
  fetchImplementation: typeof fetch = vi.fn<typeof fetch>(),
): MetaFacebookOAuthProvider {
  return new MetaFacebookOAuthProvider({
    appId: "meta-app-id",
    appSecret,
    loginConfigurationId: "1409921321080910",
    graphApiVersion: "v26.0",
    fetchImplementation,
  });
}

function signedRequest(payload: Record<string, unknown>, secret: string = appSecret): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

describe("Meta Facebook provider", () => {
  it("builds the pinned Facebook Login for Business authorization URL", () => {
    const url = provider().authorizationUrl({
      state: "opaque-state",
      redirectUri: "https://review.jingtangai.com/api/v1/channels/facebook/oauth/callback",
    });
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(url.searchParams.get("config_id")).toBe("1409921321080910");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  it("exchanges and verifies only the approved scopes plus automatic public_profile", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "short-token" }))
      .mockResolvedValueOnce(Response.json({ access_token: "long-token", expires_in: 5_184_000 }))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            ...facebookOAuthScopes.map((permission) => ({ permission, status: "granted" })),
            { permission: "public_profile", status: "granted" },
          ],
        }),
      );
    const tokens = await provider(fetchImplementation).exchangeAuthorizationCode({
      code: "authorization-code",
      redirectUri: "https://review.jingtangai.com/api/v1/channels/facebook/oauth/callback",
    });
    expect(tokens.userAccessToken).toBe("long-token");
    const [shortUrl] = fetchImplementation.mock.calls[0] ?? [];
    expect(shortUrl).toBeInstanceOf(URL);
    expect((shortUrl as URL).searchParams.get("client_secret")).toBe(appSecret);
    expect((shortUrl as URL).searchParams.get("code")).toBe("authorization-code");
  });

  it.each([
    { permissions: facebookOAuthScopes.slice(0, 2) },
    { permissions: [...facebookOAuthScopes, "pages_manage_engagement"] },
  ])("rejects missing or additional granted permissions", async ({ permissions }) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "long-token", expires_in: 5_184_000 }))
      .mockResolvedValueOnce(
        Response.json({
          data: permissions.map((permission) => ({ permission, status: "granted" })),
        }),
      );
    await expect(
      provider(fetchImplementation).refreshAuthorization("short-token"),
    ).rejects.toMatchObject({
      code: "permission_denied",
    });
  });

  it("returns Pages with either supported Page content task", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            id: "eligible-page",
            name: "JINGTANG",
            tasks: ["MODERATE", "CREATE_CONTENT"],
            access_token: "eligible-page-token",
          },
          {
            id: "profile-plus-page",
            name: "Jingtang",
            tasks: ["PROFILE_PLUS_FULL_CONTROL", "PROFILE_PLUS_CREATE_CONTENT"],
            access_token: "profile-plus-page-token",
          },
          {
            id: "non-content-page",
            name: "No explicit content task",
            tasks: ["MODERATE", "PROFILE_PLUS_FULL_CONTROL"],
            access_token: "must-be-discarded",
          },
          {
            id: "malformed-page",
            name: "Malformed",
            tasks: ["MODERATE"],
          },
        ],
      }),
    );
    await expect(provider(fetchImplementation).readManagedPages("user-token")).resolves.toEqual([
      {
        id: "eligible-page",
        displayName: "JINGTANG",
        capabilities: ["MODERATE", "CREATE_CONTENT"],
        accessToken: "eligible-page-token",
      },
      {
        id: "profile-plus-page",
        displayName: "Jingtang",
        capabilities: ["PROFILE_PLUS_FULL_CONTROL", "PROFILE_PLUS_CREATE_CONTENT"],
        accessToken: "profile-plus-page-token",
      },
    ]);
    const [url] = fetchImplementation.mock.calls[0] ?? [];
    expect((url as URL).pathname).toBe("/v26.0/me/accounts");
    expect((url as URL).searchParams.get("fields")).toBe("id,name,tasks,access_token");
  });

  it("falls back to Pages targeted by all approved granular permissions", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            app_id: "meta-app-id",
            type: "USER",
            is_valid: true,
            user_id: "meta-user-id",
            scopes: [...facebookOAuthScopes, "public_profile"],
            granular_scopes: [
              { scope: "pages_show_list", target_ids: ["1280459905148968", "111"] },
              { scope: "pages_read_engagement", target_ids: ["1280459905148968"] },
              { scope: "pages_manage_posts", target_ids: ["1280459905148968"] },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "1280459905148968",
          name: "Jingtang",
          access_token: "targeted-page-token",
        }),
      );

    await expect(provider(fetchImplementation).readManagedPages("user-token")).resolves.toEqual([
      {
        id: "1280459905148968",
        displayName: "Jingtang",
        accessToken: "targeted-page-token",
        capabilities: [...facebookOAuthScopes],
      },
    ]);
    const [debugUrl, debugInit] = fetchImplementation.mock.calls[1] ?? [];
    expect((debugUrl as URL).pathname).toBe("/v26.0/debug_token");
    expect((debugUrl as URL).searchParams.get("input_token")).toBe("user-token");
    expect((debugUrl as URL).searchParams.has("access_token")).toBe(false);
    expect(new Headers(debugInit?.headers).get("authorization")).toBe(
      `Bearer meta-app-id|${appSecret}`,
    );
    const [pageUrl] = fetchImplementation.mock.calls[2] ?? [];
    expect((pageUrl as URL).pathname).toBe("/v26.0/1280459905148968");
    expect((pageUrl as URL).searchParams.get("fields")).toBe("name,access_token");
  });

  it("does not fetch a Page unless every approved permission targets it", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            app_id: "meta-app-id",
            type: "USER",
            is_valid: true,
            user_id: "meta-user-id",
            scopes: [...facebookOAuthScopes, "public_profile"],
            granular_scopes: [
              { scope: "pages_show_list", target_ids: ["111"] },
              { scope: "pages_read_engagement", target_ids: ["111"] },
              { scope: "pages_manage_posts", target_ids: ["222"] },
            ],
          },
        }),
      );

    await expect(
      provider(fetchImplementation).readManagedPages("user-token"),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("rejects granular targets issued for a different Meta App", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            app_id: "different-app-id",
            type: "USER",
            is_valid: true,
            user_id: "meta-user-id",
            scopes: [...facebookOAuthScopes, "public_profile"],
            granular_scopes: [],
          },
        }),
      );

    await expect(
      provider(fetchImplementation).readManagedPages("user-token"),
    ).rejects.toMatchObject({ code: "authentication_failed" });
  });

  it("streams one resumable MP4 upload and publishes its handle to the exact Page", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "upload:upload-session" }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer())).toEqual(
          new Uint8Array([1, 2, 3]),
        );
        return Response.json({ h: "uploaded-file-handle" });
      })
      .mockResolvedValueOnce(Response.json({ id: "page-video-id" }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    await expect(
      provider(fetchImplementation).uploadPageVideo({
        userAccessToken: "user-token",
        pageAccessToken: "page-token",
        pageId: "company-page",
        title: "Approved title",
        description: "Approved description",
        mediaType: "video/mp4",
        byteSize: 3,
        sha256: createHash("sha256")
          .update(new Uint8Array([1, 2, 3]))
          .digest("hex"),
        body,
      }),
    ).resolves.toEqual({
      videoId: "page-video-id",
      videoUrl: "https://www.facebook.com/company-page/videos/page-video-id",
    });
    const [sessionUrl] = fetchImplementation.mock.calls[0] ?? [];
    expect((sessionUrl as URL).href).toContain("graph.facebook.com/v26.0/meta-app-id/uploads");
    const [uploadUrl, uploadInit] = fetchImplementation.mock.calls[1] ?? [];
    expect((uploadUrl as URL).href).toBe("https://graph.facebook.com/v26.0/upload:upload-session");
    expect(uploadInit?.body).toBeInstanceOf(ReadableStream);
    expect(new Headers(uploadInit?.headers).get("authorization")).toBe("OAuth user-token");
    const [publishUrl, publishInit] = fetchImplementation.mock.calls[2] ?? [];
    expect((publishUrl as URL).origin).toBe("https://graph-video.facebook.com");
    expect((publishUrl as URL).pathname).toBe("/v26.0/company-page/videos");
    expect(publishInit?.body).toBeInstanceOf(FormData);
    const form = publishInit?.body as FormData;
    expect(form.get("access_token")).toBe("page-token");
    expect(form.get("fbuploader_video_file_chunk")).toBe("uploaded-file-handle");
    expect(form.get("title")).toBe("Approved title");
  });

  it("does not retry-classify an ambiguous upload or publish completion as safe", async () => {
    const uploadFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "upload:upload-session" }))
      .mockRejectedValueOnce(new Error("connection closed"));
    await expect(
      provider(uploadFetch).uploadPageVideo({
        userAccessToken: "user-token",
        pageAccessToken: "page-token",
        pageId: "company-page",
        title: "Approved title",
        description: "",
        mediaType: "video/mp4",
        byteSize: 1,
        sha256: createHash("sha256")
          .update(new Uint8Array([1]))
          .digest("hex"),
        body: new ReadableStream<Uint8Array>(),
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const publishFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "upload:upload-session" }))
      .mockImplementationOnce(async (_url, init) => {
        await new Response(init?.body as BodyInit).arrayBuffer();
        return Response.json({ h: "handle" });
      })
      .mockResolvedValueOnce(Response.json({ error: { message: "private" } }, { status: 503 }));
    await expect(
      provider(publishFetch).uploadPageVideo({
        userAccessToken: "user-token",
        pageAccessToken: "page-token",
        pageId: "company-page",
        title: "Approved title",
        description: "",
        mediaType: "video/mp4",
        byteSize: 1,
        sha256: createHash("sha256")
          .update(new Uint8Array([1]))
          .digest("hex"),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("does not create a Page post when the streamed source hash differs from the approved asset", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "upload:upload-session" }))
      .mockImplementationOnce(async (_url, init) => {
        await new Response(init?.body as BodyInit).arrayBuffer();
        return Response.json({ h: "unpublished-handle" });
      });
    await expect(
      provider(fetchImplementation).uploadPageVideo({
        userAccessToken: "user-token",
        pageAccessToken: "page-token",
        pageId: "company-page",
        title: "Approved title",
        description: "",
        mediaType: "video/mp4",
        byteSize: 1,
        sha256: createHash("sha256")
          .update(new Uint8Array([2]))
          .digest("hex"),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
      }),
    ).rejects.toThrow("source_asset_hash_mismatch");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("verifies HMAC-SHA256 callbacks and rejects tampering, stale requests, and algorithm changes", () => {
    const now = Date.UTC(2026, 7, 26, 12, 0, 0);
    const issuedAt = Math.floor(now / 1000);
    const valid = signedRequest({
      algorithm: "HMAC-SHA256",
      issued_at: issuedAt,
      user_id: "meta-user",
    });
    expect(provider().verifySignedRequest(valid, now)).toEqual({ userId: "meta-user", issuedAt });
    expect(() => provider().verifySignedRequest(`${valid}x`, now)).toThrow();
    expect(() =>
      provider().verifySignedRequest(
        signedRequest({ algorithm: "HMAC-SHA1", issued_at: issuedAt, user_id: "meta-user" }),
        now,
      ),
    ).toThrow();
    expect(() =>
      provider().verifySignedRequest(
        signedRequest({
          algorithm: "HMAC-SHA256",
          issued_at: issuedAt - 301,
          user_id: "meta-user",
        }),
        now,
      ),
    ).toThrow();
  });

  it("bounds provider JSON responses", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: "x".repeat(1024 * 1024) }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      provider(fetchImplementation).readAuthorizedUser("user-token"),
    ).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });
});
