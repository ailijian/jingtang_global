import { ApplicationError } from "@jingtang/application";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../server/auth";
import { apiError, correlationId, enforceReviewRateLimit } from "../../../../../../server/http";
import { readFreshTikTokChannelAuthorization } from "../../../../../../server/tiktok-oauth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = correlationId(request);
  try {
    enforceReviewRateLimit(request, {
      bucket: "tiktok-creator-info",
      limit: 30,
      windowMs: 5 * 60_000,
    });
    const channelId = request.nextUrl.searchParams.get("channel_id");
    if (!channelId) throw new ApplicationError("invalid_input", "TikTok channel is required", 400);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.publish", requestId);
    const { material, provider, authorization } = await readFreshTikTokChannelAuthorization({
      workspaceId,
      channelId,
    });
    const creator = await provider.readCreatorInfo(authorization.accessToken);
    if (!creator.privacyLevelOptions.includes("SELF_ONLY")) {
      throw new ApplicationError(
        "permission_denied",
        "This TikTok account does not currently permit SELF_ONLY Direct Post",
        403,
      );
    }
    return NextResponse.json({
      channel_id: channelId,
      external_account_id: material.externalAccountId,
      display_name: material.displayName,
      creator_username: creator.creatorUsername,
      creator_nickname: creator.creatorNickname,
      privacy_level_options: creator.privacyLevelOptions,
      comment_disabled: creator.commentDisabled,
      duet_disabled: creator.duetDisabled,
      stitch_disabled: creator.stitchDisabled,
      max_video_post_duration_sec: creator.maximumVideoDurationSeconds,
      request_id: requestId,
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
