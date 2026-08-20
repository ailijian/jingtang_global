import { changeMemberRole, removeMember } from "@jingtang/db";
import { roles } from "@jingtang/domain";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorize, requestSession } from "../../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const schema = z.object({ role: z.enum(roles) });
type Context = { readonly params: Promise<{ readonly membershipId: string }> };

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "member.role.assign", requestId);
    const input = await parseBody(request, schema);
    const { membershipId } = await context.params;
    await changeMemberRole(getRuntime().db, {
      workspaceId,
      actorUserId: session.user.id,
      membershipId,
      role: input.role,
      correlationId: requestId,
    });
    return NextResponse.json({ changed: true, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function DELETE(request: NextRequest, context: Context): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "member.remove", requestId);
    const { membershipId } = await context.params;
    await removeMember(getRuntime().db, {
      workspaceId,
      actorUserId: session.user.id,
      membershipId,
      correlationId: requestId,
    });
    return NextResponse.json({ removed: true, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}
