import {
  ApplicationError,
  parseStoredFacebookConnectionCandidate,
  persistSealedTokenEnvelope,
} from "@jingtang/application";
import { completeFacebookConnection, readFacebookConnectionCandidate } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { correlationId, parseFormBody, requireSameOrigin } from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import { facebookOAuthServices } from "../../../../../../server/facebook-oauth";

function redirectResult(status: "connected" | "failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("facebook", status);
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "channel.connect", requestId);
    const form = await parseFormBody(request);
    const candidateId = form.get("candidate_id");
    const pageId = form.get("page_id");
    if (!candidateId || !pageId) {
      throw new ApplicationError("invalid_input", "Select one Facebook Page", 400);
    }
    const candidate = await readFacebookConnectionCandidate(
      getRuntime().db,
      workspaceId,
      session.user.id,
    );
    if (!candidate || candidate.id !== candidateId) {
      throw new ApplicationError("conflict", "Facebook Page selection expired", 409);
    }
    const { vault } = facebookOAuthServices();
    const stored = parseStoredFacebookConnectionCandidate(
      await vault.open<unknown>(
        candidate.tokenEnvelopeCiphertext,
        candidate.tokenCiphertextReference,
      ),
    );
    const page = stored.pages.find((entry) => entry.id === pageId);
    const pageOption = candidate.pages.find((entry) => entry.id === pageId);
    if (!page || !pageOption) {
      throw new ApplicationError(
        "permission_denied",
        "Selected Facebook Page is not authorized",
        403,
      );
    }
    const result = await persistSealedTokenEnvelope(
      vault,
      {
        userAccessToken: stored.userAccessToken,
        pageAccessToken: page.accessToken,
        expiresAt: stored.expiresAt,
        grantedScopes: [...candidate.grantedScopes],
        metaUserId: candidate.metaUserId,
        pageId: page.id,
      },
      (envelope) =>
        completeFacebookConnection(getRuntime().db, {
          workspaceId,
          candidateId: candidate.id,
          channelId: candidate.channelId,
          consentRecordId: candidate.consentRecordId,
          actorUserId: session.user.id,
          metaUserId: candidate.metaUserId,
          pageId: page.id,
          pageDisplayName: pageOption.displayName,
          grantedScopes: candidate.grantedScopes,
          tokenEnvelopeCiphertext: envelope.ciphertext,
          tokenCiphertextReference: envelope.keyReference,
          correlationId: requestId,
        }),
    );
    await vault.destroy(result.retiredKeyReference).catch(() => undefined);
    return NextResponse.redirect(redirectResult("connected"), 303);
  } catch {
    return NextResponse.redirect(redirectResult("failed"), 303);
  }
}
