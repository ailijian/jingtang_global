import { createContent, listContents } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../server/auth";
import { contentInput } from "../../../../server/content";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

export async function GET(request: NextRequest) {
  const requestId = correlationId(request);
  try {
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.read", requestId);
    const contents = await listContents(getRuntime().db, workspaceId);
    return NextResponse.json({ contents });
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.create", requestId);
    const body = await parseBody(request, contentInput);
    const content = await createContent(getRuntime().db, {
      workspaceId,
      actorUserId: session.user.id,
      internalTitle: body.internalTitle,
      sourceAssetId: body.sourceAssetId,
      platformVersions: body.platformVersions,
      correlationId: requestId,
    });
    return NextResponse.json({ content_id: content.id }, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
