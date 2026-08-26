import { readProviderDataDeletionStatus } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { apiError, correlationId, enforceReviewRateLimit } from "../../../../../../../server/http";
import { getRuntime } from "../../../../../../../server/runtime";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    enforceReviewRateLimit(request, {
      bucket: "facebook-data-deletion-status",
      limit: 120,
      windowMs: 5 * 60_000,
    });
    const code = request.nextUrl.searchParams.get("code");
    if (!code || !/^META-[A-F0-9]{24}$/u.test(code)) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }
    const status = await readProviderDataDeletionStatus(getRuntime().db, code);
    return status
      ? NextResponse.json({ confirmation_code: code, status })
      : NextResponse.json({ status: "not_found" }, { status: 404 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
