import { ApplicationError, createOAuthPkce, facebookOAuthStateDigest } from "@jingtang/application";
import {
  beginFacebookConnection,
  denyFacebookConnection,
  FACEBOOK_OAUTH_FLOW_TTL_MS,
  recordConsent,
} from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import {
  apiError,
  correlationId,
  enforceReviewRateLimit,
  parseFormBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import {
  facebookOAuthRedirectUri,
  facebookOAuthServices,
  setFacebookOAuthCookie,
} from "../../../../../../server/facebook-oauth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  let initiated:
    | {
        readonly workspaceId: string;
        readonly channelId: string;
        readonly consentRecordId: string;
        readonly actorUserId: string;
      }
    | undefined;
  try {
    requireSameOrigin(request);
    enforceReviewRateLimit(request, {
      bucket: "facebook-oauth-initiate",
      limit: 20,
      windowMs: 5 * 60_000,
    });
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "channel.connect", requestId);
    if ((await parseFormBody(request)).get("consent") !== "accepted") {
      throw new ApplicationError(
        "invalid_input",
        "Confirm the Facebook Page data purpose before connecting",
        400,
      );
    }
    const runtime = getRuntime();
    const { provider, codec } = facebookOAuthServices();
    const consent = await recordConsent(runtime.db, {
      userId: session.user.id,
      termsVersion: runtime.config.TERMS_VERSION,
      privacyVersion: runtime.config.PRIVACY_VERSION,
      dataPurposeVersion: runtime.config.DATA_PURPOSE_VERSION,
      displayedLocale: session.user.locale,
      acceptanceMethod: "facebook_connection_checkbox",
    });
    const state = createOAuthPkce().state;
    const channel = await beginFacebookConnection(runtime.db, {
      workspaceId,
      consentRecordId: consent.id,
      actorUserId: session.user.id,
      correlationId: requestId,
      oauthStateDigest: facebookOAuthStateDigest(state),
    });
    initiated = {
      workspaceId,
      channelId: channel.id,
      consentRecordId: consent.id,
      actorUserId: session.user.id,
    };
    const sealed = codec.seal({
      state,
      sessionId: session.id,
      userId: session.user.id,
      workspaceId,
      channelId: channel.id,
      consentRecordId: consent.id,
      locale: session.user.locale,
      expiresAt: Date.now() + FACEBOOK_OAUTH_FLOW_TTL_MS,
    });
    const response = NextResponse.redirect(
      provider.authorizationUrl({ state, redirectUri: facebookOAuthRedirectUri() }),
      303,
    );
    setFacebookOAuthCookie(response, sealed);
    return response;
  } catch (error) {
    if (initiated) {
      await denyFacebookConnection(getRuntime().db, {
        workspaceId: initiated.workspaceId,
        channelId: initiated.channelId,
        consentRecordId: initiated.consentRecordId,
        actorUserId: initiated.actorUserId,
        correlationId: requestId,
        reason: "initiation_failed",
      }).catch(() => undefined);
    }
    return apiError(error, requestId);
  }
}
