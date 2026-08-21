import { randomUUID } from "node:crypto";

import { ApplicationError, isApplicationError } from "@jingtang/application";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

import { getRuntime } from "./runtime";

export function correlationId(request: NextRequest): string {
  const requested = request.headers.get("x-correlation-id");
  return requested &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)
    ? requested
    : randomUUID();
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const maximumBytes = 1_000_000;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ApplicationError("payload_too_large", "Request body is too large", 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) {
    throw new ApplicationError("payload_too_large", "Request body is too large", 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new ApplicationError("invalid_input", "Request body must be valid JSON", 400);
  }
  return schema.parse(value);
}

export function requireSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const expected = new URL(getRuntime().config.APP_BASE_URL).origin;
  if (!origin || origin !== expected) {
    throw new ApplicationError("permission_denied", "Request origin was rejected", 403);
  }
}

export function apiError(error: unknown, requestId: string): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_input",
          message: "Request validation failed",
          fields: error.flatten().fieldErrors,
        },
        request_id: requestId,
      },
      { status: 400 },
    );
  }
  if (isApplicationError(error)) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message }, request_id: requestId },
      { status: error.status },
    );
  }
  const code =
    error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "internal_error";
  safeLog("error", "api.request.failed", { requestId, code });
  return NextResponse.json(
    { error: { code, message: "The request could not be completed." }, request_id: requestId },
    {
      status: (() => {
        if (
          code === "membership_not_found" ||
          code === "invalid_invitation" ||
          code === "content_not_found"
        )
          return 404;
        if (
          code === "last_owner" ||
          code === "invalid_state" ||
          code === "source_asset_not_ready" ||
          code === "content_not_ready"
        )
          return 409;
        if (code === "platform_version_required" || code === "rejection_reason_required")
          return 400;
        return 500;
      })(),
    },
  );
}
