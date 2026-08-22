import { describe, expect, it, vi } from "vitest";

import { youtubeOAuthScopes } from "@jingtang/application";

import { GoogleYouTubeOAuthProvider } from "./google-youtube-oauth.js";

function requestUrl(input: string | URL | Request | undefined): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? "";
}

describe("Google YouTube OAuth provider", () => {
  it("builds a PKCE authorization URL with only approved scopes", () => {
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const url = provider.authorizationUrl({
      state: "opaque-state",
      codeChallenge: "challenge",
      redirectUri: "http://localhost:3100/api/v1/channels/youtube/oauth/callback",
    });
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(youtubeOAuthScopes);
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("exchanges a code without exposing the client secret in the URL", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: youtubeOAuthScopes.join(" "),
      }),
    );
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation,
    });
    const tokens = await provider.exchangeAuthorizationCode({
      code: "authorization-code",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:3100/api/v1/channels/youtube/oauth/callback",
    });
    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect(init?.body instanceof URLSearchParams ? init.body.get("client_secret") : undefined).toBe(
      "client-secret",
    );
    expect(requestUrl(url)).not.toContain("client-secret");
    expect(tokens.grantedScopes).toEqual(youtubeOAuthScopes);
  });

  it("rejects a token response with missing or unexpected scopes", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: `${youtubeOAuthScopes[0]} https://www.googleapis.com/auth/youtube.force-ssl`,
      }),
    );
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation,
    });
    await expect(
      provider.exchangeAuthorizationCode({
        code: "authorization-code",
        codeVerifier: "verifier",
        redirectUri: "http://localhost:3100/api/v1/channels/youtube/oauth/callback",
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("reads the single channel owned by the authorized account", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ items: [{ id: "UC123", snippet: { title: "JINGTANG" } }] }),
      );
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation,
    });
    await expect(provider.readAuthorizedChannel("access-token")).resolves.toEqual({
      id: "UC123",
      displayName: "JINGTANG",
    });
    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url instanceof URL ? url.searchParams.get("mine") : undefined).toBe("true");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("refreshes authorization without changing the approved scope set", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ access_token: "fresh-access-token", expires_in: 3600 }));
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation,
    });
    await expect(provider.refreshAuthorization("refresh-token")).resolves.toMatchObject({
      accessToken: "fresh-access-token",
      refreshToken: "refresh-token",
      grantedScopes: youtubeOAuthScopes,
    });
    const [, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(init?.body instanceof URLSearchParams ? init.body.get("grant_type") : undefined).toBe(
      "refresh_token",
    );
  });

  it("creates a private resumable upload and streams the source asset", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { location: "https://upload.youtube.test/session" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: "video-123" }));
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation,
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    await expect(
      provider.uploadPrivateVideo({
        accessToken: "access-token",
        title: "Approved title",
        description: "Approved description",
        madeForKids: false,
        mediaType: "video/mp4",
        byteSize: 3,
        body: stream,
      }),
    ).resolves.toEqual({
      videoId: "video-123",
      videoUrl: "https://www.youtube.com/watch?v=video-123",
    });
    const [initiationUrl, initiation] = fetchImplementation.mock.calls[0] ?? [];
    expect(initiationUrl instanceof URL ? initiationUrl.searchParams.get("uploadType") : null).toBe(
      "resumable",
    );
    expect(JSON.parse(typeof initiation?.body === "string" ? initiation.body : "{}")).toMatchObject(
      {
        status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
      },
    );
    const [uploadUrl, upload] = fetchImplementation.mock.calls[1] ?? [];
    expect(uploadUrl).toBe("https://upload.youtube.test/session");
    expect(upload?.body).toBe(stream);
  });

  it("maps YouTube processing state without exposing provider response details", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [{ status: { uploadStatus: "processed" }, processingDetails: {} }],
      }),
    );
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation,
    });
    await expect(provider.readVideoStatus("access-token", "video-123")).resolves.toEqual({
      state: "published",
    });
  });

  it.each(["failed", "rejected", "deleted"])(
    "maps the provider %s status to a failed execution",
    async (uploadStatus) => {
      const provider = new GoogleYouTubeOAuthProvider({
        clientId: "client-id",
        clientSecret: "client-secret",
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
          Response.json({
            items: [{ status: { uploadStatus }, processingDetails: {} }],
          }),
        ),
      });
      await expect(provider.readVideoStatus("access-token", "video-123")).resolves.toEqual({
        state: "failed",
        failureCategory: "provider_processing_failed",
      });
    },
  );

  it("maps quota responses without exposing the provider payload", async () => {
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ error: { message: "private quota detail" } }, { status: 429 }),
        ),
    });
    await expect(provider.readVideoStatus("access-token", "video-123")).rejects.toMatchObject({
      code: "rate_limited",
      message: "YouTube request quota was exceeded",
    });
  });

  it("maps a status timeout to a retryable service error", async () => {
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout")),
    });
    await expect(provider.readVideoStatus("access-token", "video-123")).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });

  it("requires reauthorization when Google rejects a refresh token", async () => {
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 })),
    });
    await expect(provider.refreshAuthorization("revoked-refresh-token")).rejects.toMatchObject({
      code: "authentication_failed",
    });
  });

  it("does not automatically retry an upload with an ambiguous transfer result", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { location: "https://upload.youtube.test/session" },
        }),
      )
      .mockRejectedValueOnce(new Error("connection closed"));
    const provider = new GoogleYouTubeOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImplementation,
    });
    await expect(
      provider.uploadPrivateVideo({
        accessToken: "access-token",
        title: "Approved title",
        description: "",
        madeForKids: false,
        mediaType: "video/mp4",
        byteSize: 1,
        body: new ReadableStream<Uint8Array>(),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
