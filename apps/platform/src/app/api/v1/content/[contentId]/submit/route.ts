import { submitContent } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { apiError, correlationId, requireSameOrigin } from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

type Context = { readonly params: Promise<{ readonly contentId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.submit", requestId);
    const { contentId } = await context.params;
    const result = await submitContent(getRuntime().db, {
      workspaceId,
      contentId,
      actorUserId: session.user.id,
      correlationId: requestId,
    });
    return NextResponse.json({ revision_id: result.revisionId });
  } catch (error) {
    return apiError(error, requestId);
  }
}
