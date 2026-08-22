import { confirmContentPublishing } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorize, requestSession } from "../../../../../../server/auth";
import {
  apiError,
  correlationId,
  parseBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

const schema = z.object({
  revisionId: z.uuid(),
  idempotencyKey: z.uuid(),
  confirmed: z.literal(true),
});

type Context = { readonly params: Promise<{ readonly contentId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.publish", requestId);
    const { contentId } = await context.params;
    const body = await parseBody(request, schema);
    const result = await confirmContentPublishing(getRuntime().db, {
      workspaceId,
      contentId,
      revisionId: body.revisionId,
      actorUserId: session.user.id,
      consentVersion: getRuntime().config.DATA_PURPOSE_VERSION,
      idempotencyKey: body.idempotencyKey,
      correlationId: requestId,
    });
    return NextResponse.json(
      { intent_id: result.intentId, execution_id: result.executionId },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
