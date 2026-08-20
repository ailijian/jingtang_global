import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  apiError,
  correlationId,
  parseBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

const schema = z.object({ email: z.email() });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const { email } = await parseBody(request, schema);
    await getRuntime().identity.requestPasswordReset(email);
    return NextResponse.json({ accepted: true, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}
