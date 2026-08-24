import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { ApplicationError } from "@jingtang/application";
import type { NextRequest, NextResponse } from "next/server";

const prefix = "identity-challenge:v1:";
const maxAgeSeconds = 5 * 60;

type ChallengePurpose = "signup" | "reset_password";

export interface IdentityChallenge {
  readonly v: 1;
  readonly purpose: ChallengePurpose;
  readonly email: string;
  readonly expiresAt: string;
  readonly providerChallenge: string;
  readonly name?: string;
  readonly locale?: "en" | "zh-CN";
}

function cookieName(purpose: ChallengePurpose, production: boolean): string {
  const name = purpose === "signup" ? "jt_signup_challenge" : "jt_reset_challenge";
  return production ? `__Host-${name}` : name;
}

function key(secret: string): Buffer {
  return createHash("sha256").update("jingtang.identity-challenge.v1\0").update(secret).digest();
}

function associatedData(purpose: ChallengePurpose): Buffer {
  return Buffer.from(`jingtang.identity-challenge.v1:${purpose}`, "utf8");
}

export function sealIdentityChallenge(value: IdentityChallenge, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(associatedData(value.purpose));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  return `${prefix}${Buffer.from(
    JSON.stringify({
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    }),
    "utf8",
  ).toString("base64url")}`;
}

export function openIdentityChallenge(
  serialized: string | undefined,
  purpose: ChallengePurpose,
  email: string,
  secret: string,
): IdentityChallenge {
  try {
    if (!serialized?.startsWith(prefix)) throw new Error("missing");
    const envelope = JSON.parse(
      Buffer.from(serialized.slice(prefix.length), "base64url").toString("utf8"),
    ) as { readonly iv?: string; readonly ciphertext?: string; readonly tag?: string };
    if (!envelope.iv || !envelope.ciphertext || !envelope.tag) throw new Error("invalid");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(associatedData(purpose));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const value = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as Partial<IdentityChallenge>;
    if (
      value.v !== 1 ||
      value.purpose !== purpose ||
      value.email !== email.trim().toLowerCase() ||
      typeof value.expiresAt !== "string" ||
      new Date(value.expiresAt).getTime() <= Date.now() ||
      typeof value.providerChallenge !== "string"
    ) {
      throw new Error("invalid");
    }
    return value as IdentityChallenge;
  } catch {
    throw new ApplicationError("invalid_input", "Identity challenge is invalid or expired", 400);
  }
}

export function setIdentityChallengeCookie(
  response: NextResponse,
  value: IdentityChallenge,
  secret: string,
  production: boolean,
): void {
  response.cookies.set(
    cookieName(value.purpose, production),
    sealIdentityChallenge(value, secret),
    {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
      maxAge: maxAgeSeconds,
    },
  );
}

export function readIdentityChallengeCookie(
  request: NextRequest,
  purpose: ChallengePurpose,
  email: string,
  secret: string,
  production: boolean,
): IdentityChallenge {
  return openIdentityChallenge(
    request.cookies.get(cookieName(purpose, production))?.value,
    purpose,
    email,
    secret,
  );
}

export function clearIdentityChallengeCookie(
  response: NextResponse,
  purpose: ChallengePurpose,
  production: boolean,
): void {
  response.cookies.set(cookieName(purpose, production), "", {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
