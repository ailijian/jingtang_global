import { selectWorkspace } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requestSession } from "../../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const schema = z.object({ workspaceId: z.uuid() });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await parseBody(request, schema);
    await selectWorkspace(getRuntime().db, {
      workspaceId,
      userId: session.user.id,
      sessionId: session.id,
      correlationId: requestId,
    });
    return NextResponse.json({ selected: workspaceId, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}
