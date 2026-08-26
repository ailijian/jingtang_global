import {
  ApplicationError,
  facebookOAuthStateDigest,
  isApplicationError,
  persistSealedTokenEnvelope,
} from "@jingtang/application";
import {
  createFacebookConnectionCandidate,
  claimFacebookOAuthCallback,
  denyFacebookConnection,
  FACEBOOK_OAUTH_FLOW_TTL_MS,
} from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../../server/auth";
import {
  assertFacebookOAuthBinding,
  clearFacebookOAuthCookie,
  facebookOAuthCookieName,
  facebookOAuthRedirectUri,
  facebookOAuthServices,
} from "../../../../../../../server/facebook-oauth";
import { correlationId } from "../../../../../../../server/http";
import { getRuntime } from "../../../../../../../server/runtime";

function channelRedirect(status: "select" | "denied" | "failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("facebook", status);
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  let context:
    | {
        readonly workspaceId: string;
        readonly channelId: string;
        readonly consentRecordId: string;
        readonly userId: string;
      }
    | undefined;
  try {
    const session = await requestSession(request);
    const serialized = request.cookies.get(facebookOAuthCookieName())?.value;
    const returnedState = request.nextUrl.searchParams.get("state");
    if (!serialized || !returnedState) {
      throw new ApplicationError("invalid_input", "Missing OAuth state", 400);
    }
    const { provider, vault, codec } = facebookOAuthServices();
    const decoded = codec.open(serialized, returnedState);
    assertFacebookOAuthBinding(decoded, session);
    await authorize(session, "channel.connect", requestId);
    const claimed = await claimFacebookOAuthCallback(getRuntime().db, {
      workspaceId: decoded.workspaceId,
      channelId: decoded.channelId,
      consentRecordId: decoded.consentRecordId,
      oauthStateDigest: facebookOAuthStateDigest(returnedState),
    });
    if (!claimed) throw new ApplicationError("conflict", "OAuth callback was already used", 409);
    context = decoded;
    if (request.nextUrl.searchParams.has("error")) {
      await denyFacebookConnection(getRuntime().db, {
        workspaceId: decoded.workspaceId,
        channelId: decoded.channelId,
        consentRecordId: decoded.consentRecordId,
        actorUserId: session.user.id,
        correlationId: requestId,
        reason: "provider_denied",
      });
      const response = NextResponse.redirect(channelRedirect("denied"), 303);
      clearFacebookOAuthCookie(response);
      return response;
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new ApplicationError("invalid_input", "Missing authorization code", 400);
    const tokens = await provider.exchangeAuthorizationCode({
      code,
      redirectUri: facebookOAuthRedirectUri(),
    });
    const [user, pages] = await Promise.all([
      provider.readAuthorizedUser(tokens.userAccessToken),
      provider.readManagedPages(tokens.userAccessToken),
    ]);
    await persistSealedTokenEnvelope(
      vault,
      {
        userAccessToken: tokens.userAccessToken,
        expiresAt: tokens.expiresAt.toISOString(),
        pages,
      },
      async (envelope) => {
        const created = await createFacebookConnectionCandidate(getRuntime().db, {
          workspaceId: decoded.workspaceId,
          channelId: decoded.channelId,
          actorUserId: session.user.id,
          consentRecordId: decoded.consentRecordId,
          metaUserId: user.id,
          metaUserDisplayName: user.displayName,
          grantedScopes: tokens.grantedScopes,
          pageOptions: pages.map((page) => ({ id: page.id, displayName: page.displayName })),
          tokenEnvelopeCiphertext: envelope.ciphertext,
          tokenCiphertextReference: envelope.keyReference,
          expiresAt: new Date(Date.now() + FACEBOOK_OAUTH_FLOW_TTL_MS),
        });
        if (created.retiredKeyReference) {
          await vault.destroy(created.retiredKeyReference).catch(() => undefined);
        }
      },
    );
    const response = NextResponse.redirect(channelRedirect("select"), 303);
    clearFacebookOAuthCookie(response);
    return response;
  } catch (error) {
    safeLog("warn", "facebook_connection_callback_failed", {
      requestId,
      errorCode: isApplicationError(error) ? error.code : "internal_error",
    });
    if (context) {
      await denyFacebookConnection(getRuntime().db, {
        workspaceId: context.workspaceId,
        channelId: context.channelId,
        consentRecordId: context.consentRecordId,
        actorUserId: context.userId,
        correlationId: requestId,
        reason: "exchange_failed",
      }).catch(() => undefined);
    }
    const response = NextResponse.redirect(channelRedirect("failed"), 303);
    clearFacebookOAuthCookie(response);
    return response;
  }
}
