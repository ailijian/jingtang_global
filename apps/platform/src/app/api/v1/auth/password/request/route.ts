import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { usesSecureCookies } from "@jingtang/application";

import {
  apiError,
  correlationId,
  parseBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import { setIdentityChallengeCookie } from "../../../../../../server/identity-challenge";

const schema = z.object({ email: z.email() });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const { email } = await parseBody(request, schema);
    const runtime = getRuntime();
    const result = await runtime.identity.requestPasswordReset(email);
    const response = NextResponse.json({ accepted: true, request_id: requestId });
    if (result.challenge) {
      setIdentityChallengeCookie(
        response,
        {
          v: 1,
          purpose: "reset_password",
          email: email.trim().toLowerCase(),
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          providerChallenge: result.challenge,
        },
        runtime.config.SESSION_COOKIE_SECRET,
        usesSecureCookies(runtime.config.APP_ENV),
      );
    }
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
