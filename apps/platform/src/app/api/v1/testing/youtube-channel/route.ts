import { ApplicationError, youtubeOAuthScopes } from "@jingtang/application";
import { beginYouTubeConnection, completeYouTubeConnection, recordConsent } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../server/auth";
import { apiError, correlationId, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

export async function POST(request: NextRequest) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const runtime = getRuntime();
    if (!runtime.config.ALLOW_TEST_IDENTITY || runtime.config.APP_ENV !== "test") {
      throw new ApplicationError("not_found", "Not found", 404);
    }
    if (!runtime.tokenVault) {
      throw new ApplicationError("service_unavailable", "Test token vault is unavailable", 503);
    }
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "channel.connect", requestId);
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
    const tokenEnvelope = await runtime.tokenVault.seal({
      accessToken: "e2e-access-token",
      refreshToken: "e2e-refresh-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z").toISOString(),
      grantedScopes: youtubeOAuthScopes,
    });
    await completeYouTubeConnection(runtime.db, {
      workspaceId,
      channelId: channel.id,
      consentRecordId: consent.id,
      actorUserId: session.user.id,
      externalAccountId: `UC_E2E_${workspaceId.replaceAll("-", "")}`,
      displayName: "E2E Private YouTube Channel",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: tokenEnvelope.ciphertext,
      tokenCiphertextReference: tokenEnvelope.keyReference,
      correlationId: requestId,
    });
    return NextResponse.json({ channel_id: channel.id }, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
