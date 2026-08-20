import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  apiError,
  correlationId,
  parseBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";

const schema = z.object({
  email: z.email(),
  code: z.string().trim().min(4).max(12),
  newPassword: z.string().min(12).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const input = await parseBody(request, schema);
    await getRuntime().identity.confirmPasswordReset(input);
    return NextResponse.json({ changed: true, request_id: requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}
