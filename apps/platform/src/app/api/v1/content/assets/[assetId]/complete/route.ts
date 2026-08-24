import { ApplicationError } from "@jingtang/application";
import type { SourceAsset } from "@jingtang/domain";
import { completeSourceAsset, failSourceAsset, readPendingSourceAssetUpload } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../../../server/auth";
import { apiError, correlationId, requireSameOrigin } from "../../../../../../../server/http";
import { getRuntime } from "../../../../../../../server/runtime";

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly assetId: string }> },
) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.create", requestId);
    const { assetId } = await context.params;
    const { db, assets } = getRuntime();
    const pending = await readPendingSourceAssetUpload(db, { workspaceId, assetId });
    if (!pending) throw new ApplicationError("not_found", "Source Asset was not found", 404);
    let stored;
    try {
      stored = await assets.stat(pending.objectKey);
    } catch {
      throw new ApplicationError(
        "service_unavailable",
        "The Source Asset upload has not been confirmed by object storage",
        503,
      );
    }
    const matches =
      stored.contentLength === pending.byteSize &&
      stored.contentType === pending.mediaType &&
      stored.sha256Hex === pending.sha256;
    if (!matches) {
      await assets.delete(pending.objectKey).catch(() => undefined);
      await failSourceAsset(db, {
        workspaceId,
        assetId,
        actorUserId: session.user.id,
        correlationId: requestId,
        failureCategory: "upload_integrity_mismatch",
      });
      throw new ApplicationError("invalid_input", "Source Asset integrity check failed", 400);
    }
    const asset = await completeSourceAsset(db, {
      workspaceId,
      assetId,
      actorUserId: session.user.id,
      correlationId: requestId,
    });
    const response: SourceAsset = {
      asset_id: asset.id,
      workspace_id: asset.workspaceId,
      content_id: asset.contentId,
      filename: asset.filename,
      media_type: asset.mediaType,
      byte_size: asset.byteSize,
      sha256: asset.sha256,
      status: asset.status,
      ownership_confirmed: true,
      failure_category: asset.failureCategory,
      created_at: asset.createdAt.toISOString(),
      updated_at: asset.updatedAt.toISOString(),
    };
    return NextResponse.json(response);
  } catch (error) {
    return apiError(error, requestId);
  }
}
