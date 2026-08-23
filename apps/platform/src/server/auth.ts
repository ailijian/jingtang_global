import { randomUUID } from "node:crypto";

import { ApplicationError } from "@jingtang/application";
import {
  getMembershipRole,
  readSession,
  recordAuthorizationDenied,
  type SessionView,
} from "@jingtang/db";
import { permissionDecision, type Locale, type Permission, type Role } from "@jingtang/domain";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { getRuntime } from "./runtime";

export function sessionCookieName(): "__Host-jt_session" | "jt_session" {
  return getRuntime().config.APP_ENV === "production" ? "__Host-jt_session" : "jt_session";
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  const production = getRuntime().config.APP_ENV === "production";
  response.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: getRuntime().config.APP_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function setLocaleCookie(response: NextResponse, locale: Locale): void {
  response.cookies.set("jt_locale", locale, {
    secure: getRuntime().config.APP_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 31_536_000,
  });
}

export async function requestSession(request: NextRequest): Promise<SessionView> {
  const token = request.cookies.get(sessionCookieName())?.value;
  if (!token)
    throw new ApplicationError("authentication_failed", "Authentication is required", 401);
  const runtime = getRuntime();
  const session = await readSession(runtime.db, token, runtime.config.SESSION_COOKIE_SECRET);
  if (!session)
    throw new ApplicationError("authentication_failed", "Session is invalid or expired", 401);
  return session;
}

export async function pageSession(): Promise<SessionView | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  const runtime = getRuntime();
  return readSession(runtime.db, token, runtime.config.SESSION_COOKIE_SECRET);
}

export async function authorize(
  session: SessionView,
  permission: Permission,
  requestId: string = randomUUID(),
): Promise<{ readonly workspaceId: string; readonly role: Role }> {
  if (!session.currentWorkspaceId) {
    throw new ApplicationError("permission_denied", "Select a Workspace before continuing", 403);
  }
  const runtime = getRuntime();
  const role = await getMembershipRole(runtime.db, session.currentWorkspaceId, session.user.id);
  const decision = permissionDecision(role, permission);
  if (!decision.allowed) {
    await recordAuthorizationDenied(runtime.db, {
      workspaceId: session.currentWorkspaceId,
      userId: session.user.id,
      permission,
      reason: decision.reason,
      correlationId: requestId,
    });
    throw new ApplicationError(
      "permission_denied",
      "The current role does not allow this action",
      403,
    );
  }
  if (role === undefined) {
    throw new ApplicationError("permission_denied", "Workspace membership is required", 403);
  }
  return { workspaceId: session.currentWorkspaceId, role };
}
