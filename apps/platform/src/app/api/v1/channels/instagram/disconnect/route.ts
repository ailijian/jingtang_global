import { ApplicationError, isApplicationError } from "@jingtang/application";
import { prepareYouTubeDisconnect } from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { correlationId, parseFormBody, requireSameOrigin } from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

function redirectResult(result: "disconnected" | "disconnect_failed"): URL {
  const url = new URL("/app/channels", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("instagram", result);
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
        "Explicit Instagram disconnect confirmation is required",
        400,
      );
    }
    const runtime = getRuntime();
    const prepared = await prepareYouTubeDisconnect(runtime.db, {
      workspaceId,
      channelId,
      actorUserId: session.user.id,
      correlationId: requestId,
      platform: "instagram",
    });
    if (prepared.tokenKeyReference) {
      if (!runtime.tokenVault) {
        safeLog("error", "instagram_token_key_retirement_deferred", {
          requestId,
          failureCategory: "token_vault_unavailable",
        });
      } else {
        await runtime.tokenVault.destroy(prepared.tokenKeyReference).catch(() => {
          safeLog("error", "instagram_token_key_retirement_deferred", {
            requestId,
            failureCategory: "token_key_retirement_failed",
          });
        });
      }
    }
    return NextResponse.redirect(redirectResult("disconnected"), 303);
  } catch (error) {
    safeLog("warn", "instagram_disconnect_failed", {
      requestId,
      failureCategory: isApplicationError(error) ? error.code : "internal_error",
    });
    return NextResponse.redirect(redirectResult("disconnect_failed"), 303);
  }
}
