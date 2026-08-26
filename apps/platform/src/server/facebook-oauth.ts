import {
  ApplicationError,
  FacebookOAuthFlowStateCodec,
  assertFacebookOAuthFlowBinding,
  facebookOAuthCallbackPath,
  type FacebookOAuthProvider,
  type TokenEnvelopeVault,
} from "@jingtang/application";
import type { SessionView } from "@jingtang/db";
import type { NextResponse } from "next/server";

import { usesSecureCookies } from "@jingtang/application";

import { getRuntime } from "./runtime";

export function facebookOAuthCookieName(): "__Host-jt_facebook_oauth" | "jt_facebook_oauth" {
  return usesSecureCookies(getRuntime().config.APP_ENV)
    ? "__Host-jt_facebook_oauth"
    : "jt_facebook_oauth";
}

export function facebookOAuthRedirectUri(): string {
  return new URL(facebookOAuthCallbackPath, getRuntime().config.APP_BASE_URL).toString();
}

export function facebookOAuthServices(): {
  readonly provider: FacebookOAuthProvider;
  readonly vault: TokenEnvelopeVault;
  readonly codec: FacebookOAuthFlowStateCodec;
} {
  const runtime = getRuntime();
  if (
    !runtime.facebookOAuth ||
    !runtime.tokenVault ||
    !runtime.config.FACEBOOK_OAUTH_STATE_SECRET
  ) {
    throw new ApplicationError(
      "service_unavailable",
      "Facebook connection is not enabled in this environment",
      503,
    );
  }
  return {
    provider: runtime.facebookOAuth,
    vault: runtime.tokenVault,
    codec: new FacebookOAuthFlowStateCodec(runtime.config.FACEBOOK_OAUTH_STATE_SECRET),
  };
}

export function setFacebookOAuthCookie(response: NextResponse, value: string): void {
  response.cookies.set(facebookOAuthCookieName(), value, {
    httpOnly: true,
    secure: usesSecureCookies(getRuntime().config.APP_ENV),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export function clearFacebookOAuthCookie(response: NextResponse): void {
  response.cookies.set(facebookOAuthCookieName(), "", {
    httpOnly: true,
    secure: usesSecureCookies(getRuntime().config.APP_ENV),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function assertFacebookOAuthBinding(
  context: Parameters<typeof assertFacebookOAuthFlowBinding>[0],
  session: SessionView,
): void {
  assertFacebookOAuthFlowBinding(context, {
    sessionId: session.id,
    userId: session.user.id,
    workspaceId: session.currentWorkspaceId,
    locale: session.user.locale,
  });
}
