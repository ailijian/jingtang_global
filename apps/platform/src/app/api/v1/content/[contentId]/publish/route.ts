import { ApplicationError } from "@jingtang/application";
import { confirmContentPublishing, getContentDetail } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorize, requestSession } from "../../../../../../server/auth";
import {
  apiError,
  correlationId,
  parseBody,
  requireSameOrigin,
} from "../../../../../../server/http";
import { getRuntime } from "../../../../../../server/runtime";
import { readFreshTikTokChannelAuthorization } from "../../../../../../server/tiktok-oauth";

const schema = z.object({
  revisionId: z.uuid(),
  idempotencyKey: z.uuid(),
  confirmed: z.literal(true),
  tiktok: z
    .object({
      channelId: z.uuid(),
      privacyLevel: z.literal("SELF_ONLY"),
      disableComment: z.boolean(),
      disableDuet: z.boolean(),
      disableStitch: z.boolean(),
      brandContentToggle: z.literal(false),
      brandOrganicToggle: z.boolean(),
      isAigc: z.boolean(),
      musicUsageConfirmed: z.literal(true),
      creatorInfoConfirmed: z.literal(true),
    })
    .optional(),
});

type Context = { readonly params: Promise<{ readonly contentId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.publish", requestId);
    const { contentId } = await context.params;
    const body = await parseBody(request, schema);
    const detail = await getContentDetail(getRuntime().db, workspaceId, contentId);
    const version = detail?.revision.platformVersions[0];
    if (!detail || detail.revision.id !== body.revisionId || !version) {
      throw new ApplicationError("not_found", "Content was not found", 404);
    }
    let tikTokSettings:
      | {
          readonly privacyLevel: "SELF_ONLY";
          readonly disableComment: boolean;
          readonly disableDuet: boolean;
          readonly disableStitch: boolean;
          readonly brandContentToggle: false;
          readonly brandOrganicToggle: boolean;
          readonly isAigc: boolean;
          readonly musicUsageConfirmed: true;
          readonly creatorInfoConfirmed: true;
          readonly creatorUsername: string;
          readonly creatorNickname: string;
          readonly maximumVideoDurationSeconds: number;
        }
      | undefined;
    if (version.platform === "tiktok") {
      if (!body.tiktok) {
        throw new ApplicationError(
          "invalid_input",
          "Fresh TikTok Creator Info and manual SELF_ONLY confirmation are required",
          400,
        );
      }
      const { material, provider, authorization } = await readFreshTikTokChannelAuthorization({
        workspaceId,
        channelId: body.tiktok.channelId,
      });
      if (material.externalAccountId !== version.accountReference) {
        throw new ApplicationError("permission_denied", "TikTok channel selection changed", 403);
      }
      if (authorization.openId !== version.accountReference) {
        throw new ApplicationError("permission_denied", "TikTok identity changed", 403);
      }
      const creator = await provider.readCreatorInfo(authorization.accessToken);
      if (
        !creator.privacyLevelOptions.includes("SELF_ONLY") ||
        (creator.commentDisabled && !body.tiktok.disableComment) ||
        (creator.duetDisabled && !body.tiktok.disableDuet) ||
        (creator.stitchDisabled && !body.tiktok.disableStitch) ||
        !detail.sourceAsset.durationSeconds ||
        detail.sourceAsset.durationSeconds > creator.maximumVideoDurationSeconds
      ) {
        throw new ApplicationError(
          "invalid_input",
          "TikTok Creator Info no longer permits these exact private publish settings",
          400,
        );
      }
      tikTokSettings = {
        privacyLevel: "SELF_ONLY",
        disableComment: body.tiktok.disableComment,
        disableDuet: body.tiktok.disableDuet,
        disableStitch: body.tiktok.disableStitch,
        brandContentToggle: false,
        brandOrganicToggle: body.tiktok.brandOrganicToggle,
        isAigc: body.tiktok.isAigc,
        musicUsageConfirmed: true,
        creatorInfoConfirmed: true,
        creatorUsername: creator.creatorUsername,
        creatorNickname: creator.creatorNickname,
        maximumVideoDurationSeconds: creator.maximumVideoDurationSeconds,
      };
    } else if (body.tiktok) {
      throw new ApplicationError("invalid_input", "TikTok settings do not apply here", 400);
    }
    const result = await confirmContentPublishing(getRuntime().db, {
      workspaceId,
      contentId,
      revisionId: body.revisionId,
      actorUserId: session.user.id,
      consentVersion: getRuntime().config.DATA_PURPOSE_VERSION,
      idempotencyKey: body.idempotencyKey,
      correlationId: requestId,
      ...(tikTokSettings ? { tikTokSettings } : {}),
    });
    return NextResponse.json(
      { intent_id: result.intentId, execution_id: result.executionId },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
