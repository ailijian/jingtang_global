import { createHash, randomUUID } from "node:crypto";

import { ApplicationError } from "@jingtang/application";
import type { SourceAsset } from "@jingtang/domain";
import { completeSourceAsset, createPendingSourceAsset, failSourceAsset } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";

import { authorize, requestSession } from "../../../../../server/auth";
import { apiError, correlationId, requireSameOrigin } from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const allowedMediaTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeFilename(filename: string): string {
  const normalized = filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(-180) || "source-asset";
}

export async function POST(request: NextRequest) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.create", requestId);
    const { config, db, assets } = getRuntime();
    const declaredHeader = request.headers.get("content-length");
    const declaredLength = Number(declaredHeader);
    if (!declaredHeader || !Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
      throw new ApplicationError("invalid_input", "A bounded Source Asset body is required", 400);
    }
    if (declaredLength > config.MAX_SOURCE_ASSET_BYTES + 100_000) {
      throw new ApplicationError("payload_too_large", "Source Asset is too large", 413);
    }
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      throw new ApplicationError("invalid_input", "A multipart Source Asset is required", 400);
    }
    const form = await request.formData();
    const file = form.get("asset");
    if (!(file instanceof File) || file.size < 1) {
      throw new ApplicationError("invalid_input", "Select a non-empty Source Asset", 400);
    }
    if (file.size > config.MAX_SOURCE_ASSET_BYTES) {
      throw new ApplicationError("payload_too_large", "Source Asset is too large", 413);
    }
    if (!allowedMediaTypes.has(file.type)) {
      throw new ApplicationError("invalid_input", "Source Asset media type is not supported", 400);
    }
    if (form.get("ownershipConfirmed") !== "true") {
      throw new ApplicationError(
        "invalid_input",
        "Confirm that you own or are authorized to use this Source Asset",
        400,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest();
    const assetId = randomUUID();
    const objectKey = `workspaces/${workspaceId}/source-assets/${assetId}/${safeFilename(file.name)}`;
    await createPendingSourceAsset(db, {
      id: assetId,
      workspaceId,
      objectKey,
      filename: file.name.slice(0, 255),
      mediaType: file.type,
      byteSize: file.size,
      sha256: digest.toString("hex"),
      ownershipConfirmed: true,
      uploadedByUserId: session.user.id,
    });
    try {
      await assets.put({
        key: objectKey,
        body: bytes,
        contentType: file.type,
        sha256Base64: digest.toString("base64"),
      });
    } catch {
      await failSourceAsset(db, {
        workspaceId,
        assetId,
        actorUserId: session.user.id,
        correlationId: requestId,
        failureCategory: "object_storage_unavailable",
      });
      throw new ApplicationError(
        "service_unavailable",
        "The Source Asset could not be stored. No content was created.",
        503,
      );
    }
    let asset;
    try {
      asset = await completeSourceAsset(db, {
        workspaceId,
        assetId,
        actorUserId: session.user.id,
        correlationId: requestId,
      });
    } catch {
      await assets.delete(objectKey).catch(() => undefined);
      await failSourceAsset(db, {
        workspaceId,
        assetId,
        actorUserId: session.user.id,
        correlationId: requestId,
        failureCategory: "upload_confirmation_failed",
      }).catch(() => undefined);
      throw new ApplicationError(
        "service_unavailable",
        "The Source Asset could not be confirmed. No content was created.",
        503,
      );
    }
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
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
