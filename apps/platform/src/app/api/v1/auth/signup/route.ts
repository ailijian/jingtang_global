import { createSession, recordConsent, upsertIdentityUser } from "@jingtang/db";
import { isLocale } from "@jingtang/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { setLocaleCookie, setSessionCookie } from "../../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../../server/http";
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
    const user = await upsertIdentityUser(runtime.db, {
      subject: signup.subject,
      email: input.email,
      name: input.name,
      locale: input.locale,
    });
    await recordConsent(runtime.db, {
      userId: user.id,
      termsVersion: runtime.config.TERMS_VERSION,
      privacyVersion: runtime.config.PRIVACY_VERSION,
      dataPurposeVersion: runtime.config.DATA_PURPOSE_VERSION,
      displayedLocale: input.locale,
    });
    if (!signup.confirmed) {
      return NextResponse.json(
        { confirmation_required: true, request_id: requestId },
        { status: 202 },
      );
    }
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
