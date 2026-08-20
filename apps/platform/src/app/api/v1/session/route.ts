import { listUserWorkspaces } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { requestSession } from "../../../../server/auth";
import { apiError, correlationId } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    const session = await requestSession(request);
    const workspaces = await listUserWorkspaces(getRuntime().db, session.user.id);
    return NextResponse.json({ session, workspaces, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}
