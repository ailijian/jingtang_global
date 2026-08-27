import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import type { AuditAction, AuditResult, Locale, Platform, Role } from "@jingtang/domain";

import {
  ChannelState,
  InvitationStatus,
  LifecycleOperationKind,
  Locale as DbLocale,
  MembershipStatus,
  type PrismaClient,
  Role as DbRole,
  WorkspaceLifecycleState,
} from "./generated/client.js";
import type { Prisma } from "./generated/client.js";

type Transaction = Prisma.TransactionClient;

const roleToDb: Readonly<Record<Role, DbRole>> = {
  owner_admin: DbRole.OWNER_ADMIN,
  editor: DbRole.EDITOR,
  approver_publisher: DbRole.APPROVER_PUBLISHER,
  viewer: DbRole.VIEWER,
};

const dbToRole: Readonly<Record<DbRole, Role>> = {
  OWNER_ADMIN: "owner_admin",
  EDITOR: "editor",
  APPROVER_PUBLISHER: "approver_publisher",
  VIEWER: "viewer",
};

const localeToDb: Readonly<Record<Locale, DbLocale>> = {
  en: DbLocale.EN,
  "zh-CN": DbLocale.ZH_CN,
};

const dbToLocale: Readonly<Record<DbLocale, Locale>> = {
  EN: "en",
  ZH_CN: "zh-CN",
};

export interface SessionView {
  readonly id: string;
  readonly user: {
    readonly id: string;
    readonly subject: string;
    readonly email: string;
    readonly name: string;
    readonly locale: Locale;
  };
  readonly currentWorkspaceId: string | null;
  readonly expiresAt: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sessionHash(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

function invitationHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

async function setTenantContext(tx: Transaction, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
}

async function setUserContext(tx: Transaction, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
}

async function lockOwnerInvariant(tx: Transaction, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`;
}

async function lockChannelConnectionInvariant(
  tx: Transaction,
  workspaceId: string,
  platform: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${platform}:connection`}, 0))`;
}

async function enqueueTokenKeyRetirementCandidate(
  transaction: Transaction,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly keyReference: string;
  },
): Promise<void> {
  const now = new Date();
  await transaction.lifecycleOperation.createMany({
    data: [
      {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        dedupeKey: `token_key_retirement:${createHash("sha256")
          .update(input.keyReference)
          .digest("hex")}`,
        requestReference: `KEY-${randomBytes(14).toString("hex").toUpperCase()}`,
        correlationId: randomUUID(),
        requestedAt: now,
        deadlineAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        nextAttemptAt: now,
        retentionExpiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        outcome: { key_reference: input.keyReference },
      },
    ],
    skipDuplicates: true,
  });
}

async function countEligibleOwners(tx: Transaction, workspaceId: string): Promise<number> {
  return tx.membership.count({
    where: {
      workspaceId,
      role: DbRole.OWNER_ADMIN,
      status: MembershipStatus.ACTIVE,
      user: { lifecycleState: "active" },
    },
  });
}

export async function withTenant<T>(
  client: PrismaClient,
  workspaceId: string,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (transaction) => {
    await setTenantContext(transaction, workspaceId);
    return operation(transaction);
  });
}

export async function upsertIdentityUser(
  client: PrismaClient,
  input: {
    readonly subject: string;
    readonly email: string;
    readonly name: string;
    readonly locale: Locale;
  },
): Promise<{ readonly id: string }> {
  return client.user.upsert({
    where: { cognitoSubject: input.subject },
    create: {
      cognitoSubject: input.subject,
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      localePreference: localeToDb[input.locale],
    },
    update: {
      email: normalizeEmail(input.email),
      name: input.name.trim(),
    },
    select: { id: true },
  });
}

export async function recordConsent(
  client: PrismaClient,
  input: {
    readonly userId: string;
    readonly termsVersion: string;
    readonly privacyVersion: string;
    readonly dataPurposeVersion: string;
    readonly displayedLocale: Locale;
    readonly acceptanceMethod?:
      | "registration_checkbox"
      | "youtube_connection_checkbox"
      | "facebook_connection_checkbox"
      | "tiktok_connection_checkbox";
  },
): Promise<{ readonly id: string }> {
  return client.consentRecord.create({
    data: {
      userId: input.userId,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      dataPurposeVersion: input.dataPurposeVersion,
      displayedLocale: localeToDb[input.displayedLocale],
      acceptanceMethod: input.acceptanceMethod ?? "registration_checkbox",
    },
    select: { id: true },
  });
}

export interface ChannelView {
  readonly id: string;
  readonly workspaceId: string;
  readonly platform: Platform;
  readonly externalAccountId: string | null;
  readonly displayName: string | null;
  readonly state:
    | "not_connected"
    | "connecting"
    | "connected"
    | "reauthorization_required"
    | "disconnecting"
    | "disconnected";
  readonly grantedScopes: readonly string[];
  readonly authorizedAt: Date | null;
  readonly refreshedAt: Date | null;
  readonly deniedAt: Date | null;
  readonly disconnectRequestedAt: Date | null;
  readonly disconnectedAt: Date | null;
  readonly revokeFailureCategory: string | null;
}

const channelStateFromDb: Readonly<Record<ChannelState, ChannelView["state"]>> = {
  NOT_CONNECTED: "not_connected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  REAUTHORIZATION_REQUIRED: "reauthorization_required",
  DISCONNECTING: "disconnecting",
  DISCONNECTED: "disconnected",
};

export const YOUTUBE_OAUTH_FLOW_TTL_MS = 10 * 60_000;
export const FACEBOOK_OAUTH_FLOW_TTL_MS = 10 * 60_000;
export const TIKTOK_OAUTH_FLOW_TTL_MS = 10 * 60_000;

function channelView(channel: {
  readonly id: string;
  readonly workspaceId: string;
  readonly platform: string;
  readonly externalAccountId: string | null;
  readonly displayName: string | null;
  readonly state: ChannelState;
  readonly grantedScopes: readonly string[];
  readonly authorizedAt: Date | null;
  readonly refreshedAt: Date | null;
  readonly deniedAt: Date | null;
  readonly disconnectRequestedAt: Date | null;
  readonly disconnectedAt: Date | null;
  readonly revokeFailureCategory: string | null;
}): ChannelView {
  if (
    channel.platform !== "youtube" &&
    channel.platform !== "facebook" &&
    channel.platform !== "tiktok"
  ) {
    throw new Error("unsupported_channel_platform");
  }
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    platform: channel.platform,
    externalAccountId: channel.externalAccountId,
    displayName: channel.displayName,
    state: channelStateFromDb[channel.state],
    grantedScopes: channel.grantedScopes,
    authorizedAt: channel.authorizedAt,
    refreshedAt: channel.refreshedAt,
    deniedAt: channel.deniedAt,
    disconnectRequestedAt: channel.disconnectRequestedAt,
    disconnectedAt: channel.disconnectedAt,
    revokeFailureCategory: channel.revokeFailureCategory,
  };
}

async function listPlatformChannels(
  client: PrismaClient,
  workspaceId: string,
  platform: Platform,
): Promise<readonly ChannelView[]> {
  return withTenant(client, workspaceId, async (transaction) => {
    const channels = await transaction.channel.findMany({
      where: { workspaceId, platform },
      orderBy: { updatedAt: "desc" },
    });
    return channels.map(channelView);
  });
}

export async function listYouTubeChannels(
  client: PrismaClient,
  workspaceId: string,
): Promise<readonly ChannelView[]> {
  return listPlatformChannels(client, workspaceId, "youtube");
}

export async function listFacebookChannels(
  client: PrismaClient,
  workspaceId: string,
): Promise<readonly ChannelView[]> {
  return listPlatformChannels(client, workspaceId, "facebook");
}

export async function listTikTokChannels(
  client: PrismaClient,
  workspaceId: string,
): Promise<readonly ChannelView[]> {
  return listPlatformChannels(client, workspaceId, "tiktok");
}

export async function readConnectedChannelAuthorization(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly platform: Platform;
  },
): Promise<{
  readonly externalAccountId: string;
  readonly displayName: string;
  readonly tokenEnvelopeCiphertext: string;
  readonly tokenCiphertextReference: string | null;
}> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    const channel = await transaction.channel.findFirst({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: input.platform,
        state: ChannelState.CONNECTED,
      },
    });
    if (!channel?.externalAccountId || !channel.displayName || !channel.tokenEnvelopeCiphertext) {
      throw new Error("channel_reauthorization_required");
    }
    return {
      externalAccountId: channel.externalAccountId,
      displayName: channel.displayName,
      tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
      tokenCiphertextReference: channel.tokenCiphertextReference,
    };
  });
}

export async function refreshConnectedChannelTokenEnvelope(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly platform: Platform;
    readonly externalAccountId: string;
    readonly grantedScopes: readonly string[];
    readonly tokenEnvelopeCiphertext: string;
    readonly tokenCiphertextReference: string;
    readonly expectedTokenCiphertextReference: string | null;
  },
): Promise<{ readonly retiredKeyReference: string | null }> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    const updated = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: input.platform,
        state: ChannelState.CONNECTED,
        externalAccountId: input.externalAccountId,
        tokenCiphertextReference: input.expectedTokenCiphertextReference,
        operationLeaseId: null,
      },
      data: {
        grantedScopes: [...input.grantedScopes],
        tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext,
        tokenCiphertextReference: input.tokenCiphertextReference,
        refreshedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("channel_authorization_refresh_superseded");
    if (input.expectedTokenCiphertextReference) {
      await enqueueTokenKeyRetirementCandidate(transaction, {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        keyReference: input.expectedTokenCiphertextReference,
      });
    }
    return { retiredKeyReference: input.expectedTokenCiphertextReference };
  });
}

async function beginPlatformConnection(
  client: PrismaClient,
  input: {
    readonly platform: Platform;
    readonly workspaceId: string;
    readonly consentRecordId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly oauthStateDigest?: string;
  },
): Promise<{ readonly id: string }> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await lockChannelConnectionInvariant(transaction, input.workspaceId, input.platform);
    const current = await transaction.channel.findUnique({
      where: {
        workspaceId_platform: { workspaceId: input.workspaceId, platform: input.platform },
      },
      select: {
        id: true,
        state: true,
        tokenEnvelopeCiphertext: true,
        tokenCiphertextReference: true,
      },
    });
    if (
      current &&
      current.state !== ChannelState.NOT_CONNECTED &&
      current.state !== ChannelState.DISCONNECTED &&
      current.state !== ChannelState.REAUTHORIZATION_REQUIRED &&
      current.state !== ChannelState.CONNECTING
    ) {
      throw new Error("channel_already_connected");
    }
    if (current?.tokenEnvelopeCiphertext || current?.tokenCiphertextReference) {
      throw new Error("channel_authorized_data_cleanup_required");
    }
    const channel = current
      ? await transaction.channel.update({
          where: { id: current.id },
          data: {
            state: ChannelState.CONNECTING,
            consentRecordId: input.consentRecordId,
            deniedAt: null,
            grantedScopes: [],
            authorizationSubjectReference: null,
            oauthStateDigest: input.oauthStateDigest ?? null,
          },
          select: { id: true },
        })
      : await transaction.channel.create({
          data: {
            workspaceId: input.workspaceId,
            platform: input.platform,
            state: ChannelState.CONNECTING,
            consentRecordId: input.consentRecordId,
            oauthStateDigest: input.oauthStateDigest ?? null,
          },
          select: { id: true },
        });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "channel.connection_started",
      targetType: "channel",
      targetId: channel.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: {
        platform: input.platform,
        supersededIncompleteAttempt: current?.state === ChannelState.CONNECTING,
      },
    });
    return channel;
  });
}

export async function beginYouTubeConnection(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly consentRecordId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
  },
): Promise<{ readonly id: string }> {
  return beginPlatformConnection(client, { ...input, platform: "youtube" });
}

export async function beginFacebookConnection(
  client: PrismaClient,
  input: Parameters<typeof beginYouTubeConnection>[1] & { readonly oauthStateDigest: string },
): Promise<{ readonly id: string }> {
  return beginPlatformConnection(client, { ...input, platform: "facebook" });
}

export async function beginTikTokConnection(
  client: PrismaClient,
  input: Parameters<typeof beginYouTubeConnection>[1] & { readonly oauthStateDigest: string },
): Promise<{ readonly id: string }> {
  return beginPlatformConnection(client, { ...input, platform: "tiktok" });
}

export async function claimFacebookOAuthCallback(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly consentRecordId: string;
    readonly oauthStateDigest: string;
  },
): Promise<boolean> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    const claimed = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: "facebook",
        state: ChannelState.CONNECTING,
        consentRecordId: input.consentRecordId,
        oauthStateDigest: input.oauthStateDigest,
      },
      data: { oauthStateDigest: null },
    });
    return claimed.count === 1;
  });
}

export async function claimTikTokOAuthCallback(
  client: PrismaClient,
  input: Parameters<typeof claimFacebookOAuthCallback>[1],
): Promise<boolean> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    const claimed = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: "tiktok",
        state: ChannelState.CONNECTING,
        consentRecordId: input.consentRecordId,
        oauthStateDigest: input.oauthStateDigest,
      },
      data: { oauthStateDigest: null },
    });
    return claimed.count === 1;
  });
}

async function completePlatformConnection(
  client: PrismaClient,
  input: {
    readonly platform: Platform;
    readonly workspaceId: string;
    readonly channelId: string;
    readonly consentRecordId: string;
    readonly actorUserId: string;
    readonly authorizationSubjectReference?: string;
    readonly externalAccountId: string;
    readonly displayName: string;
    readonly grantedScopes: readonly string[];
    readonly tokenEnvelopeCiphertext: string;
    readonly tokenCiphertextReference: string;
    readonly correlationId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const now = new Date();
    const result = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: input.platform,
        state: ChannelState.CONNECTING,
        consentRecordId: input.consentRecordId,
        tokenEnvelopeCiphertext: null,
        tokenCiphertextReference: null,
      },
      data: {
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        authorizationSubjectReference: input.authorizationSubjectReference ?? null,
        state: ChannelState.CONNECTED,
        grantedScopes: [...input.grantedScopes],
        tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext,
        tokenCiphertextReference: input.tokenCiphertextReference,
        authorizedAt: now,
        refreshedAt: now,
        authorizedDataExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        deniedAt: null,
        disconnectRequestedAt: null,
        disconnectedAt: null,
        revokeFailureCategory: null,
      },
    });
    if (result.count !== 1) throw new Error("channel_not_found");
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "channel.connected",
      targetType: "channel",
      targetId: input.channelId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { platform: input.platform, grantedScopes: [...input.grantedScopes] },
    });
  });
}

export async function completeYouTubeConnection(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly consentRecordId: string;
    readonly actorUserId: string;
    readonly externalAccountId: string;
    readonly displayName: string;
    readonly grantedScopes: readonly string[];
    readonly tokenEnvelopeCiphertext: string;
    readonly tokenCiphertextReference: string;
    readonly correlationId: string;
  },
): Promise<void> {
  await completePlatformConnection(client, { ...input, platform: "youtube" });
}

export async function completeTikTokConnection(
  client: PrismaClient,
  input: Parameters<typeof completeYouTubeConnection>[1],
): Promise<void> {
  await completePlatformConnection(client, { ...input, platform: "tiktok" });
}

async function denyPlatformConnection(
  client: PrismaClient,
  input: {
    readonly platform: Platform;
    readonly workspaceId: string;
    readonly channelId: string;
    readonly consentRecordId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly reason:
      "provider_denied" | "invalid_callback" | "exchange_failed" | "initiation_failed";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const result = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: input.platform,
        state: ChannelState.CONNECTING,
        consentRecordId: input.consentRecordId,
      },
      data: { state: ChannelState.NOT_CONNECTED, deniedAt: new Date(), oauthStateDigest: null },
    });
    if (result.count !== 1) return;
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "channel.connection_denied",
      targetType: "channel",
      targetId: input.channelId,
      result: "denied",
      correlationId: input.correlationId,
      metadata: { platform: input.platform, reason: input.reason },
    });
  });
}

export async function denyYouTubeConnection(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly consentRecordId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly reason:
      "provider_denied" | "invalid_callback" | "exchange_failed" | "initiation_failed";
  },
): Promise<void> {
  await denyPlatformConnection(client, { ...input, platform: "youtube" });
}

export async function denyFacebookConnection(
  client: PrismaClient,
  input: Parameters<typeof denyYouTubeConnection>[1],
): Promise<void> {
  await denyPlatformConnection(client, { ...input, platform: "facebook" });
}

export async function denyTikTokConnection(
  client: PrismaClient,
  input: Parameters<typeof denyYouTubeConnection>[1],
): Promise<void> {
  await denyPlatformConnection(client, { ...input, platform: "tiktok" });
}

export async function createFacebookConnectionCandidate(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly actorUserId: string;
    readonly consentRecordId: string;
    readonly metaUserId: string;
    readonly metaUserDisplayName: string;
    readonly grantedScopes: readonly string[];
    readonly pageOptions: readonly { readonly id: string; readonly displayName: string }[];
    readonly tokenEnvelopeCiphertext: string;
    readonly tokenCiphertextReference: string;
    readonly expiresAt: Date;
  },
): Promise<{ readonly retiredKeyReference: string | null }> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    const channel = await transaction.channel.findFirst({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: "facebook",
        state: ChannelState.CONNECTING,
        consentRecordId: input.consentRecordId,
      },
      select: { id: true },
    });
    if (!channel) throw new Error("channel_not_found");
    const previous = await transaction.facebookConnectionCandidate.findUnique({
      where: { channelId: input.channelId },
      select: { tokenCiphertextReference: true },
    });
    await transaction.facebookConnectionCandidate.upsert({
      where: { channelId: input.channelId },
      create: {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        actorUserId: input.actorUserId,
        consentRecordId: input.consentRecordId,
        metaUserId: input.metaUserId,
        metaUserDisplayName: input.metaUserDisplayName,
        grantedScopes: [...input.grantedScopes],
        pageOptions: [...input.pageOptions],
        tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext,
        tokenCiphertextReference: input.tokenCiphertextReference,
        expiresAt: input.expiresAt,
      },
      update: {
        actorUserId: input.actorUserId,
        consentRecordId: input.consentRecordId,
        metaUserId: input.metaUserId,
        metaUserDisplayName: input.metaUserDisplayName,
        grantedScopes: [...input.grantedScopes],
        pageOptions: [...input.pageOptions],
        tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext,
        tokenCiphertextReference: input.tokenCiphertextReference,
        expiresAt: input.expiresAt,
      },
    });
    if (
      previous?.tokenCiphertextReference &&
      previous.tokenCiphertextReference !== input.tokenCiphertextReference
    ) {
      await enqueueTokenKeyRetirementCandidate(transaction, {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        keyReference: previous.tokenCiphertextReference,
      });
    }
    return { retiredKeyReference: previous?.tokenCiphertextReference ?? null };
  });
}

export interface FacebookConnectionCandidateView {
  readonly id: string;
  readonly channelId: string;
  readonly consentRecordId: string;
  readonly actorUserId: string;
  readonly metaUserId: string;
  readonly metaUserDisplayName: string;
  readonly grantedScopes: readonly string[];
  readonly pages: readonly { readonly id: string; readonly displayName: string }[];
  readonly tokenEnvelopeCiphertext: string;
  readonly tokenCiphertextReference: string;
  readonly expiresAt: Date;
}

export async function readFacebookConnectionCandidate(
  client: PrismaClient,
  workspaceId: string,
  actorUserId: string,
): Promise<FacebookConnectionCandidateView | null> {
  return withTenant(client, workspaceId, async (transaction) => {
    const candidate = await transaction.facebookConnectionCandidate.findFirst({
      where: { workspaceId, actorUserId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!candidate || !Array.isArray(candidate.pageOptions)) return null;
    const pages = candidate.pageOptions.flatMap((entry) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        Array.isArray(entry) ||
        !("id" in entry) ||
        !("displayName" in entry) ||
        typeof entry.id !== "string" ||
        typeof entry.displayName !== "string"
      ) {
        return [];
      }
      return [{ id: entry.id, displayName: entry.displayName }];
    });
    return {
      id: candidate.id,
      channelId: candidate.channelId,
      consentRecordId: candidate.consentRecordId,
      actorUserId: candidate.actorUserId,
      metaUserId: candidate.metaUserId,
      metaUserDisplayName: candidate.metaUserDisplayName,
      grantedScopes: candidate.grantedScopes,
      pages,
      tokenEnvelopeCiphertext: candidate.tokenEnvelopeCiphertext,
      tokenCiphertextReference: candidate.tokenCiphertextReference,
      expiresAt: candidate.expiresAt,
    };
  });
}

export async function completeFacebookConnection(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly candidateId: string;
    readonly channelId: string;
    readonly consentRecordId: string;
    readonly actorUserId: string;
    readonly metaUserId: string;
    readonly pageId: string;
    readonly pageDisplayName: string;
    readonly grantedScopes: readonly string[];
    readonly tokenEnvelopeCiphertext: string;
    readonly tokenCiphertextReference: string;
    readonly correlationId: string;
  },
): Promise<{ readonly retiredKeyReference: string }> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    const candidate = await transaction.facebookConnectionCandidate.findFirst({
      where: {
        id: input.candidateId,
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        actorUserId: input.actorUserId,
        consentRecordId: input.consentRecordId,
        expiresAt: { gt: new Date() },
      },
    });
    if (!candidate) throw new Error("facebook_page_selection_expired");
    const pageOptions = Array.isArray(candidate.pageOptions) ? candidate.pageOptions : [];
    const selectedPage = pageOptions.find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        "id" in entry &&
        "displayName" in entry &&
        entry.id === input.pageId &&
        entry.displayName === input.pageDisplayName,
    );
    const candidateScopes = [...candidate.grantedScopes].sort();
    const selectedScopes = [...input.grantedScopes].sort();
    if (
      !selectedPage ||
      candidate.metaUserId !== input.metaUserId ||
      candidateScopes.length !== selectedScopes.length ||
      candidateScopes.some((scope, index) => scope !== selectedScopes[index])
    ) {
      throw new Error("facebook_page_selection_not_authorized");
    }
    const now = new Date();
    const updated = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        platform: "facebook",
        state: ChannelState.CONNECTING,
        consentRecordId: input.consentRecordId,
        tokenEnvelopeCiphertext: null,
        tokenCiphertextReference: null,
      },
      data: {
        externalAccountId: input.pageId,
        displayName: input.pageDisplayName,
        authorizationSubjectReference: input.metaUserId,
        oauthStateDigest: null,
        state: ChannelState.CONNECTED,
        grantedScopes: [...input.grantedScopes],
        tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext,
        tokenCiphertextReference: input.tokenCiphertextReference,
        authorizedAt: now,
        refreshedAt: now,
        authorizedDataExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        deniedAt: null,
        disconnectRequestedAt: null,
        disconnectedAt: null,
        revokeFailureCategory: null,
      },
    });
    if (updated.count !== 1) throw new Error("channel_not_found");
    await enqueueTokenKeyRetirementCandidate(transaction, {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      keyReference: candidate.tokenCiphertextReference,
    });
    await transaction.facebookConnectionCandidate.delete({ where: { id: candidate.id } });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "channel.connected",
      targetType: "channel",
      targetId: input.channelId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { platform: "facebook", grantedScopes: [...input.grantedScopes] },
    });
    return { retiredKeyReference: candidate.tokenCiphertextReference };
  });
}

export async function createSession(
  client: PrismaClient,
  input: { readonly userId: string; readonly secret: string; readonly lifetimeSeconds?: number },
): Promise<{ readonly id: string; readonly token: string; readonly expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (input.lifetimeSeconds ?? 60 * 60 * 8) * 1000);
  const session = await client.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: input.userId },
      select: { lifecycleState: true },
    });
    if (user?.lifecycleState !== "active") throw new Error("account_inactive");
    return transaction.session.create({
      data: { userId: input.userId, tokenHash: sessionHash(token, input.secret), expiresAt },
      select: { id: true },
    });
  });
  return { id: session.id, token, expiresAt };
}

export async function readSession(
  client: PrismaClient,
  token: string,
  secret: string,
): Promise<SessionView | null> {
  const session = await client.session.findUnique({
    where: { tokenHash: sessionHash(token, secret) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || session.user.lifecycleState !== "active")
    return null;
  return {
    id: session.id,
    user: {
      id: session.user.id,
      subject: session.user.cognitoSubject,
      email: session.user.email,
      name: session.user.name,
      locale: dbToLocale[session.user.localePreference],
    },
    currentWorkspaceId: session.currentWorkspaceId,
    expiresAt: session.expiresAt,
  };
}

export async function deleteSession(
  client: PrismaClient,
  token: string,
  secret: string,
): Promise<void> {
  await client.session.deleteMany({ where: { tokenHash: sessionHash(token, secret) } });
}

export async function updateLocalePreference(
  client: PrismaClient,
  userId: string,
  locale: Locale,
): Promise<void> {
  await client.user.update({
    where: { id: userId },
    data: { localePreference: localeToDb[locale] },
  });
}

export async function createWorkspace(
  client: PrismaClient,
  input: {
    readonly name: string;
    readonly userId: string;
    readonly sessionId: string;
    readonly correlationId: string;
  },
): Promise<{ readonly id: string }> {
  const workspaceId = randomUUID();
  return withTenant(client, workspaceId, async (transaction) => {
    await setUserContext(transaction, input.userId);
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 8))`;
    const workspace = await transaction.workspace.create({
      data: { id: workspaceId, name: input.name.trim(), createdByUserId: input.userId },
      select: { id: true },
    });
    await transaction.membership.create({
      data: { workspaceId, userId: input.userId, role: DbRole.OWNER_ADMIN },
    });
    await transaction.session.update({
      where: { id: input.sessionId },
      data: { currentWorkspaceId: workspaceId },
    });
    await transaction.user.update({
      where: { id: input.userId },
      data: { lastWorkspaceId: workspaceId },
    });
    const identityEvidence = await transaction.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: {
        createdAt: true,
        consents: {
          orderBy: { acceptedAt: "desc" },
          take: 1,
          select: { id: true, acceptedAt: true },
        },
      },
    });
    await appendAudit(transaction, {
      workspaceId,
      actorUserId: input.userId,
      action: "identity.registered",
      targetType: "user",
      targetId: input.userId,
      result: "success",
      correlationId: input.correlationId,
      occurredAt: identityEvidence.createdAt,
    });
    const consent = identityEvidence.consents[0];
    if (consent) {
      await appendAudit(transaction, {
        workspaceId,
        actorUserId: input.userId,
        action: "consent.accepted",
        targetType: "consent",
        targetId: consent.id,
        result: "success",
        correlationId: input.correlationId,
        occurredAt: consent.acceptedAt,
      });
    }
    await appendAudit(transaction, {
      workspaceId,
      actorUserId: input.userId,
      action: "workspace.created",
      targetType: "workspace",
      targetId: workspaceId,
      result: "success",
      correlationId: input.correlationId,
    });
    return workspace;
  });
}

export async function listUserWorkspaces(
  client: PrismaClient,
  userId: string,
): Promise<readonly { readonly id: string; readonly name: string; readonly role: Role }[]> {
  const memberships = await client.$transaction(async (transaction) => {
    await setUserContext(transaction, userId);
    return transaction.membership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { workspaceId: true, role: true },
    });
  });
  const results = [];
  for (const membership of memberships) {
    const workspace = await withTenant(client, membership.workspaceId, (transaction) =>
      transaction.workspace.findUnique({
        where: { id: membership.workspaceId },
        select: { id: true, name: true, lifecycleState: true },
      }),
    );
    if (workspace?.lifecycleState === WorkspaceLifecycleState.ACTIVE) {
      results.push({ id: workspace.id, name: workspace.name, role: dbToRole[membership.role] });
    }
  }
  return results;
}

export async function getMembershipRole(
  client: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<Role | undefined> {
  const membership = await withTenant(client, workspaceId, async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { lifecycleState: true },
    });
    if (user?.lifecycleState !== "active") return null;
    const workspace = await transaction.workspace.findUnique({
      where: { id: workspaceId },
      select: { lifecycleState: true },
    });
    if (workspace?.lifecycleState !== WorkspaceLifecycleState.ACTIVE) return null;
    return transaction.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    });
  });
  return membership?.status === MembershipStatus.ACTIVE ? dbToRole[membership.role] : undefined;
}

export async function selectWorkspace(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly sessionId: string;
    readonly correlationId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const membership = await transaction.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE)
      throw new Error("membership_not_found");
    await transaction.session.update({
      where: { id: input.sessionId },
      data: { currentWorkspaceId: input.workspaceId },
    });
    await transaction.user.update({
      where: { id: input.userId },
      data: { lastWorkspaceId: input.workspaceId },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      action: "workspace.selected",
      targetType: "workspace",
      targetId: input.workspaceId,
      result: "success",
      correlationId: input.correlationId,
    });
  });
}

export async function createInvitation(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly email: string;
    readonly role: Role;
    readonly correlationId: string;
  },
): Promise<{ readonly id: string; readonly token: string; readonly expiresAt: Date }> {
  const secret = randomBytes(24).toString("base64url");
  const token = `${input.workspaceId}.${secret}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return withTenant(client, input.workspaceId, async (transaction) => {
    const invitation = await transaction.invitation.create({
      data: {
        workspaceId: input.workspaceId,
        email: normalizeEmail(input.email),
        tokenHash: invitationHash(secret),
        role: roleToDb[input.role],
        invitedByUserId: input.actorUserId,
        expiresAt,
      },
      select: { id: true },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: "member.invited",
      targetType: "invitation",
      targetId: invitation.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { role: input.role },
    });
    return { ...invitation, token, expiresAt };
  });
}

export async function acceptInvitation(
  client: PrismaClient,
  input: {
    readonly token: string;
    readonly userId: string;
    readonly email: string;
    readonly sessionId: string;
    readonly correlationId: string;
  },
): Promise<{ readonly workspaceId: string }> {
  const [workspaceId, secret, extra] = input.token.split(".");
  if (!workspaceId || !secret || extra) throw new Error("invalid_invitation");
  return withTenant(client, workspaceId, async (transaction) => {
    const invitation = await transaction.invitation.findFirst({
      where: { workspaceId, tokenHash: invitationHash(secret) },
    });
    if (
      !invitation ||
      invitation.status !== InvitationStatus.PENDING ||
      invitation.expiresAt <= new Date() ||
      invitation.email !== normalizeEmail(input.email)
    ) {
      throw new Error("invalid_invitation");
    }
    const claimed = await transaction.invitation.updateMany({
      where: {
        id: invitation.id,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      data: { status: InvitationStatus.ACCEPTED },
    });
    if (claimed.count !== 1) throw new Error("invalid_invitation");
    await transaction.membership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: input.userId } },
      create: { workspaceId, userId: input.userId, role: invitation.role },
      update: { role: invitation.role, status: MembershipStatus.ACTIVE },
    });
    await transaction.session.update({
      where: { id: input.sessionId },
      data: { currentWorkspaceId: workspaceId },
    });
    await transaction.user.update({
      where: { id: input.userId },
      data: { lastWorkspaceId: workspaceId },
    });
    await appendAudit(transaction, {
      workspaceId,
      actorUserId: input.userId,
      action: "member.joined",
      targetType: "membership",
      targetId: input.userId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { role: dbToRole[invitation.role] },
    });
    return { workspaceId };
  });
}

export async function listMembers(
  client: PrismaClient,
  workspaceId: string,
): Promise<
  readonly {
    readonly id: string;
    readonly userId: string;
    readonly name: string;
    readonly email: string;
    readonly role: Role;
  }[]
> {
  const memberships = await withTenant(client, workspaceId, (transaction) =>
    transaction.membership.findMany({
      where: { workspaceId, status: MembershipStatus.ACTIVE },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    }),
  );
  return memberships.map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    name: entry.user.name,
    email: entry.user.email,
    role: dbToRole[entry.role],
  }));
}

export async function listPendingInvitations(
  client: PrismaClient,
  workspaceId: string,
): Promise<
  readonly {
    readonly id: string;
    readonly email: string;
    readonly role: Role;
    readonly expiresAt: Date;
  }[]
> {
  const invitations = await withTenant(client, workspaceId, (transaction) =>
    transaction.invitation.findMany({
      where: {
        workspaceId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  return invitations.map((entry) => ({
    id: entry.id,
    email: entry.email,
    role: dbToRole[entry.role],
    expiresAt: entry.expiresAt,
  }));
}

export async function changeMemberRole(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly membershipId: string;
    readonly role: Role;
    readonly correlationId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const membership = await transaction.membership.findUnique({
      where: { id: input.membershipId },
    });
    if (
      !membership ||
      membership.workspaceId !== input.workspaceId ||
      membership.status !== MembershipStatus.ACTIVE
    ) {
      throw new Error("membership_not_found");
    }
    if (membership.role === DbRole.OWNER_ADMIN && input.role !== "owner_admin") {
      await lockOwnerInvariant(transaction, input.workspaceId);
      const ownerCount = await countEligibleOwners(transaction, input.workspaceId);
      if (ownerCount <= 1) throw new Error("last_owner");
    }
    await transaction.membership.update({
      where: { id: membership.id },
      data: { role: roleToDb[input.role] },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "member.role_changed",
      targetType: "membership",
      targetId: membership.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { role: input.role },
    });
  });
}

export async function removeMember(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly membershipId: string;
    readonly correlationId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const membership = await transaction.membership.findUnique({
      where: { id: input.membershipId },
    });
    if (
      !membership ||
      membership.workspaceId !== input.workspaceId ||
      membership.status !== MembershipStatus.ACTIVE
    ) {
      throw new Error("membership_not_found");
    }
    if (membership.role === DbRole.OWNER_ADMIN) {
      await lockOwnerInvariant(transaction, input.workspaceId);
      const ownerCount = await countEligibleOwners(transaction, input.workspaceId);
      if (ownerCount <= 1) throw new Error("last_owner");
    }
    await transaction.membership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.REMOVED },
    });
    await setUserContext(transaction, membership.userId);
    const fallbackMembership = await transaction.membership.findFirst({
      where: {
        userId: membership.userId,
        status: MembershipStatus.ACTIVE,
        workspaceId: { not: input.workspaceId },
      },
      orderBy: { joinedAt: "desc" },
      select: { workspaceId: true },
    });
    const fallbackWorkspaceId = fallbackMembership?.workspaceId ?? null;
    await transaction.session.updateMany({
      where: { userId: membership.userId, currentWorkspaceId: input.workspaceId },
      data: { currentWorkspaceId: fallbackWorkspaceId },
    });
    await transaction.user.updateMany({
      where: { id: membership.userId, lastWorkspaceId: input.workspaceId },
      data: { lastWorkspaceId: fallbackWorkspaceId ?? input.workspaceId },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "member.removed",
      targetType: "membership",
      targetId: membership.id,
      result: "success",
      correlationId: input.correlationId,
    });
  });
}

export async function appendAudit(
  transaction: Transaction,
  input: {
    readonly workspaceId: string;
    readonly actorUserId?: string;
    readonly action: AuditAction;
    readonly targetType: string;
    readonly targetId: string;
    readonly result: AuditResult;
    readonly correlationId: string;
    readonly metadata?: Prisma.InputJsonObject;
    readonly occurredAt?: Date;
  },
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      occurredAt: input.occurredAt ?? new Date(),
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorUserId ? "user" : "system",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      result: input.result,
      correlationId: input.correlationId,
      metadata: input.metadata ?? {},
    },
  });
}

export async function recordAudit(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly actorUserId?: string;
    readonly action: AuditAction;
    readonly targetType: string;
    readonly targetId: string;
    readonly result: AuditResult;
    readonly correlationId: string;
    readonly metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, (transaction) => appendAudit(transaction, input));
}

export async function recordUserScopedAudit(
  client: PrismaClient,
  input: {
    readonly userId: string;
    readonly currentWorkspaceId?: string | null;
    readonly action: Extract<AuditAction, "identity.login" | "identity.logout" | "locale.changed">;
    readonly targetType: "session" | "user";
    readonly targetId: string;
    readonly result: AuditResult;
    readonly correlationId: string;
    readonly metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await client.$transaction(async (transaction) => {
    await setUserContext(transaction, input.userId);
    await transaction.$executeRaw`
      SELECT record_account_audit_event(
        ${input.userId}::uuid,
        ${input.action},
        ${input.targetType},
        ${input.targetId},
        ${input.result},
        ${input.correlationId}::uuid,
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `;
  });
}

export async function recordAuthorizationDenied(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly permission: string;
    readonly reason: string;
    readonly correlationId: string;
  },
): Promise<void> {
  await recordAudit(client, {
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    action: "authorization.denied",
    targetType: "permission",
    targetId: input.permission,
    result: "denied",
    correlationId: input.correlationId,
    metadata: { permission: input.permission, reason: input.reason },
  });
}
