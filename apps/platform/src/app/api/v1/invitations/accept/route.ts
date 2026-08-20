import { acceptInvitation } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requestSession } from "../../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const schema = z.object({ token: z.string().trim().min(20).max(200) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { token } = await parseBody(request, schema);
    const result = await acceptInvitation(getRuntime().db, {
      token,
      userId: session.user.id,
      email: session.user.email,
      sessionId: session.id,
      correlationId: requestId,
    });
    return NextResponse.json({ workspace_id: result.workspaceId, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}
