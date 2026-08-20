import { deleteSession, recordAudit } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { clearSessionCookie, requestSession, sessionCookieName } from "../../../../../server/auth";
import { apiError, correlationId, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const runtime = getRuntime();
    if (session.currentWorkspaceId) {
      await recordAudit(runtime.db, {
        workspaceId: session.currentWorkspaceId,
        actorUserId: session.user.id,
        action: "identity.logout",
        targetType: "session",
        targetId: session.id,
        result: "success",
        correlationId: requestId,
      });
    }
    await deleteSession(
      runtime.db,
      request.cookies.get(sessionCookieName())?.value ?? "",
      runtime.config.SESSION_COOKIE_SECRET,
    );
    const response = NextResponse.json({ request_id: requestId });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
