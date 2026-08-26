import { ApplicationError } from "@jingtang/application";
import { requestFacebookAuthorizedDataDeletion } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import {
  apiError,
  correlationId,
  enforceReviewRateLimit,
  parseFormBody,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import { facebookOAuthServices } from "../../../../../../server/facebook-oauth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    enforceReviewRateLimit(request, {
      bucket: "facebook-deauthorize",
      limit: 60,
      windowMs: 5 * 60_000,
    });
    const signedRequest = (await parseFormBody(request, 16_384)).get("signed_request");
    if (typeof signedRequest !== "string" || signedRequest.length > 16_384) {
      throw new ApplicationError("invalid_input", "Invalid Meta signed request", 400);
    }
    const { userId } = facebookOAuthServices().provider.verifySignedRequest(signedRequest);
    await requestFacebookAuthorizedDataDeletion(getRuntime().db, userId);
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
