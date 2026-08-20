import { createWorkspace, listUserWorkspaces } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requestSession } from "../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

const schema = z.object({ name: z.string().trim().min(2).max(120) });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    const session = await requestSession(request);
    const workspaces = await listUserWorkspaces(getRuntime().db, session.user.id);
    return NextResponse.json({ workspaces, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const input = await parseBody(request, schema);
    const workspace = await createWorkspace(getRuntime().db, {
      name: input.name,
      userId: session.user.id,
      sessionId: session.id,
      correlationId: requestId,
    });
    return NextResponse.json({ workspace, request_id: requestId }, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
