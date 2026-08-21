import { decideContent } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { decisionInput } from "../../../../../../server/content";
import {
  apiError,
  correlationId,
  parseBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

type Context = { readonly params: Promise<{ readonly contentId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const body = await parseBody(request, decisionInput);
    const permission = body.result === "approved" ? "content.approve" : "content.reject";
    const { workspaceId } = await authorize(session, permission, requestId);
    const { contentId } = await context.params;
    await decideContent(getRuntime().db, {
      workspaceId,
      contentId,
      revisionId: body.revisionId,
      actorUserId: session.user.id,
      result: body.result,
      ...(body.reason ? { reason: body.reason } : {}),
      correlationId: requestId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, requestId);
  }
}
