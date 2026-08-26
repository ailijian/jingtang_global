import { randomUUID } from "node:crypto";

import { ApplicationError, isApplicationError } from "@jingtang/application";
import { safeLog } from "@jingtang/observability";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

import { getRuntime } from "./runtime";

interface ReviewRateLimitEntry {
  count: number;
  resetAt: number;
}

declare global {
  var __jingtangReviewRateLimits: Map<string, ReviewRateLimitEntry> | undefined;
}

function reviewRateLimitStore(): Map<string, ReviewRateLimitEntry> {
  globalThis.__jingtangReviewRateLimits ??= new Map();
  return globalThis.__jingtangReviewRateLimits;
}

function requestAddress(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function enforceReviewRateLimit(
  request: NextRequest,
  input: { readonly bucket: string; readonly limit: number; readonly windowMs: number },
): void {
  if (getRuntime().config.APP_ENV !== "review") return;
  const now = Date.now();
  const store = reviewRateLimitStore();
  if (store.size >= 10_000) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
    while (store.size >= 10_000) {
      const oldest = store.keys().next().value;
      if (!oldest) break;
      store.delete(oldest);
    }
  }
  const key = `${input.bucket}:${requestAddress(request)}`;
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + input.windowMs });
    return;
  }
  if (current.count >= input.limit) {
    throw new ApplicationError("rate_limited", "Too many requests. Try again later.", 429);
  }
  current.count += 1;
}

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

export async function parseFormBody(
  request: NextRequest,
  maximumBytes = 4096,
): Promise<URLSearchParams> {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    throw new ApplicationError("invalid_input", "Form encoding is required", 400);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ApplicationError("payload_too_large", "Request body is too large", 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) {
    throw new ApplicationError("payload_too_large", "Request body is too large", 413);
  }
  return new URLSearchParams(raw);
}

export function hasTrustedSameOriginMetadata(
  origin: string | null,
  fetchSite: string | null,
  expectedOrigin: string,
  fetchMode: string | null = null,
): boolean {
  if (origin && origin !== "null") return origin === expectedOrigin;
  if (origin === "null") return fetchSite === "same-origin" && fetchMode === "navigate";
  return fetchSite === "same-origin";
}

export function requireSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const expected = new URL(getRuntime().config.APP_BASE_URL).origin;
  if (
    !hasTrustedSameOriginMetadata(
      origin,
      request.headers.get("sec-fetch-site"),
      expected,
      request.headers.get("sec-fetch-mode"),
    )
  ) {
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
          code === "channel_already_connected" ||
          code === "invalid_state" ||
          code === "source_asset_not_ready" ||
          code === "content_not_ready" ||
          code === "content_not_publishable" ||
          code === "idempotency_conflict"
        )
          return 409;
        if (
          code === "platform_version_required" ||
          code === "rejection_reason_required" ||
          code === "unsupported_platform_selection" ||
          code === "youtube_test_upload_must_be_private"
        )
          return 400;
        if (code === "connected_channel_not_found") return 404;
        return 500;
      })(),
    },
  );
}
