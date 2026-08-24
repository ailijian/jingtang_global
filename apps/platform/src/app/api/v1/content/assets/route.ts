import { randomUUID } from "node:crypto";

import { ApplicationError } from "@jingtang/application";
import { createPendingSourceAsset, failSourceAsset } from "@jingtang/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorize, requestSession } from "../../../../../server/auth";
import {
  apiError,
  correlationId,
  enforceReviewRateLimit,
  parseBody,
  requireSameOrigin,
} from "../../../../../server/http";
import { getRuntime } from "../../../../../server/runtime";

const allowedMediaTypes = new Set(["video/mp4", "video/quicktime"]);
const schema = z.object({
  filename: z.string().trim().min(1).max(255),
  mediaType: z.string().trim().min(1).max(160),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sha256Base64: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
  ownershipConfirmed: z.literal(true),
});

function safeFilename(filename: string): string {
  const normalized = filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(-180) || "source-asset";
}

export async function POST(request: NextRequest) {
  const requestId = correlationId(request);
  try {
    requireSameOrigin(request);
    enforceReviewRateLimit(request, {
      bucket: "asset-upload-initiate",
      limit: 30,
      windowMs: 10 * 60_000,
    });
    const input = await parseBody(request, schema);
    const session = await requestSession(request);
    const { workspaceId } = await authorize(session, "content.create", requestId);
    const { config, db, assets } = getRuntime();
    if (input.byteSize > config.MAX_SOURCE_ASSET_BYTES) {
      throw new ApplicationError("payload_too_large", "Source Asset is too large", 413);
    }
    if (!allowedMediaTypes.has(input.mediaType)) {
      throw new ApplicationError("invalid_input", "Source Asset media type is not supported", 400);
    }
    if (config.ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES > 0) {
      const activeBytes = await assets.activeBytes("workspaces/");
      if (activeBytes + input.byteSize > config.ACTIVE_SOURCE_ASSET_SOFT_QUOTA_BYTES) {
        throw new ApplicationError(
          "payload_too_large",
          "The active Source Asset storage limit has been reached",
          413,
        );
      }
    }
    const assetId = randomUUID();
    const objectKey = `workspaces/${workspaceId}/source-assets/${assetId}/${safeFilename(input.filename)}`;
    await createPendingSourceAsset(db, {
      id: assetId,
      workspaceId,
      objectKey,
      filename: input.filename,
      mediaType: input.mediaType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      ownershipConfirmed: true,
      uploadedByUserId: session.user.id,
    });
    try {
      const upload = await assets.createDirectUpload({
        key: objectKey,
        contentType: input.mediaType,
        contentLength: input.byteSize,
        sha256Hex: input.sha256,
        sha256Base64: input.sha256Base64,
        expiresInSeconds: 10 * 60,
      });
      return NextResponse.json(
        {
          asset_id: assetId,
          upload,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          request_id: requestId,
        },
        { status: 201 },
      );
    } catch {
      await failSourceAsset(db, {
        workspaceId,
        assetId,
        actorUserId: session.user.id,
        correlationId: requestId,
        failureCategory: "upload_authorization_failed",
      }).catch(() => undefined);
      throw new ApplicationError(
        "service_unavailable",
        "The Source Asset upload could not be authorized",
        503,
      );
    }
  } catch (error) {
    return apiError(error, requestId);
  }
}
