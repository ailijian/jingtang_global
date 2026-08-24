import { createSession, recordConsent, upsertIdentityUser } from "@jingtang/db";
import { isLocale } from "@jingtang/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { setLocaleCookie, setSessionCookie } from "../../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
import { setIdentityChallengeCookie } from "../../../../../server/identity-challenge";
import { getRuntime } from "../../../../../server/runtime";

const schema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
  locale: z.string().refine(isLocale),
  consent: z.literal(true),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const input = await parseBody(request, schema);
    const runtime = getRuntime();
    const signup = await runtime.identity.signUp(input);
    if (!signup.confirmed) {
      if (!signup.challenge) throw new Error("identity_signup_challenge_missing");
      const response = NextResponse.json(
        { confirmation_required: true, request_id: requestId },
        { status: 202 },
      );
      setIdentityChallengeCookie(
        response,
        {
          v: 1,
          purpose: "signup",
          email: input.email.trim().toLowerCase(),
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          providerChallenge: signup.challenge,
          name: input.name,
          locale: input.locale,
        },
        runtime.config.SESSION_COOKIE_SECRET,
        runtime.config.APP_ENV === "production",
      );
      return response;
    }
    if (!signup.profile) throw new Error("identity_signup_profile_missing");
    const user = await upsertIdentityUser(runtime.db, {
      ...signup.profile,
      locale: input.locale,
    });
    await recordConsent(runtime.db, {
      userId: user.id,
      termsVersion: runtime.config.TERMS_VERSION,
      privacyVersion: runtime.config.PRIVACY_VERSION,
      dataPurposeVersion: runtime.config.DATA_PURPOSE_VERSION,
      displayedLocale: input.locale,
    });
    const session = await createSession(runtime.db, {
      userId: user.id,
      secret: runtime.config.SESSION_COOKIE_SECRET,
    });
    const response = NextResponse.json(
      { confirmation_required: false, request_id: requestId },
      { status: 201 },
    );
    setSessionCookie(response, session.token, session.expiresAt);
    setLocaleCookie(response, input.locale);
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
