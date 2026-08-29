import {
  ApplicationError,
  instagramCallbackReplayDigest,
  instagramOAuthScopes,
  instagramSubjectCorrelationHash,
} from "@jingtang/application";
import {
  beginInstagramConnection,
  completeInstagramConnection,
  confirmInstagramProviderRemoval,
  listInstagramChannels,
  recordConsent,
} from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../server/auth";
import { apiError, correlationId, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const fixtureCorrelationSecret = "instagram-e2e-correlation-secret-with-32-characters";
const fixtureCorrelationSubject = "instagram-e2e-callback-subject";

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
    const action = request.nextUrl.searchParams.get("action") ?? "connect";
    if (action === "confirm-removal") {
      const result = await confirmInstagramProviderRemoval(runtime.db, {
        workspaceId,
        subjectCorrelationHash: instagramSubjectCorrelationHash(
          fixtureCorrelationSecret,
          fixtureCorrelationSubject,
        ),
        replayDigest: instagramCallbackReplayDigest(
          fixtureCorrelationSecret,
          "instagram-e2e-deauthorization-1",
        ),
        callbackKind: "deauthorization",
        correlationId: requestId,
      });
      return NextResponse.json(result);
    }
    if (action !== "connect") {
      throw new ApplicationError("invalid_input", "Unknown Instagram fixture action", 400);
    }
    const existing = (await listInstagramChannels(runtime.db, workspaceId)).find(
      (channel) => channel.state === "connected",
    );
    if (existing) return NextResponse.json({ channel_id: existing.id }, { status: 200 });
    const consent = await recordConsent(runtime.db, {
      userId: session.user.id,
      termsVersion: runtime.config.TERMS_VERSION,
      privacyVersion: runtime.config.PRIVACY_VERSION,
      dataPurposeVersion: runtime.config.DATA_PURPOSE_VERSION,
      displayedLocale: session.user.locale,
      acceptanceMethod: "instagram_connection_checkbox",
    });
    const channel = await beginInstagramConnection(runtime.db, {
      workspaceId,
      consentRecordId: consent.id,
      actorUserId: session.user.id,
      correlationId: requestId,
      oauthStateDigest: "a".repeat(64),
    });
    const tokenEnvelope = await runtime.tokenVault.seal({
      accessToken: "instagram-e2e-access-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z").toISOString(),
      grantedScopes: instagramOAuthScopes,
      userId: `IG_E2E_${workspaceId.replaceAll("-", "")}`,
    });
    await completeInstagramConnection(runtime.db, {
      workspaceId,
      channelId: channel.id,
      consentRecordId: consent.id,
      actorUserId: session.user.id,
      externalAccountId: `IG_E2E_${workspaceId.replaceAll("-", "")}`,
      displayName: "jingtang_e2e",
      grantedScopes: instagramOAuthScopes,
      tokenEnvelopeCiphertext: tokenEnvelope.ciphertext,
      tokenCiphertextReference: tokenEnvelope.keyReference,
      callbackSubjectCorrelationHash: instagramSubjectCorrelationHash(
        fixtureCorrelationSecret,
        fixtureCorrelationSubject,
      ),
      correlationId: requestId,
    });
    return NextResponse.json({ channel_id: channel.id }, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
