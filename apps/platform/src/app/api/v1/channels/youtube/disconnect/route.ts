import { ApplicationError, isApplicationError } from "@jingtang/application";
import { prepareYouTubeDisconnect } from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { correlationId, requireSameOrigin } from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

function redirectResult(result: "disconnected" | "disconnecting" | "disconnect_failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("youtube", result);
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const workspaceId = (await authorize(session, "channel.disconnect", requestId)).workspaceId;
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
    const prepared = await prepareYouTubeDisconnect(getRuntime().db, {
      workspaceId,
      channelId,
      actorUserId: session.user.id,
      correlationId: requestId,
    });
    return NextResponse.redirect(
      redirectResult(prepared.alreadyDisconnected ? "disconnected" : "disconnecting"),
      303,
    );
  } catch (error) {
    const failureCategory = isApplicationError(error)
      ? error.code
      : error instanceof Error && /^[a-z_]+$/u.test(error.message)
        ? error.message
        : "internal_error";
    safeLog("warn", "youtube_disconnect_failed", { requestId, failureCategory });
    return NextResponse.redirect(redirectResult("disconnect_failed"), 303);
  }
}
