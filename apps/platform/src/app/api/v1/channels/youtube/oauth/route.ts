import { ApplicationError, createOAuthPkce } from "@jingtang/application";
import { beginYouTubeConnection, recordConsent } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import {
  apiError,
  correlationId,
  enforceReviewRateLimit,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import {
  setYouTubeOAuthCookie,
  youtubeOAuthRedirectUri,
  youtubeOAuthServices,
} from "../../../../../../server/youtube-oauth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    enforceReviewRateLimit(request, {
      bucket: "oauth-initiate",
      limit: 20,
      windowMs: 5 * 60_000,
    });
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "channel.connect", requestId);
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      throw new ApplicationError("invalid_input", "Form encoding is required", 400);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) {
      throw new ApplicationError("payload_too_large", "Request body is too large", 413);
    }
    const form = new URLSearchParams(raw);
    if (form.get("consent") !== "accepted") {
      throw new ApplicationError(
        "invalid_input",
        "Confirm the YouTube data purpose and policies before connecting",
        400,
      );
    }
    const runtime = getRuntime();
    const { provider, codec } = youtubeOAuthServices();
    const consent = await recordConsent(runtime.db, {
      userId: session.user.id,
      termsVersion: runtime.config.TERMS_VERSION,
      privacyVersion: runtime.config.PRIVACY_VERSION,
      dataPurposeVersion: runtime.config.DATA_PURPOSE_VERSION,
      displayedLocale: session.user.locale,
      acceptanceMethod: "youtube_connection_checkbox",
    });
    const channel = await beginYouTubeConnection(runtime.db, {
      workspaceId,
      consentRecordId: consent.id,
      actorUserId: session.user.id,
      correlationId: requestId,
    });
    const flow = createOAuthPkce();
    const expiresAt = Date.now() + 600_000;
    const sealed = codec.seal({
      state: flow.state,
      codeVerifier: flow.codeVerifier,
      sessionId: session.id,
      userId: session.user.id,
      workspaceId,
      channelId: channel.id,
      locale: session.user.locale,
      expiresAt,
    });
    const authorizationUrl = provider.authorizationUrl({
      state: flow.state,
      codeChallenge: flow.codeChallenge,
      redirectUri: youtubeOAuthRedirectUri(),
    });
    const response = NextResponse.redirect(authorizationUrl, 303);
    setYouTubeOAuthCookie(response, sealed);
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
