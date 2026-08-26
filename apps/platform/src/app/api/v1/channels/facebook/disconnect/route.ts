import { ApplicationError, isApplicationError } from "@jingtang/application";
import { prepareYouTubeDisconnect } from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { correlationId, parseFormBody, requireSameOrigin } from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

function redirectResult(result: "disconnected" | "disconnecting" | "disconnect_failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("facebook", result);
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const workspaceId = (await authorize(session, "channel.disconnect", requestId)).workspaceId;
    const form = await parseFormBody(request);
    const channelId = form.get("channel_id");
    if (!channelId || form.get("confirmation") !== "disconnect") {
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
      platform: "facebook",
    });
    return NextResponse.redirect(
      redirectResult(prepared.alreadyDisconnected ? "disconnected" : "disconnecting"),
      303,
    );
  } catch (error) {
    safeLog("warn", "facebook_disconnect_failed", {
      requestId,
      failureCategory: isApplicationError(error) ? error.code : "internal_error",
    });
    return NextResponse.redirect(redirectResult("disconnect_failed"), 303);
  }
}
