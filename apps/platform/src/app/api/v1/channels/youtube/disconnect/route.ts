import {
  ApplicationError,
  isApplicationError,
  parseStoredYouTubeAuthorization,
} from "@jingtang/application";
import {
  completeYouTubeDisconnect,
  failYouTubeDisconnect,
  prepareYouTubeDisconnect,
} from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { correlationId, requireSameOrigin } from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import { youtubeOAuthServices } from "../../../../../../server/youtube-oauth";

function redirectResult(result: "disconnected" | "disconnecting" | "disconnect_failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("youtube", result);
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  let prepared: Awaited<ReturnType<typeof prepareYouTubeDisconnect>> | undefined;
  let actorUserId: string | undefined;
  let workspaceId: string | undefined;
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    actorUserId = session.user.id;
    workspaceId = (await authorize(session, "channel.disconnect", requestId)).workspaceId;
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      throw new ApplicationError("invalid_input", "Form encoding is required", 400);
    }
    const form = new URLSearchParams(await request.text());
    const channelId = form.get("channel_id");
    const confirmation = form.get("confirmation");
    if (!channelId || confirmation !== "disconnect") {
      throw new ApplicationError(
        "invalid_input",
        "Explicit disconnect confirmation is required",
        400,
      );
    }
    prepared = await prepareYouTubeDisconnect(getRuntime().db, {
      workspaceId,
      channelId,
      actorUserId,
      correlationId: requestId,
    });
    if (prepared.revocationDeferred) {
      return NextResponse.redirect(redirectResult("disconnecting"), 303);
    }
    if (!prepared.alreadyDisconnected && prepared.tokenEnvelopeCiphertext) {
      const { provider, vault } = youtubeOAuthServices();
      const authorization = parseStoredYouTubeAuthorization(
        await vault.open<unknown>(prepared.tokenEnvelopeCiphertext),
      );
      await provider.revokeAuthorization(authorization.refreshToken);
    }
    await completeYouTubeDisconnect(getRuntime().db, {
      workspaceId,
      channelId: prepared.channelId,
      actorUserId,
      correlationId: requestId,
    });
    return NextResponse.redirect(redirectResult("disconnected"), 303);
  } catch (error) {
    const failureCategory = isApplicationError(error)
      ? error.code
      : error instanceof Error && /^[a-z_]+$/u.test(error.message)
        ? error.message
        : "internal_error";
    safeLog("warn", "youtube_disconnect_failed", { requestId, failureCategory });
    if (prepared && workspaceId) {
      await failYouTubeDisconnect(getRuntime().db, {
        workspaceId,
        channelId: prepared.channelId,
        ...(actorUserId ? { actorUserId } : {}),
        correlationId: requestId,
        failureCategory,
      }).catch(() => undefined);
    }
    return NextResponse.redirect(redirectResult("disconnect_failed"), 303);
  }
}
