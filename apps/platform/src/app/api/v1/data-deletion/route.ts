import {
  ApplicationError,
  isApplicationError,
  parseStoredYouTubeAuthorization,
} from "@jingtang/application";
import {
  beginWorkspaceDataDeletion,
  completeWorkspaceDataDeletion,
  failWorkspaceDataDeletion,
} from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../server/auth";
import { correlationId, requireSameOrigin } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";
import { youtubeOAuthServices } from "../../../../server/youtube-oauth";

function resultRedirect(result: "completed" | "failed", reference?: string): URL {
  const pathname = result === "completed" ? "/onboarding" : "/app/settings/data";
  const url = new URL(pathname, getRuntime().config.APP_BASE_URL);
  url.searchParams.set("deletion", result);
  if (reference) url.searchParams.set("reference", reference);
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  let material: Awaited<ReturnType<typeof beginWorkspaceDataDeletion>> | undefined;
  let actorUserId: string | undefined;
  let workspaceId: string | undefined;
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const currentActorUserId = session.user.id;
    const currentWorkspaceId = (await authorize(session, "data.delete", requestId)).workspaceId;
    actorUserId = currentActorUserId;
    workspaceId = currentWorkspaceId;
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
    material = await beginWorkspaceDataDeletion(getRuntime().db, {
      workspaceId: currentWorkspaceId,
      actorUserId: currentActorUserId,
      confirmedWorkspaceName: workspaceName,
      correlationId: requestId,
    });
    if (material.operationsInFlight) {
      throw new ApplicationError(
        "service_unavailable",
        "Workspace operations are still completing",
        503,
      );
    }
    if (material.channels.some((channel) => channel.tokenEnvelopeCiphertext)) {
      const { provider, vault } = youtubeOAuthServices();
      for (const channel of material.channels) {
        if (!channel.tokenEnvelopeCiphertext) continue;
        const authorization = parseStoredYouTubeAuthorization(
          await vault.open<unknown>(channel.tokenEnvelopeCiphertext),
        );
        await provider.revokeAuthorization(authorization.refreshToken);
      }
    }
    for (const objectKey of material.objectKeys) {
      await getRuntime().assets.delete(objectKey);
    }
    await completeWorkspaceDataDeletion(getRuntime().db, {
      workspaceId: currentWorkspaceId,
      requestId: material.requestId,
      actorUserId: currentActorUserId,
      correlationId: requestId,
    });
    return NextResponse.redirect(resultRedirect("completed", material.requestReference), 303);
  } catch (error) {
    const failureCategory = isApplicationError(error)
      ? error.code
      : error instanceof Error && /^[a-z_]+$/u.test(error.message)
        ? error.message
        : "internal_error";
    safeLog("warn", "workspace_data_deletion_failed", { requestId, failureCategory });
    if (material && workspaceId && actorUserId) {
      await failWorkspaceDataDeletion(getRuntime().db, {
        workspaceId,
        requestId: material.requestId,
        actorUserId,
        correlationId: requestId,
        failureCategory,
      }).catch(() => undefined);
    }
    return NextResponse.redirect(resultRedirect("failed", material?.requestReference), 303);
  }
}
