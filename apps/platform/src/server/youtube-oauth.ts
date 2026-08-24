import {
  ApplicationError,
  usesSecureCookies,
  YouTubeOAuthFlowStateCodec,
  assertYouTubeOAuthFlowBinding,
  youtubeOAuthCallbackPath,
  type TokenEnvelopeVault,
  type YouTubeOAuthProvider,
} from "@jingtang/application";
import type { NextResponse } from "next/server";

import type { SessionView } from "@jingtang/db";

import { getRuntime } from "./runtime";

export function youtubeOAuthCookieName(): "__Host-jt_youtube_oauth" | "jt_youtube_oauth" {
  return usesSecureCookies(getRuntime().config.APP_ENV)
    ? "__Host-jt_youtube_oauth"
    : "jt_youtube_oauth";
}

export function youtubeOAuthRedirectUri(): string {
  return new URL(youtubeOAuthCallbackPath, getRuntime().config.APP_BASE_URL).toString();
}

export function youtubeOAuthServices(): {
  readonly provider: YouTubeOAuthProvider;
  readonly vault: TokenEnvelopeVault;
  readonly codec: YouTubeOAuthFlowStateCodec;
} {
  const runtime = getRuntime();
  if (!runtime.youtubeOAuth || !runtime.tokenVault || !runtime.config.YOUTUBE_OAUTH_STATE_SECRET) {
    throw new ApplicationError(
      "service_unavailable",
      "YouTube connection is not enabled in this environment",
      503,
    );
  }
  return {
    provider: runtime.youtubeOAuth,
    vault: runtime.tokenVault,
    codec: new YouTubeOAuthFlowStateCodec(runtime.config.YOUTUBE_OAUTH_STATE_SECRET),
  };
}

export function setYouTubeOAuthCookie(response: NextResponse, value: string): void {
  response.cookies.set(youtubeOAuthCookieName(), value, {
    httpOnly: true,
    secure: usesSecureCookies(getRuntime().config.APP_ENV),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export function clearYouTubeOAuthCookie(response: NextResponse): void {
  response.cookies.set(youtubeOAuthCookieName(), "", {
    httpOnly: true,
    secure: usesSecureCookies(getRuntime().config.APP_ENV),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function assertYouTubeOAuthBinding(
  context: Parameters<typeof assertYouTubeOAuthFlowBinding>[0],
  session: SessionView,
): void {
  assertYouTubeOAuthFlowBinding(context, {
    sessionId: session.id,
    userId: session.user.id,
    workspaceId: session.currentWorkspaceId,
    locale: session.user.locale,
  });
}
