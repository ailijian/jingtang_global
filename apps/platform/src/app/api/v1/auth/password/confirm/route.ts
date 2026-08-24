import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  apiError,
  correlationId,
  parseBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import {
  clearIdentityChallengeCookie,
  readIdentityChallengeCookie,
} from "../../../../../../server/identity-challenge";

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
    const runtime = getRuntime();
    const production = runtime.config.APP_ENV === "production";
    const challenge =
      runtime.config.IDENTITY_PROVIDER === "ciam"
        ? readIdentityChallengeCookie(
            request,
            "reset_password",
            input.email,
            runtime.config.SESSION_COOKIE_SECRET,
            production,
          )
        : undefined;
    await runtime.identity.confirmPasswordReset({
      ...input,
      ...(challenge ? { challenge: challenge.providerChallenge } : {}),
    });
    const response = NextResponse.json({ changed: true, request_id: requestId });
    clearIdentityChallengeCookie(response, "reset_password", production);
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
