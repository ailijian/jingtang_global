import { listActivity } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../server/auth";
import { contentJson } from "../../../../server/content";
import { apiError, correlationId } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

export async function GET(request: NextRequest) {
  const requestId = correlationId(request);
  try {
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "activity.read", requestId);
    const activity = await listActivity(getRuntime().db, workspaceId);
    return NextResponse.json({ activity: contentJson(activity) });
  } catch (error) {
    return apiError(error, requestId);
  }
}
