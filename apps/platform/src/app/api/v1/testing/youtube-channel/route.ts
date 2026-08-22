import { ApplicationError } from "@jingtang/application";
import { beginYouTubeConnection, completeYouTubeConnection, recordConsent } from "@jingtang/db";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../server/auth";
import { apiError, correlationId, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const testVault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

export async function POST(request: NextRequest) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const runtime = getRuntime();
    if (!runtime.config.ALLOW_TEST_IDENTITY || runtime.config.APP_ENV !== "test") {
      throw new ApplicationError("not_found", "Not found", 404);
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
    await completeYouTubeConnection(runtime.db, {
      workspaceId,
      channelId: channel.id,
      actorUserId: session.user.id,
      externalAccountId: `UC_E2E_${workspaceId.replaceAll("-", "")}`,
      displayName: "E2E Private YouTube Channel",
      grantedScopes: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      tokenEnvelopeCiphertext: await testVault.seal({ synthetic: true }),
      correlationId: requestId,
    });
    return NextResponse.json({ channel_id: channel.id }, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
