import { recordConsent, upsertIdentityUser } from "@jingtang/db";
import { usesSecureCookies } from "@jingtang/application";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
import {
  clearIdentityChallengeCookie,
  readIdentityChallengeCookie,
} from "../../../../../server/identity-challenge";
import { getRuntime } from "../../../../../server/runtime";

const schema = z.object({
  email: z.email(),
  code: z.string().trim().min(4).max(12),
  password: z.string().min(12).max(128).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const input = await parseBody(request, schema);
    const runtime = getRuntime();
    const production = usesSecureCookies(runtime.config.APP_ENV);
    const challenge = readIdentityChallengeCookie(
      request,
      "signup",
      input.email,
      runtime.config.SESSION_COOKIE_SECRET,
      production,
    );
    if (!challenge.name || !challenge.locale) throw new Error("identity_signup_context_missing");
    const profile = await runtime.identity.confirmSignUp({
      email: input.email,
      code: input.code,
      ...(input.password ? { password: input.password } : {}),
      name: challenge.name,
      challenge: challenge.providerChallenge,
    });
    const user = await upsertIdentityUser(runtime.db, { ...profile, locale: challenge.locale });
    await recordConsent(runtime.db, {
      userId: user.id,
      termsVersion: runtime.config.TERMS_VERSION,
      privacyVersion: runtime.config.PRIVACY_VERSION,
      dataPurposeVersion: runtime.config.DATA_PURPOSE_VERSION,
      displayedLocale: challenge.locale,
    });
    const response = NextResponse.json({ confirmed: true, request_id: requestId });
    clearIdentityChallengeCookie(response, "signup", production);
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
