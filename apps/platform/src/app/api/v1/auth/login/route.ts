import {
  createSession,
  listUserWorkspaces,
  recordAudit,
  selectWorkspace,
  upsertIdentityUser,
} from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { setLocaleCookie, setSessionCookie } from "../../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const schema = z.object({ email: z.email(), password: z.string().min(1) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const input = await parseBody(request, schema);
    const runtime = getRuntime();
    const identity = await runtime.identity.authenticate(input);
    const existing = await runtime.db.user.findUnique({
      where: { cognitoSubject: identity.subject },
      select: { localePreference: true, lastWorkspaceId: true },
    });
    const locale = existing?.localePreference === "ZH_CN" ? "zh-CN" : "en";
    const user = await upsertIdentityUser(runtime.db, { ...identity, locale });
    const session = await createSession(runtime.db, {
      userId: user.id,
      secret: runtime.config.SESSION_COOKIE_SECRET,
    });
    const workspaces = await listUserWorkspaces(runtime.db, user.id);
    const selectedWorkspace =
      workspaces.find((workspace) => workspace.id === existing?.lastWorkspaceId) ??
      (workspaces.length === 1 ? workspaces[0] : undefined);
    if (selectedWorkspace) {
      await selectWorkspace(runtime.db, {
        workspaceId: selectedWorkspace.id,
        userId: user.id,
        sessionId: session.id,
        correlationId: requestId,
      });
      await recordAudit(runtime.db, {
        workspaceId: selectedWorkspace.id,
        actorUserId: user.id,
        action: "identity.login",
        targetType: "session",
        targetId: session.id,
        result: "success",
        correlationId: requestId,
      });
    }
    const response = NextResponse.json({
      has_workspace: workspaces.length > 0,
      request_id: requestId,
    });
    setSessionCookie(response, session.token, session.expiresAt);
    setLocaleCookie(response, locale);
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
