import { ApplicationError } from "@jingtang/application";
import { recordAudit, updateLocalePreference } from "@jingtang/db";
import { isLocale } from "@jingtang/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requestSession, setLocaleCookie } from "../../../../server/auth";
import { apiError, correlationId, parseBody, requireSameOrigin } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

const schema = z.object({ locale: z.string().refine(isLocale) });

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const { locale } = await parseBody(request, schema);
    const runtime = getRuntime();
    let session = null;
    try {
      session = await requestSession(request);
    } catch (error) {
      if (!(error instanceof ApplicationError) || error.code !== "authentication_failed")
        throw error;
    }
    if (session) {
      await updateLocalePreference(runtime.db, session.user.id, locale);
      if (session.currentWorkspaceId) {
        await recordAudit(runtime.db, {
          workspaceId: session.currentWorkspaceId,
          actorUserId: session.user.id,
          action: "locale.changed",
          targetType: "user",
          targetId: session.user.id,
          result: "success",
          correlationId: requestId,
          metadata: { locale },
        });
      }
    }
    const response = NextResponse.json({ locale, request_id: requestId });
    setLocaleCookie(response, locale);
    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
