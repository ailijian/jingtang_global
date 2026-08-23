import { ApplicationError, isApplicationError } from "@jingtang/application";
import { beginWorkspaceDataDeletion } from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../server/auth";
import { correlationId, requireSameOrigin } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

function resultRedirect(result: "pending" | "request_failed", reference: string): URL {
  const path = result === "pending" ? "/onboarding" : "/app/settings/data";
  const url = new URL(path, getRuntime().config.APP_BASE_URL);
  url.searchParams.set("deletion", result);
  url.searchParams.set("reference", reference);
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const currentActorUserId = session.user.id;
    const currentWorkspaceId = (await authorize(session, "data.delete", requestId)).workspaceId;
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      throw new ApplicationError("invalid_input", "Form encoding is required", 400);
    }
    const form = new URLSearchParams(await request.text());
    const workspaceName = form.get("workspace_name");
    const confirmation = form.get("confirmation");
    if (!workspaceName || confirmation !== "delete_jingtang_data") {
      throw new ApplicationError(
        "invalid_input",
        "Explicit data deletion confirmation is required",
        400,
      );
    }
    const material = await beginWorkspaceDataDeletion(getRuntime().db, {
      workspaceId: currentWorkspaceId,
      actorUserId: currentActorUserId,
      confirmedWorkspaceName: workspaceName,
      correlationId: requestId,
    });
    return NextResponse.redirect(resultRedirect("pending", material.requestReference), 303);
  } catch (error) {
    const failureCategory = isApplicationError(error)
      ? error.code
      : error instanceof Error && /^[a-z_]+$/u.test(error.message)
        ? error.message
        : "internal_error";
    safeLog("warn", "workspace_data_deletion_failed", { requestId, failureCategory });
    return NextResponse.redirect(resultRedirect("request_failed", requestId), 303);
  }
}
