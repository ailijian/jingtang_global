import {
  ApplicationError,
  isApplicationError,
  persistSealedTokenEnvelope,
  tikTokOAuthStateDigest,
} from "@jingtang/application";
import {
  claimTikTokOAuthCallback,
  completeTikTokConnection,
  denyTikTokConnection,
} from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../../server/auth";
import { correlationId } from "../../../../../../../server/http";
import { getRuntime } from "../../../../../../../server/runtime";
import {
  assertTikTokOAuthBinding,
  clearTikTokOAuthCookie,
  tikTokOAuthCookieName,
  tikTokOAuthRedirectUri,
  tikTokOAuthServices,
} from "../../../../../../../server/tiktok-oauth";

function channelRedirect(status: "connected" | "denied" | "failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("tiktok", status);
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
    const serialized = request.cookies.get(tikTokOAuthCookieName())?.value;
    const returnedState = request.nextUrl.searchParams.get("state");
    if (!serialized || !returnedState) {
      throw new ApplicationError("invalid_input", "Missing OAuth state", 400);
    }
    const { provider, vault, codec } = tikTokOAuthServices();
    const decoded = codec.open(serialized, returnedState);
    assertTikTokOAuthBinding(decoded, session);
    await authorize(session, "channel.connect", requestId);
    const claimed = await claimTikTokOAuthCallback(getRuntime().db, {
      workspaceId: decoded.workspaceId,
      channelId: decoded.channelId,
      consentRecordId: decoded.consentRecordId,
      oauthStateDigest: tikTokOAuthStateDigest(returnedState),
    });
    if (!claimed) throw new ApplicationError("conflict", "OAuth callback was already used", 409);
    context = decoded;
    if (request.nextUrl.searchParams.has("error")) {
      await denyTikTokConnection(getRuntime().db, {
        workspaceId: decoded.workspaceId,
        channelId: decoded.channelId,
        consentRecordId: decoded.consentRecordId,
        actorUserId: session.user.id,
        correlationId: requestId,
        reason: "provider_denied",
      });
      const response = NextResponse.redirect(channelRedirect("denied"), 303);
      clearTikTokOAuthCookie(response);
      return response;
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new ApplicationError("invalid_input", "Missing authorization code", 400);
    const tokens = await provider.exchangeAuthorizationCode({
      code,
      redirectUri: tikTokOAuthRedirectUri(),
    });
    const creator = await provider.readCreatorInfo(tokens.accessToken);
    await persistSealedTokenEnvelope(
      vault,
      {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
        openId: tokens.openId,
        grantedScopes: [...tokens.grantedScopes],
      },
      async (envelope) => {
        await completeTikTokConnection(getRuntime().db, {
          workspaceId: decoded.workspaceId,
          channelId: decoded.channelId,
          consentRecordId: decoded.consentRecordId,
          actorUserId: session.user.id,
          externalAccountId: tokens.openId,
          displayName: creator.creatorNickname,
          grantedScopes: tokens.grantedScopes,
          tokenEnvelopeCiphertext: envelope.ciphertext,
          tokenCiphertextReference: envelope.keyReference,
          correlationId: requestId,
        });
      },
    );
    const response = NextResponse.redirect(channelRedirect("connected"), 303);
    clearTikTokOAuthCookie(response);
    return response;
  } catch (error) {
    safeLog("warn", "tiktok_connection_callback_failed", {
      requestId,
      errorCode: isApplicationError(error) ? error.code : "internal_error",
    });
    if (context) {
      await denyTikTokConnection(getRuntime().db, {
        workspaceId: context.workspaceId,
        channelId: context.channelId,
        consentRecordId: context.consentRecordId,
        actorUserId: context.userId,
        correlationId: requestId,
        reason: "exchange_failed",
      }).catch(() => undefined);
    }
    const response = NextResponse.redirect(channelRedirect("failed"), 303);
    clearTikTokOAuthCookie(response);
    return response;
  }
}
