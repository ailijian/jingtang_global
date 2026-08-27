import {
  ApplicationError,
  TikTokOAuthFlowStateCodec,
  assertTikTokOAuthFlowBinding,
  parseStoredTikTokAuthorization,
  tikTokAuthorizationRequiresRefresh,
  tikTokOAuthCallbackPath,
  type StoredTikTokAuthorization,
  type TikTokOAuthProvider,
  type TokenEnvelopeVault,
  usesSecureCookies,
} from "@jingtang/application";
import {
  readConnectedChannelAuthorization,
  refreshConnectedChannelTokenEnvelope,
  type SessionView,
} from "@jingtang/db";
import type { NextResponse } from "next/server";

import { getRuntime } from "./runtime";

export function tikTokOAuthCookieName(): "__Host-jt_tiktok_oauth" | "jt_tiktok_oauth" {
  return usesSecureCookies(getRuntime().config.APP_ENV)
    ? "__Host-jt_tiktok_oauth"
    : "jt_tiktok_oauth";
}

export function tikTokOAuthRedirectUri(): string {
  return new URL(tikTokOAuthCallbackPath, getRuntime().config.APP_BASE_URL).toString();
}

export function tikTokOAuthServices(): {
  readonly provider: TikTokOAuthProvider;
  readonly vault: TokenEnvelopeVault;
  readonly codec: TikTokOAuthFlowStateCodec;
} {
  const runtime = getRuntime();
  if (!runtime.tiktokOAuth || !runtime.tokenVault || !runtime.config.TIKTOK_OAUTH_STATE_SECRET) {
    throw new ApplicationError(
      "service_unavailable",
      "TikTok connection is not enabled in this environment",
      503,
    );
  }
  return {
    provider: runtime.tiktokOAuth,
    vault: runtime.tokenVault,
    codec: new TikTokOAuthFlowStateCodec(runtime.config.TIKTOK_OAUTH_STATE_SECRET),
  };
}

export function setTikTokOAuthCookie(response: NextResponse, value: string): void {
  response.cookies.set(tikTokOAuthCookieName(), value, {
    httpOnly: true,
    secure: usesSecureCookies(getRuntime().config.APP_ENV),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export function clearTikTokOAuthCookie(response: NextResponse): void {
  response.cookies.set(tikTokOAuthCookieName(), "", {
    httpOnly: true,
    secure: usesSecureCookies(getRuntime().config.APP_ENV),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function assertTikTokOAuthBinding(
  context: Parameters<typeof assertTikTokOAuthFlowBinding>[0],
  session: SessionView,
): void {
  assertTikTokOAuthFlowBinding(context, {
    sessionId: session.id,
    userId: session.user.id,
    workspaceId: session.currentWorkspaceId,
    locale: session.user.locale,
  });
}

export async function readFreshTikTokChannelAuthorization(input: {
  readonly workspaceId: string;
  readonly channelId: string;
}): Promise<{
  readonly material: Awaited<ReturnType<typeof readConnectedChannelAuthorization>>;
  readonly provider: TikTokOAuthProvider;
  readonly authorization: StoredTikTokAuthorization;
}> {
  const runtime = getRuntime();
  const material = await readConnectedChannelAuthorization(runtime.db, {
    ...input,
    platform: "tiktok",
  });
  const { provider, vault } = tikTokOAuthServices();
  const stored = parseStoredTikTokAuthorization(
    await vault.open(material.tokenEnvelopeCiphertext, material.tokenCiphertextReference),
  );
  if (stored.openId !== material.externalAccountId) {
    throw new ApplicationError("permission_denied", "TikTok identity changed", 403);
  }
  if (!tikTokAuthorizationRequiresRefresh(stored.accessTokenExpiresAt)) {
    return { material, provider, authorization: stored };
  }

  const refreshed = await provider.refreshAuthorization(stored.refreshToken);
  if (refreshed.openId !== material.externalAccountId) {
    throw new ApplicationError("permission_denied", "TikTok identity changed", 403);
  }
  const authorization: StoredTikTokAuthorization = {
    accessToken: refreshed.accessToken,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt.toISOString(),
    refreshToken: refreshed.refreshToken,
    refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt.toISOString(),
    openId: refreshed.openId,
    grantedScopes: [...refreshed.grantedScopes],
  };
  const envelope = await vault.seal(authorization);
  try {
    const result = await refreshConnectedChannelTokenEnvelope(runtime.db, {
      ...input,
      platform: "tiktok",
      externalAccountId: material.externalAccountId,
      grantedScopes: authorization.grantedScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      expectedTokenCiphertextReference: material.tokenCiphertextReference,
    });
    if (result.retiredKeyReference) {
      await vault.destroy(result.retiredKeyReference).catch(() => undefined);
    }
  } catch (error) {
    await vault.destroy(envelope.keyReference).catch(() => undefined);
    throw error;
  }
  return { material, provider, authorization };
}
