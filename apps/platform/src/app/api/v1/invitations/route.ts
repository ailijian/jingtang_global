import { createInvitation } from "@jingtang/db";
import { roles } from "@jingtang/domain";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorize, requestSession } from "../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

const schema = z.object({ email: z.email(), role: z.enum(roles) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "member.invite", requestId);
    const input = await parseBody(request, schema);
    const runtime = getRuntime();
    const invitation = await createInvitation(runtime.db, {
      workspaceId,
      actorUserId: session.user.id,
      email: input.email,
      role: input.role,
      correlationId: requestId,
    });
    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          expiresAt: invitation.expiresAt,
          ...(runtime.config.ALLOW_TEST_IDENTITY ? { token: invitation.token } : {}),
        },
        request_id: requestId,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
