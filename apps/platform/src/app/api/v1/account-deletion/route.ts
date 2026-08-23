import { ApplicationError, isApplicationError } from "@jingtang/application";
import { requestAccountDeletion } from "@jingtang/db";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";

import { clearSessionCookie, requestSession } from "../../../../server/auth";
import { correlationId, requireSameOrigin } from "../../../../server/http";
import { getRuntime } from "../../../../server/runtime";

function settingsRedirect(result: string): URL {
  const url = new URL("/app/settings/data", getRuntime().config.APP_BASE_URL);
  url.searchParams.set("account", result);
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      throw new ApplicationError("invalid_input", "Form encoding is required", 400);
    }
    const form = new URLSearchParams(await request.text());
    const confirmedEmail = form.get("account_email");
    if (!confirmedEmail || form.get("confirmation") !== "delete_jingtang_account") {
      throw new ApplicationError(
        "invalid_input",
        "Explicit account deletion confirmation is required",
        400,
      );
    }
    const result = await requestAccountDeletion(getRuntime().db, {
      userId: session.user.id,
      confirmedEmail,
      correlationId: requestId,
    });
    const redirect = new URL("/login", getRuntime().config.APP_BASE_URL);
    redirect.searchParams.set("account_deletion", "pending");
    redirect.searchParams.set("reference", result.requestReference);
    const response = NextResponse.redirect(redirect, 303);
    clearSessionCookie(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const result = message.includes("requires owner transfer")
      ? "owner-transfer-required"
      : "failed";
    const category = isApplicationError(error)
      ? error.code
      : /^[a-z_]+$/u.test(message)
        ? message
        : "account_deletion_failed";
    safeLog("warn", "account_deletion_request_failed", { requestId, failureCategory: category });
    return NextResponse.redirect(settingsRedirect(result), 303);
  }
}
