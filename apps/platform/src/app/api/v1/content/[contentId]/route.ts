import { ApplicationError } from "@jingtang/application";
import { getContentDetail, updateContentDraft } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../server/auth";
import { contentJson, contentUpdateInput } from "../../../../../server/content";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

type Context = { readonly params: Promise<{ readonly contentId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const requestId = correlationId(request);
  try {
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.read", requestId);
    const { contentId } = await context.params;
    const content = await getContentDetail(getRuntime().db, workspaceId, contentId);
    if (!content) throw new ApplicationError("not_found", "Content was not found", 404);
    return NextResponse.json({ content: contentJson(content) });
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.edit", requestId);
    const { contentId } = await context.params;
    const body = await parseBody(request, contentUpdateInput);
    await updateContentDraft(getRuntime().db, {
      workspaceId,
      contentId,
      actorUserId: session.user.id,
      internalTitle: body.internalTitle,
      platformVersions: body.platformVersions,
      correlationId: requestId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, requestId);
  }
}
