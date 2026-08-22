import { ApplicationError, isApplicationError } from "@jingtang/application";
import { completeYouTubeConnection, denyYouTubeConnection } from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../../server/auth";
import { correlationId } from "../../../../../../../server/http";
import { getRuntime } from "../../../../../../../server/runtime";
import {
  assertYouTubeOAuthBinding,
  clearYouTubeOAuthCookie,
  youtubeOAuthCookieName,
  youtubeOAuthRedirectUri,
  youtubeOAuthServices,
} from "../../../../../../../server/youtube-oauth";

function channelRedirect(status: "connected" | "denied" | "failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("youtube", status);
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  let failureStage:
    "callback_validation" | "token_exchange" | "channel_lookup" | "token_seal" | "persistence" =
    "callback_validation";
  let context:
    | {
        readonly workspaceId: string;
        readonly channelId: string;
        readonly userId: string;
      }
    | undefined;
  try {
    const session = await requestSession(request);
    const serialized = request.cookies.get(youtubeOAuthCookieName())?.value;
    const returnedState = request.nextUrl.searchParams.get("state");
    if (!serialized || !returnedState)
      throw new ApplicationError("invalid_input", "Missing OAuth state", 400);
    const { provider, vault, codec } = youtubeOAuthServices();
    const decoded = codec.open(serialized, returnedState);
    assertYouTubeOAuthBinding(decoded, session);
    await authorize(session, "channel.connect", requestId);
    context = decoded;

    if (request.nextUrl.searchParams.has("error")) {
      await denyYouTubeConnection(getRuntime().db, {
        workspaceId: decoded.workspaceId,
        channelId: decoded.channelId,
        actorUserId: session.user.id,
        correlationId: requestId,
        reason: "provider_denied",
      });
      const response = NextResponse.redirect(channelRedirect("denied"), 303);
      clearYouTubeOAuthCookie(response);
      return response;
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new ApplicationError("invalid_input", "Missing authorization code", 400);
    failureStage = "token_exchange";
    const tokens = await provider.exchangeAuthorizationCode({
      code,
      codeVerifier: decoded.codeVerifier,
      redirectUri: youtubeOAuthRedirectUri(),
    });
    failureStage = "channel_lookup";
    const channel = await provider.readAuthorizedChannel(tokens.accessToken);
    failureStage = "token_seal";
    const tokenEnvelopeCiphertext = await vault.seal({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt.toISOString(),
      grantedScopes: [...tokens.grantedScopes],
    });
    failureStage = "persistence";
    await completeYouTubeConnection(getRuntime().db, {
      workspaceId: decoded.workspaceId,
      channelId: decoded.channelId,
      actorUserId: session.user.id,
      externalAccountId: channel.id,
      displayName: channel.displayName,
      grantedScopes: tokens.grantedScopes,
      tokenEnvelopeCiphertext,
      correlationId: requestId,
    });
    const response = NextResponse.redirect(channelRedirect("connected"), 303);
    clearYouTubeOAuthCookie(response);
    return response;
  } catch (error) {
    safeLog("warn", "youtube_connection_callback_failed", {
      requestId,
      failureStage,
      errorCode: isApplicationError(error) ? error.code : "internal_error",
      errorStatus: isApplicationError(error) ? error.status : 500,
    });
    if (context) {
      try {
        await denyYouTubeConnection(getRuntime().db, {
          workspaceId: context.workspaceId,
          channelId: context.channelId,
          actorUserId: context.userId,
          correlationId: requestId,
          reason: "exchange_failed",
        });
      } catch {
        // Preserve the primary safe failure redirect without disclosing callback or token details.
      }
    }
    const response = NextResponse.redirect(channelRedirect("failed"), 303);
    clearYouTubeOAuthCookie(response);
    return response;
  }
}
