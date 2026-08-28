import { createHash, randomBytes } from "node:crypto";

import {
  ChannelState,
  DataDeletionState,
  LifecycleOperationKind,
  LifecycleOperationState,
  LifecycleStepState,
  MembershipStatus,
  OutboxState,
  Platform,
  PlatformExecutionState,
  WorkspaceLifecycleState,
  type Prisma,
  type PrismaClient,
} from "./generated/client.js";
import { appendAudit, withTenant } from "./repository.js";

export const revocationDeletionDeadlineMs = 7 * 24 * 60 * 60 * 1000;

export interface LifecycleClaimGuard {
  readonly operationId: string;
  readonly workerId: string;
  readonly claimGeneration: bigint;
}

const lifecycleKindDatabaseValue: Readonly<Record<LifecycleOperationKind, string>> = {
  [LifecycleOperationKind.CHANNEL_DISCONNECT]: "channel_disconnect",
  [LifecycleOperationKind.WORKSPACE_DATA_DELETION]: "workspace_data_deletion",
  [LifecycleOperationKind.ACCOUNT_DELETION]: "account_deletion",
  [LifecycleOperationKind.AUTHORIZED_DATA_RETENTION]: "authorized_data_retention",
  [LifecycleOperationKind.RETENTION_PURGE]: "retention_purge",
  [LifecycleOperationKind.TOKEN_KEY_RETIREMENT]: "token_key_retirement",
};

const lifecycleRetentionMs = 365 * 24 * 60 * 60 * 1000;

type AuthorizedPlatform = "youtube" | "facebook" | "tiktok";

function authorizedPlatform(value: string): AuthorizedPlatform {
  if (value === "youtube" || value === "facebook" || value === "tiktok") return value;
  throw new Error("unsupported_channel_platform");
}

function authorizedPlatformEnum(platform: AuthorizedPlatform): Platform {
  return platform === "youtube"
    ? Platform.YOUTUBE
    : platform === "facebook"
      ? Platform.FACEBOOK
      : Platform.TIKTOK;
}

function disconnectedDisplayName(platform: AuthorizedPlatform): string {
  return platform === "youtube"
    ? "Disconnected YouTube channel"
    : platform === "facebook"
      ? "Disconnected Facebook Page"
      : "Disconnected TikTok account";
}

function expiredDisplayName(platform: AuthorizedPlatform): string {
  return platform === "youtube"
    ? "Expired YouTube authorization"
    : platform === "facebook"
      ? "Expired Facebook Page authorization"
      : "Expired TikTok authorization";
}

interface LifecycleClock {
  readonly now: Date;
  readonly deletionDeadline: Date;
  readonly retentionExpiry: Date;
}

async function readLifecycleClock(
  transaction: Prisma.TransactionClient,
  override?: Date,
): Promise<LifecycleClock> {
  if (override) {
    return {
      now: override,
      deletionDeadline: new Date(override.getTime() + revocationDeletionDeadlineMs),
      retentionExpiry: new Date(override.getTime() + lifecycleRetentionMs),
    };
  }
  const rows = await transaction.$queryRaw<
    { now: Date; deletion_deadline: Date; retention_expiry: Date }[]
  >`
    SELECT
      CURRENT_TIMESTAMP AS now,
      CURRENT_TIMESTAMP + INTERVAL '7 days' AS deletion_deadline,
      CURRENT_TIMESTAMP + INTERVAL '365 days' AS retention_expiry
  `;
  const clock = rows[0];
  if (!clock) throw new Error("database_clock_unavailable");
  return {
    now: clock.now,
    deletionDeadline: clock.deletion_deadline,
    retentionExpiry: clock.retention_expiry,
  };
}

async function channelLeaseIsActive(
  transaction: Prisma.TransactionClient,
  channelId: string,
  override?: Date,
): Promise<boolean> {
  if (override) {
    const channel = await transaction.channel.findUnique({
      where: { id: channelId },
      select: { operationLeaseId: true, operationLeaseUntil: true },
    });
    return Boolean(
      channel?.operationLeaseId &&
      channel.operationLeaseUntil &&
      channel.operationLeaseUntil > override,
    );
  }
  const rows = await transaction.$queryRaw<{ active: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "channels"
      WHERE "id" = ${channelId}::uuid
        AND "operation_lease_id" IS NOT NULL
        AND "operation_lease_until" > CURRENT_TIMESTAMP
    ) AS active
  `;
  return rows[0]?.active ?? false;
}

export async function enqueueTokenKeyRetirement(
  transaction: Prisma.TransactionClient,
  input: {
    readonly workspaceId: string;
    readonly channelId?: string;
    readonly subjectUserId?: string | null;
    readonly keyReference: string | null;
    readonly correlationId: string;
    readonly deadlineAt?: Date;
    readonly now?: Date;
  },
): Promise<void> {
  if (!input.keyReference) return;
  const clock = await readLifecycleClock(transaction, input.now);
  const keyHash = createHash("sha256").update(input.keyReference).digest("hex");
  const dedupeKey = `token_key_retirement:${keyHash}`;
  const deadlineAt = input.deadlineAt ?? clock.deletionDeadline;
  await transaction.lifecycleOperation.createMany({
    data: [
      {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        workspaceId: input.workspaceId,
        ...(input.channelId ? { channelId: input.channelId } : {}),
        ...(input.subjectUserId ? { subjectUserId: input.subjectUserId } : {}),
        dedupeKey,
        requestReference: `KEY-${randomBytes(14).toString("hex").toUpperCase()}`,
        correlationId: input.correlationId,
        requestedAt: clock.now,
        deadlineAt,
        nextAttemptAt: clock.now,
        retentionExpiresAt: clock.retentionExpiry,
        outcome: { key_reference: input.keyReference },
      },
    ],
    skipDuplicates: true,
  });
  const existing = await transaction.lifecycleOperation.findUniqueOrThrow({
    where: { dedupeKey },
    select: {
      state: true,
      subjectUserId: true,
      deadlineAt: true,
      nextAttemptAt: true,
    },
  });
  if (existing.state !== LifecycleOperationState.COMPLETED) {
    await transaction.lifecycleOperation.update({
      where: { dedupeKey },
      data: {
        ...(existing.subjectUserId || !input.subjectUserId
          ? {}
          : { subjectUserId: input.subjectUserId }),
        ...(existing.deadlineAt <= deadlineAt ? {} : { deadlineAt }),
        ...(existing.nextAttemptAt <= clock.now ? {} : { nextAttemptAt: clock.now }),
      },
    });
  }
}

async function tokenKeyRetirementPending(
  transaction: Prisma.TransactionClient,
  input: {
    readonly workspaceId: string;
    readonly channelId?: string;
  },
): Promise<boolean> {
  const pending = await transaction.lifecycleOperation.findFirst({
    where: {
      kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
      workspaceId: input.workspaceId,
      ...(input.channelId ? { channelId: input.channelId } : {}),
      state: { not: LifecycleOperationState.COMPLETED },
    },
    select: { id: true },
  });
  return Boolean(pending);
}

function deletionRequesterReference(userId: string): string {
  return (
    createHash("md5").update(`deletion-requester:${userId}`).digest("hex") +
    createHash("md5").update(`deletion-requester:v2:${userId}`).digest("hex")
  );
}

async function assertLifecycleClaim(
  transaction: Prisma.TransactionClient,
  guard: LifecycleClaimGuard,
  expected: {
    readonly kind: LifecycleOperationKind;
    readonly workspaceId: string;
    readonly channelId?: string;
  },
): Promise<void> {
  const expectedKind = lifecycleKindDatabaseValue[expected.kind];
  const rows = await transaction.$queryRaw<{ valid: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM lifecycle_operations
      WHERE current_user = 'jingtang_worker'
        AND id = ${guard.operationId}::uuid
        AND state = 'claimed'::lifecycle_operation_state
        AND claimed_by = ${guard.workerId}
        AND claim_generation = ${guard.claimGeneration}
        AND claimed_until > CURRENT_TIMESTAMP
        AND kind = ${expectedKind}::lifecycle_operation_kind
        AND workspace_id = ${expected.workspaceId}::uuid
        AND channel_id IS NOT DISTINCT FROM ${expected.channelId ?? null}::uuid
    ) AS valid
  `;
  if (!rows[0]?.valid) throw new Error("lifecycle_claim_lost");
}

function pseudonymizeAuthorizedDataSnapshot(
  value: Prisma.JsonValue,
  targetAccountReference: string,
  replacementAccountReference: string,
): Prisma.InputJsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      pseudonymizeAuthorizedDataSnapshot(
        entry,
        targetAccountReference,
        replacementAccountReference,
      ),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (entry === undefined) return [key, null];
        return [
          key,
          key === "account_reference" && entry === targetAccountReference
            ? replacementAccountReference
            : pseudonymizeAuthorizedDataSnapshot(
                entry,
                targetAccountReference,
                replacementAccountReference,
              ),
        ];
      }),
    );
  }
  return value as Prisma.InputJsonValue;
}

export async function pseudonymizePlatformAuthorizedData(
  transaction: Prisma.TransactionClient,
  input: {
    readonly platform: AuthorizedPlatform;
    readonly workspaceId: string;
    readonly channelId: string;
    readonly accountReference: string;
    readonly replacementAccountReference: string;
    readonly replacementDisplayName: string;
  },
): Promise<readonly string[]> {
  const versions = await transaction.platformVersion.findMany({
    where: {
      workspaceId: input.workspaceId,
      platform: authorizedPlatformEnum(input.platform),
      accountReference: input.accountReference,
    },
    select: { id: true },
  });
  const versionIds = versions.map((entry) => entry.id);
  const executions = versionIds.length
    ? await transaction.platformExecution.findMany({
        where: { workspaceId: input.workspaceId, platformVersionId: { in: versionIds } },
        select: { id: true },
      })
    : [];
  if (versionIds.length) {
    await transaction.platformExecution.updateMany({
      where: { workspaceId: input.workspaceId, platformVersionId: { in: versionIds } },
      data: { providerId: null, providerUrl: null },
    });
    await transaction.$executeRaw`SELECT pseudonymize_platform_versions(
      ${input.workspaceId}::uuid,
      ${input.channelId}::uuid,
      ${input.platform}::platform,
      ${input.accountReference}::text,
      ${input.replacementAccountReference}::text,
      ${input.replacementDisplayName}::text
    )`;
  }
  const intents = await transaction.publishingIntent.findMany({
    where: {
      workspaceId: input.workspaceId,
      accountReferences: { has: input.accountReference },
    },
    select: { id: true, accountReferences: true, payloadSnapshot: true },
  });
  for (const intent of intents) {
    const payloadSnapshot = pseudonymizeAuthorizedDataSnapshot(
      intent.payloadSnapshot,
      input.accountReference,
      input.replacementAccountReference,
    );
    await transaction.publishingIntent.update({
      where: { id: intent.id },
      data: {
        accountReferences: intent.accountReferences.map((entry) =>
          entry === input.accountReference ? input.replacementAccountReference : entry,
        ),
        payloadSnapshot,
        payloadHash: createHash("sha256").update(JSON.stringify(payloadSnapshot)).digest("hex"),
      },
    });
  }
  return [
    input.channelId,
    ...executions.map((entry) => entry.id),
    ...intents.map((entry) => entry.id),
  ];
}

export async function pseudonymizeYouTubeAuthorizedData(
  transaction: Prisma.TransactionClient,
  input: Omit<Parameters<typeof pseudonymizePlatformAuthorizedData>[1], "platform">,
): Promise<readonly string[]> {
  return pseudonymizePlatformAuthorizedData(transaction, { ...input, platform: "youtube" });
}

async function terminalizeDisconnectedYouTubeExecutions(
  transaction: Prisma.TransactionClient,
  input: {
    readonly workspaceId: string;
    readonly accountReference: string;
    readonly actorUserId?: string;
    readonly correlationId: string;
    readonly now: Date;
    readonly platform?: AuthorizedPlatform;
  },
): Promise<void> {
  const versions = await transaction.platformVersion.findMany({
    where: {
      workspaceId: input.workspaceId,
      platform: authorizedPlatformEnum(input.platform ?? "youtube"),
      accountReference: input.accountReference,
    },
    select: { id: true },
  });
  if (versions.length === 0) return;
  const executions = await transaction.platformExecution.findMany({
    where: {
      workspaceId: input.workspaceId,
      platformVersionId: { in: versions.map((entry) => entry.id) },
      state: { in: [PlatformExecutionState.PUBLISHING, PlatformExecutionState.PROCESSING] },
    },
    select: { id: true, state: true },
  });
  if (executions.length === 0) return;
  const publishingIds = executions
    .filter((entry) => entry.state === PlatformExecutionState.PUBLISHING)
    .map((entry) => entry.id);
  const processingIds = executions
    .filter((entry) => entry.state === PlatformExecutionState.PROCESSING)
    .map((entry) => entry.id);
  if (publishingIds.length) {
    await transaction.platformExecution.updateMany({
      where: { id: { in: publishingIds } },
      data: {
        state: PlatformExecutionState.CANCELLED,
        failureCategory: "channel_disconnected",
      },
    });
  }
  if (processingIds.length) {
    await transaction.platformExecution.updateMany({
      where: { id: { in: processingIds } },
      data: {
        state: PlatformExecutionState.NEEDS_ATTENTION,
        failureCategory: "channel_disconnected_during_processing",
      },
    });
  }
  await transaction.outboxMessage.updateMany({
    where: {
      platformExecutionId: { in: executions.map((entry) => entry.id) },
      state: { notIn: [OutboxState.COMPLETED, OutboxState.DEAD] },
    },
    data: {
      state: OutboxState.DEAD,
      failureCategory: "channel_disconnected",
      completedAt: input.now,
      claimedAt: null,
      claimOwner: null,
      claimUntil: null,
    },
  });
  for (const execution of executions) {
    const processing = execution.state === PlatformExecutionState.PROCESSING;
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: processing ? "platform.publish_failed" : "platform.publish_cancelled",
      targetType: "platform_execution",
      targetId: execution.id,
      result: processing ? "failed" : "success",
      correlationId: input.correlationId,
      metadata: {
        platform: input.platform ?? "youtube",
        reason: processing ? "channel_disconnected_during_processing" : "channel_disconnected",
      },
    });
  }
}

export interface DisconnectPreparation {
  readonly channelId: string;
  readonly operationId: string | null;
  readonly requestReference: string | null;
  readonly tokenEnvelopeCiphertext: string | null;
  readonly alreadyDisconnected: boolean;
  readonly revocationDeferred: boolean;
}

export async function prepareYouTubeDisconnect(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly now?: Date;
    readonly deadlineAt?: Date;
    readonly platform?: AuthorizedPlatform;
  },
): Promise<DisconnectPreparation> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    const channel = await transaction.channel.findFirst({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        ...(input.platform ? { platform: input.platform } : {}),
      },
    });
    if (!channel) throw new Error("channel_not_found");
    const platform = authorizedPlatform(channel.platform);
    if (channel.state === ChannelState.DISCONNECTED) {
      return {
        channelId: channel.id,
        operationId: null,
        requestReference: null,
        tokenEnvelopeCiphertext: null,
        alreadyDisconnected: true,
        revocationDeferred: false,
      };
    }
    if (
      channel.state !== ChannelState.NOT_CONNECTED &&
      channel.state !== ChannelState.CONNECTING &&
      channel.state !== ChannelState.CONNECTED &&
      channel.state !== ChannelState.REAUTHORIZATION_REQUIRED &&
      channel.state !== ChannelState.DISCONNECTING
    ) {
      throw new Error("channel_not_disconnectable");
    }
    const clock = await readLifecycleClock(transaction, input.now);
    const now = clock.now;
    let operation = await transaction.lifecycleOperation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        channelId: channel.id,
        kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
        state: {
          in: [
            LifecycleOperationState.PENDING,
            LifecycleOperationState.CLAIMED,
            LifecycleOperationState.RETRY,
          ],
        },
      },
      orderBy: { requestedAt: "desc" },
    });
    if (
      channel.state === ChannelState.DISCONNECTING &&
      operation?.state === LifecycleOperationState.RETRY
    ) {
      const retried = await transaction.$queryRaw<{ retried: boolean }[]>`
        SELECT retry_channel_disconnect(
          ${input.workspaceId}::uuid,
          ${channel.id}::uuid
        ) AS retried
      `;
      if (retried[0]?.retried) {
        operation = await transaction.lifecycleOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
      }
    }
    if (channel.state !== ChannelState.DISCONNECTING) {
      const denied = await transaction.channel.update({
        where: { id: channel.id },
        data: {
          state: ChannelState.DISCONNECTING,
          deniedAt: now,
          disconnectRequestedAt: now,
          revokeFailureCategory: null,
          revokeAttemptCount: 0,
          operationGeneration: { increment: 1 },
        },
      });
      operation = await transaction.lifecycleOperation.create({
        data: {
          kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
          workspaceId: input.workspaceId,
          channelId: channel.id,
          actorUserId: input.actorUserId,
          dedupeKey: `channel_disconnect:${channel.id}:${String(denied.operationGeneration)}`,
          requestReference: `CHD-${randomBytes(8).toString("hex").toUpperCase()}`,
          correlationId: input.correlationId,
          requestedAt: now,
          deadlineAt: input.deadlineAt ?? clock.deletionDeadline,
          nextAttemptAt: now,
          retentionExpiresAt: clock.retentionExpiry,
        },
      });
      const versions = await transaction.platformVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          platform: authorizedPlatformEnum(platform),
          accountReference: channel.externalAccountId ?? "__none__",
        },
        select: { id: true },
      });
      const versionIds = versions.map((entry) => entry.id);
      if (versionIds.length) {
        const executions = await transaction.platformExecution.findMany({
          where: {
            workspaceId: input.workspaceId,
            platformVersionId: { in: versionIds },
            state: PlatformExecutionState.NOT_STARTED,
            providerId: null,
          },
          select: { id: true },
        });
        const executionIds = executions.map((entry) => entry.id);
        if (executionIds.length) {
          await transaction.platformExecution.updateMany({
            where: { id: { in: executionIds } },
            data: {
              state: PlatformExecutionState.CANCELLED,
              failureCategory: "channel_disconnected",
            },
          });
          await transaction.outboxMessage.updateMany({
            where: { platformExecutionId: { in: executionIds } },
            data: {
              state: OutboxState.DEAD,
              failureCategory: "channel_disconnected",
              completedAt: now,
              claimedAt: null,
              claimOwner: null,
              claimUntil: null,
            },
          });
          for (const executionId of executionIds) {
            await appendAudit(transaction, {
              workspaceId: input.workspaceId,
              actorUserId: input.actorUserId,
              action: "platform.publish_cancelled",
              targetType: "platform_execution",
              targetId: executionId,
              result: "success",
              correlationId: input.correlationId,
              metadata: { reason: "channel_disconnect" },
            });
          }
        }
      }
      await appendAudit(transaction, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "channel.disconnect_started",
        targetType: "channel",
        targetId: channel.id,
        result: "success",
        correlationId: input.correlationId,
        metadata: { platform },
      });
    }
    const revocationDeferred = await channelLeaseIsActive(transaction, channel.id, input.now);
    return {
      channelId: channel.id,
      operationId: operation?.id ?? null,
      requestReference: operation?.requestReference ?? null,
      tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
      alreadyDisconnected: false,
      revocationDeferred,
    };
  });
}

export async function failYouTubeDisconnect(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly actorUserId?: string;
    readonly correlationId: string;
    readonly failureCategory: string;
    readonly now?: Date;
    readonly lifecycleClaim: LifecycleClaimGuard;
    readonly platform?: AuthorizedPlatform;
  },
): Promise<boolean> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    });
    const channel = await transaction.channel.findFirst({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        ...(input.platform ? { platform: input.platform } : {}),
      },
      select: { platform: true },
    });
    if (!channel) return false;
    const platform = authorizedPlatform(channel.platform);
    const result = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        state: ChannelState.DISCONNECTING,
      },
      data: {
        revokeFailureCategory: input.failureCategory,
        revokeAttemptCount: { increment: 1 },
        ...(input.now ? { updatedAt: input.now } : {}),
      },
    });
    if (result.count !== 1) return false;
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: "channel.disconnect_failed",
      targetType: "channel",
      targetId: input.channelId,
      result: "failed",
      correlationId: input.correlationId,
      metadata: { platform, failure_category: input.failureCategory },
    });
    return true;
  });
}

export async function completeYouTubeDisconnect(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly actorUserId?: string;
    readonly correlationId: string;
    readonly deadlineAt?: Date;
    readonly now?: Date;
    readonly revocationOutcome?:
      "provider_revoked" | "provider_revoke_failed_local_erased" | "local_cleanup_deadline";
    readonly lifecycleClaim: LifecycleClaimGuard;
    readonly platform?: AuthorizedPlatform;
  },
): Promise<boolean> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    });
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    let channel = await transaction.channel.findFirst({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        ...(input.platform ? { platform: input.platform } : {}),
      },
      include: { consent: { select: { userId: true } } },
    });
    if (!channel || channel.state === ChannelState.DISCONNECTED) return true;
    const platform = authorizedPlatform(channel.platform);
    if (channel.state !== ChannelState.DISCONNECTING) throw new Error("channel_not_disconnecting");
    const now = (await readLifecycleClock(transaction, input.now)).now;
    const operationDeadline =
      input.deadlineAt ??
      (
        await transaction.lifecycleOperation.findUniqueOrThrow({
          where: { id: input.lifecycleClaim.operationId },
          select: { deadlineAt: true },
        })
      ).deadlineAt;
    if (await channelLeaseIsActive(transaction, channel.id, input.now)) {
      throw new Error("channel_operations_in_flight");
    }
    if (
      channel.externalAccountId ||
      channel.tokenEnvelopeCiphertext ||
      channel.tokenCiphertextReference
    ) {
      const accountReference = channel.externalAccountId;
      let authorizedAuditTargetIds: readonly string[] = [channel.id];
      if (accountReference) {
        await terminalizeDisconnectedYouTubeExecutions(transaction, {
          workspaceId: input.workspaceId,
          accountReference,
          ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
          correlationId: input.correlationId,
          now,
          platform,
        });
        authorizedAuditTargetIds = await pseudonymizePlatformAuthorizedData(transaction, {
          platform,
          workspaceId: input.workspaceId,
          channelId: channel.id,
          accountReference,
          replacementAccountReference: `disconnected:${channel.id}`,
          replacementDisplayName: disconnectedDisplayName(platform),
        });
      }
      await transaction.$executeRaw`SELECT pseudonymize_channel_audit(
        ${input.workspaceId}::uuid,
        ${input.channelId}::uuid,
        ${authorizedAuditTargetIds}::text[]
      )`;
      await enqueueTokenKeyRetirement(transaction, {
        workspaceId: input.workspaceId,
        channelId: channel.id,
        ...(channel.consent?.userId ? { subjectUserId: channel.consent.userId } : {}),
        keyReference: channel.tokenCiphertextReference,
        correlationId: input.correlationId,
        deadlineAt: operationDeadline,
        now,
      });
      channel = await transaction.channel.update({
        where: { id: channel.id },
        data: {
          externalAccountId: null,
          displayName: null,
          authorizationSubjectReference: null,
          grantedScopes: [],
          tokenCiphertextReference: null,
          tokenEnvelopeCiphertext: null,
          authorizedAt: null,
          refreshedAt: null,
          authorizedDataExpiresAt: null,
          revokeFailureCategory: input.revocationOutcome ?? "provider_revoked",
          operationLeaseId: null,
          operationLeaseUntil: null,
          operationLeaseGeneration: null,
        },
        include: { consent: { select: { userId: true } } },
      });
    }
    if (
      await tokenKeyRetirementPending(transaction, {
        workspaceId: input.workspaceId,
        channelId: channel.id,
      })
    ) {
      return false;
    }
    const storedOutcome = channel.revokeFailureCategory;
    const revocationOutcome =
      storedOutcome === "provider_revoke_failed_local_erased" ||
      storedOutcome === "local_cleanup_deadline" ||
      storedOutcome === "provider_revoked"
        ? storedOutcome
        : (input.revocationOutcome ?? "provider_revoked");
    await transaction.channel.update({
      where: { id: channel.id },
      data: {
        state: ChannelState.DISCONNECTED,
        externalAccountId: null,
        displayName: null,
        authorizationSubjectReference: null,
        grantedScopes: [],
        consentRecordId: null,
        tokenCiphertextReference: null,
        tokenEnvelopeCiphertext: null,
        authorizedAt: null,
        refreshedAt: null,
        authorizedDataExpiresAt: null,
        disconnectedAt: now,
        revokeFailureCategory: null,
        revokeAttemptCount: 0,
        operationLeaseId: null,
        operationLeaseUntil: null,
        operationLeaseGeneration: null,
      },
    });
    if (platform === "facebook") {
      await transaction.$queryRaw<{ id: string }[]>`
        SELECT deletion_request.id
        FROM provider_data_deletion_requests deletion_request
        WHERE deletion_request.provider = 'facebook'
          AND deletion_request.state = 'pending'
          AND ${channel.id}::uuid = ANY(deletion_request.channel_ids)
        FOR UPDATE
      `;
      await transaction.$executeRaw`
        UPDATE provider_data_deletion_requests deletion_request
        SET state = 'completed', completed_at = ${now}, updated_at = ${now}
        WHERE deletion_request.provider = 'facebook'
          AND deletion_request.state = 'pending'
          AND ${channel.id}::uuid = ANY(deletion_request.channel_ids)
          AND NOT EXISTS (
            SELECT 1
            FROM channels remaining_channel
            WHERE remaining_channel.id = ANY(deletion_request.channel_ids)
              AND remaining_channel.state <> 'disconnected'::channel_state
          )
      `;
    }
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: "channel.disconnected",
      targetType: "channel",
      targetId: channel.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: {
        platform,
        authorized_data_deleted: true,
        revocation_outcome: revocationOutcome,
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: "data.retention_deleted",
      targetType: "channel",
      targetId: channel.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: {
        platform,
        reason: "user_revocation",
        within_days: 7,
        revocation_outcome: revocationOutcome,
      },
    });
    return true;
  });
}

export interface ExpiredYouTubeAuthorization {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly tokenEnvelopeCiphertext: string;
  readonly tokenCiphertextReference: string | null;
  readonly externalAccountId: string;
  readonly channelOperationGeneration: bigint;
  readonly platform: AuthorizedPlatform;
}

export async function readExpiredYouTubeAuthorization(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly expectedAuthorizedDataExpiresAt: Date;
    readonly lifecycleClaim: LifecycleClaimGuard;
    readonly now?: Date;
  },
): Promise<ExpiredYouTubeAuthorization> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    });
    const evaluationTime = input.now ?? null;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    const rows = await transaction.$queryRaw<
      {
        token_envelope_ciphertext: string | null;
        token_ciphertext_reference: string | null;
        external_account_id: string | null;
        operation_generation: bigint;
        platform: string;
      }[]
    >`
      UPDATE channels
      SET operation_lease_id = ${input.lifecycleClaim.operationId}::uuid,
          operation_lease_until = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
          operation_lease_generation = operation_generation,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.channelId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid
        AND state = 'connected'::channel_state
        AND authorized_data_expires_at = ${input.expectedAuthorizedDataExpiresAt}
        AND authorized_data_expires_at <=
          COALESCE(${evaluationTime}::timestamptz, CURRENT_TIMESTAMP) + INTERVAL '1 day'
        AND token_envelope_ciphertext IS NOT NULL
        AND external_account_id IS NOT NULL
        AND (
          operation_lease_id IS NULL
          OR operation_lease_until <= CURRENT_TIMESTAMP
          OR operation_lease_id = ${input.lifecycleClaim.operationId}::uuid
        )
      RETURNING token_envelope_ciphertext, token_ciphertext_reference,
        external_account_id, operation_generation, platform
    `;
    const channel = rows[0];
    if (!channel?.token_envelope_ciphertext || !channel.external_account_id) {
      const status = await transaction.$queryRaw<
        { cycle_current: boolean; refresh_due: boolean }[]
      >`
        SELECT
          (
            state = 'connected'::channel_state
            AND authorized_data_expires_at = ${input.expectedAuthorizedDataExpiresAt}
            AND token_envelope_ciphertext IS NOT NULL
            AND external_account_id IS NOT NULL
          ) AS cycle_current,
          (
            authorized_data_expires_at <=
              COALESCE(${evaluationTime}::timestamptz, CURRENT_TIMESTAMP) + INTERVAL '1 day'
          ) AS refresh_due
        FROM channels
        WHERE id = ${input.channelId}::uuid
          AND workspace_id = ${input.workspaceId}::uuid
      `;
      if (status[0]?.cycle_current) {
        throw new Error(
          status[0].refresh_due
            ? "authorized_data_refresh_blocked"
            : "authorized_data_refresh_not_due",
        );
      }
      throw new Error("authorized_data_refresh_superseded");
    }
    return {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      tokenEnvelopeCiphertext: channel.token_envelope_ciphertext,
      tokenCiphertextReference: channel.token_ciphertext_reference,
      externalAccountId: channel.external_account_id,
      channelOperationGeneration: channel.operation_generation,
      platform: authorizedPlatform(channel.platform),
    };
  });
}

export async function releaseAuthorizedDataRetentionLease(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly operationId: string;
    readonly operationGeneration: bigint;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        operationLeaseId: input.operationId,
        operationGeneration: input.operationGeneration,
        operationLeaseGeneration: input.operationGeneration,
      },
      data: {
        operationLeaseId: null,
        operationLeaseUntil: null,
        operationLeaseGeneration: null,
      },
    });
  });
}

export interface PendingYouTubeDisconnect {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly tokenEnvelopeCiphertext: string | null;
  readonly tokenCiphertextReference: string | null;
  readonly revokeAttemptCount: number;
  readonly disconnectRequestedAt: Date;
  readonly operationsInFlight: boolean;
  readonly platform: AuthorizedPlatform;
}

export async function readYouTubeDisconnectMaterial(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly lifecycleClaim: LifecycleClaimGuard;
  },
): Promise<PendingYouTubeDisconnect> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    });
    const channel = await transaction.channel.findFirst({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        workspaceId: true,
        tokenEnvelopeCiphertext: true,
        tokenCiphertextReference: true,
        revokeAttemptCount: true,
        disconnectRequestedAt: true,
        platform: true,
      },
    });
    if (!channel?.disconnectRequestedAt) throw new Error("channel_disconnect_not_pending");
    const platform = authorizedPlatform(channel.platform);
    const activeOperations = await transaction.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM channels
        WHERE id = ${input.channelId}::uuid
          AND workspace_id = ${input.workspaceId}::uuid
          AND operation_lease_id IS NOT NULL
          AND operation_lease_until > CURRENT_TIMESTAMP
      ) AS present
    `;
    return {
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
      tokenCiphertextReference: channel.tokenCiphertextReference,
      revokeAttemptCount: channel.revokeAttemptCount,
      disconnectRequestedAt: channel.disconnectRequestedAt,
      operationsInFlight: activeOperations[0]?.present ?? false,
      platform,
    };
  });
}

export async function refreshYouTubeAuthorizedData(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly tokenEnvelopeCiphertext: string;
    readonly tokenCiphertextReference: string;
    readonly externalAccountId: string;
    readonly expectedTokenCiphertextReference: string | null;
    readonly expectedAuthorizedDataExpiresAt: Date;
    readonly channelOperationGeneration: bigint;
    readonly displayName: string | null;
    readonly now?: Date;
    readonly correlationId: string;
    readonly lifecycleClaim: LifecycleClaimGuard;
    readonly platform?: AuthorizedPlatform;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    });
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    const evaluationTime = input.now ?? null;
    const refreshed = await transaction.$queryRaw<{ refreshed_at: Date }[]>`
      UPDATE channels
      SET token_envelope_ciphertext = ${input.tokenEnvelopeCiphertext},
          token_ciphertext_reference = ${input.tokenCiphertextReference},
          display_name = ${input.displayName},
          refreshed_at = COALESCE(${evaluationTime}::timestamptz, CURRENT_TIMESTAMP),
          authorized_data_expires_at =
            COALESCE(${evaluationTime}::timestamptz, CURRENT_TIMESTAMP) + INTERVAL '30 days',
          operation_lease_id = NULL,
          operation_lease_until = NULL,
          operation_lease_generation = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.channelId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid
        AND state = 'connected'::channel_state
        AND external_account_id = ${input.externalAccountId}
        AND token_ciphertext_reference IS NOT DISTINCT FROM ${input.expectedTokenCiphertextReference}
        AND authorized_data_expires_at = ${input.expectedAuthorizedDataExpiresAt}
        AND authorized_data_expires_at >
          COALESCE(${evaluationTime}::timestamptz, CURRENT_TIMESTAMP)
        AND operation_lease_id = ${input.lifecycleClaim.operationId}::uuid
        AND operation_generation = ${input.channelOperationGeneration}
        AND operation_lease_generation = ${input.channelOperationGeneration}
        AND operation_lease_until > CURRENT_TIMESTAMP
      RETURNING refreshed_at
    `;
    const refreshedAt = refreshed[0]?.refreshed_at;
    if (!refreshedAt) {
      const deadline = await transaction.$queryRaw<{ exceeded: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM channels
          WHERE id = ${input.channelId}::uuid
            AND workspace_id = ${input.workspaceId}::uuid
            AND state = 'connected'::channel_state
            AND external_account_id = ${input.externalAccountId}
            AND token_ciphertext_reference IS NOT DISTINCT FROM ${input.expectedTokenCiphertextReference}
            AND authorized_data_expires_at = ${input.expectedAuthorizedDataExpiresAt}
            AND operation_lease_id = ${input.lifecycleClaim.operationId}::uuid
            AND operation_generation = ${input.channelOperationGeneration}
            AND operation_lease_generation = ${input.channelOperationGeneration}
            AND authorized_data_expires_at <=
              COALESCE(${evaluationTime}::timestamptz, CURRENT_TIMESTAMP)
        ) AS exceeded
      `;
      throw new Error(
        deadline[0]?.exceeded
          ? "authorized_data_refresh_deadline_exceeded"
          : "authorized_data_refresh_superseded",
      );
    }
    await enqueueTokenKeyRetirement(transaction, {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      keyReference: input.expectedTokenCiphertextReference,
      correlationId: input.correlationId,
      now: refreshedAt,
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "data.retention_refreshed",
      targetType: "channel",
      targetId: input.channelId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { platform: input.platform ?? "youtube", next_refresh_within_days: 30 },
    });
  });
}

export interface WorkspaceDeletionMaterial {
  readonly requestId: string;
  readonly requestReference: string;
  readonly objectKeys: readonly string[];
  readonly channels: readonly {
    readonly id: string;
    readonly platform: AuthorizedPlatform;
    readonly tokenEnvelopeCiphertext: string | null;
    readonly tokenCiphertextReference: string | null;
  }[];
  readonly operationsInFlight: boolean;
}

export interface PendingWorkspaceDataDeletion extends WorkspaceDeletionMaterial {
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly requestedAt: Date;
}

export async function readWorkspaceDataDeletionMaterial(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly lifecycleOperationId: string;
    readonly lifecycleClaim: LifecycleClaimGuard;
    readonly now?: Date;
  },
): Promise<PendingWorkspaceDataDeletion> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
      workspaceId: input.workspaceId,
    });
    const request = await transaction.dataDeletionRequest.findFirst({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { lifecycleOperationId: input.lifecycleOperationId },
          { lifecycleOperationId: null, state: { not: DataDeletionState.COMPLETED } },
        ],
      },
      orderBy: { requestedAt: "desc" },
      include: {
        workspace: {
          include: {
            sourceAssets: { select: { objectKey: true } },
            channels: {
              select: {
                id: true,
                platform: true,
                tokenEnvelopeCiphertext: true,
                tokenCiphertextReference: true,
                operationLeaseId: true,
                operationLeaseUntil: true,
                operationLeaseGeneration: true,
                operationGeneration: true,
              },
            },
          },
        },
      },
    });
    if (!request) throw new Error("workspace_deletion_request_not_found");
    const activeOperations = await transaction.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM channels
        WHERE workspace_id = ${input.workspaceId}::uuid
          AND operation_lease_id IS NOT NULL
          AND operation_lease_until > CURRENT_TIMESTAMP
      ) AS present
    `;
    return {
      requestId: request.id,
      workspaceId: request.workspaceId,
      actorUserId: request.requestedByUserId,
      requestReference: request.requestReference,
      requestedAt: request.requestedAt,
      objectKeys:
        request.pendingObjectKeys.length > 0
          ? request.pendingObjectKeys
          : request.workspace.sourceAssets.map((entry) => entry.objectKey),
      channels: request.workspace.channels.map((channel) => ({
        id: channel.id,
        platform: authorizedPlatform(channel.platform),
        tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
        tokenCiphertextReference: channel.tokenCiphertextReference,
      })),
      operationsInFlight: activeOperations[0]?.present ?? false,
    };
  });
}

export async function resumeWorkspaceDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly requestId: string;
    readonly lifecycleClaim: LifecycleClaimGuard;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
      workspaceId: input.workspaceId,
    });
    await transaction.dataDeletionRequest.updateMany({
      where: {
        id: input.requestId,
        workspaceId: input.workspaceId,
        state: { not: DataDeletionState.COMPLETED },
      },
      data: { state: DataDeletionState.PROCESSING, failureCategory: null },
    });
  });
}

export async function beginWorkspaceDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly confirmedWorkspaceName: string;
    readonly correlationId: string;
    readonly now?: Date;
  },
): Promise<WorkspaceDeletionMaterial> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.workspaceId}, 7))`;
    const workspace = await transaction.workspace.findUnique({ where: { id: input.workspaceId } });
    if (!workspace) throw new Error("workspace_not_found");
    if (workspace.name !== input.confirmedWorkspaceName.trim()) {
      throw new Error("workspace_confirmation_mismatch");
    }
    const existing = await transaction.dataDeletionRequest.findFirst({
      where: { workspaceId: input.workspaceId },
      orderBy: { requestedAt: "desc" },
    });
    if (workspace.lifecycleState === WorkspaceLifecycleState.DELETED && existing) {
      return {
        requestId: existing.id,
        requestReference: existing.requestReference,
        objectKeys: [],
        channels: [],
        operationsInFlight: false,
      };
    }
    const clock = await readLifecycleClock(transaction, input.now);
    const now = clock.now;
    const [assets, channels] = await Promise.all([
      transaction.sourceAsset.findMany({
        where: { workspaceId: input.workspaceId },
        select: { objectKey: true },
      }),
      transaction.channel.findMany({
        where: { workspaceId: input.workspaceId },
        select: {
          id: true,
          platform: true,
          tokenEnvelopeCiphertext: true,
          tokenCiphertextReference: true,
          operationLeaseId: true,
          operationLeaseUntil: true,
        },
      }),
    ]);
    const objectKeys = assets.map((entry) => entry.objectKey);
    await transaction.workspace.update({
      where: { id: input.workspaceId },
      data: {
        lifecycleState: WorkspaceLifecycleState.DELETION_PENDING,
        deletionRequestedAt: workspace.deletionRequestedAt ?? now,
      },
    });
    const activeOperation = await transaction.lifecycleOperation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        kind: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
        state: {
          in: [
            LifecycleOperationState.PENDING,
            LifecycleOperationState.CLAIMED,
            LifecycleOperationState.RETRY,
          ],
        },
      },
      orderBy: { requestedAt: "desc" },
    });
    const operation =
      activeOperation ??
      (await transaction.lifecycleOperation.create({
        data: {
          kind: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          dedupeKey: `workspace_data_deletion:${input.workspaceId}`,
          requestReference: `DEL-${randomBytes(14).toString("hex").toUpperCase()}`,
          correlationId: input.correlationId,
          requestedAt: now,
          deadlineAt: clock.deletionDeadline,
          nextAttemptAt: now,
          retentionExpiresAt: clock.retentionExpiry,
        },
      }));
    const request =
      existing && existing.state !== DataDeletionState.COMPLETED
        ? existing
        : await transaction.dataDeletionRequest.create({
            data: {
              workspaceId: input.workspaceId,
              requestedByUserId: input.actorUserId,
              requesterReference: deletionRequesterReference(input.actorUserId),
              requestReference: operation.requestReference,
              state: DataDeletionState.PROCESSING,
              startedAt: now,
              lifecycleOperationId: operation.id,
              pendingObjectKeys: objectKeys,
              retentionExpiresAt: operation.retentionExpiresAt,
              dataClasses: [
                "workspace",
                "memberships",
                "content",
                "source_assets",
                "youtube_authorized_data",
                "facebook_authorized_data",
                "oauth_tokens",
              ],
            },
          });
    await transaction.channel.updateMany({
      where: {
        workspaceId: input.workspaceId,
        state: { not: ChannelState.DISCONNECTED },
      },
      data: {
        state: ChannelState.DISCONNECTING,
        deniedAt: now,
        disconnectRequestedAt: now,
        revokeAttemptCount: 0,
        operationGeneration: { increment: 1 },
      },
    });
    const cancelledExecutions = await transaction.platformExecution.findMany({
      where: {
        workspaceId: input.workspaceId,
        state: PlatformExecutionState.NOT_STARTED,
        providerId: null,
      },
      select: { id: true },
    });
    await transaction.platformExecution.updateMany({
      where: { id: { in: cancelledExecutions.map((entry) => entry.id) } },
      data: { state: PlatformExecutionState.CANCELLED, failureCategory: "workspace_deletion" },
    });
    await transaction.outboxMessage.updateMany({
      where: { workspaceId: input.workspaceId, state: { not: OutboxState.COMPLETED } },
      data: {
        state: OutboxState.DEAD,
        failureCategory: "workspace_deletion",
        completedAt: now,
        claimedAt: null,
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "data.deletion_requested",
      targetType: "workspace",
      targetId: input.workspaceId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { request_reference: request.requestReference, third_party_content_deleted: false },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "data.deletion_started",
      targetType: "workspace",
      targetId: input.workspaceId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { request_reference: request.requestReference },
    });
    for (const execution of cancelledExecutions) {
      await appendAudit(transaction, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "platform.publish_cancelled",
        targetType: "platform_execution",
        targetId: execution.id,
        result: "success",
        correlationId: input.correlationId,
        metadata: { reason: "workspace_deletion" },
      });
    }
    const operationsInFlight = (
      await Promise.all(
        channels.map((channel) => channelLeaseIsActive(transaction, channel.id, input.now)),
      )
    ).some(Boolean);
    return {
      requestId: request.id,
      requestReference: request.requestReference,
      objectKeys,
      channels: channels.map((channel) => ({
        id: channel.id,
        platform: authorizedPlatform(channel.platform),
        tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
        tokenCiphertextReference: channel.tokenCiphertextReference,
      })),
      operationsInFlight,
    };
  });
}

export async function readWorkspaceDataDeletionStatus(
  client: PrismaClient,
  input: { readonly requestReference: string; readonly viewerUserId: string },
): Promise<{
  readonly state: "pending" | "processing" | "completed" | "failed";
  readonly failureCategory: string | null;
} | null> {
  const rows = await client.$queryRaw<
    { deletion_state: string; failure_category: string | null }[]
  >`
    SELECT * FROM read_workspace_data_deletion_status(
      ${input.requestReference},
      ${input.viewerUserId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) return null;
  if (!["pending", "processing", "completed", "failed"].includes(row.deletion_state)) {
    throw new Error("unsupported_data_deletion_state");
  }
  return {
    state: row.deletion_state as "pending" | "processing" | "completed" | "failed",
    failureCategory: row.failure_category,
  };
}

export async function failWorkspaceDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly requestId: string;
    readonly actorUserId?: string | null;
    readonly correlationId: string;
    readonly failureCategory: string;
    readonly now?: Date;
    readonly lifecycleClaim: LifecycleClaimGuard;
  },
): Promise<boolean> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
      workspaceId: input.workspaceId,
    });
    const result = await transaction.dataDeletionRequest.updateMany({
      where: {
        id: input.requestId,
        workspaceId: input.workspaceId,
        state: { not: DataDeletionState.COMPLETED },
      },
      data: {
        state: DataDeletionState.FAILED,
        failureCategory: input.failureCategory,
        ...(input.now ? { updatedAt: input.now } : {}),
      },
    });
    if (result.count !== 1) return false;
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: "data.deletion_failed",
      targetType: "workspace",
      targetId: input.workspaceId,
      result: "failed",
      correlationId: input.correlationId,
      metadata: { failure_category: input.failureCategory },
    });
    return true;
  });
}

async function setLifecycleTenantContext(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  await transaction.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
}

async function resolveWorkspaceDeletionFallback(
  transaction: Prisma.TransactionClient,
  input: {
    readonly userId: string;
    readonly deletedWorkspaceId: string;
  },
): Promise<{ readonly workspaceId: string | null; readonly lastWorkspaceId: string | null }> {
  await transaction.$executeRaw`SELECT set_config('app.user_id', ${input.userId}, true)`;
  const [user, memberships] = await Promise.all([
    transaction.user.findUnique({
      where: { id: input.userId },
      select: { lastWorkspaceId: true },
    }),
    transaction.membership.findMany({
      where: {
        userId: input.userId,
        workspaceId: { not: input.deletedWorkspaceId },
        status: MembershipStatus.ACTIVE,
      },
      orderBy: { joinedAt: "desc" },
      select: { workspaceId: true },
    }),
  ]);
  const preferredWorkspaceId = user?.lastWorkspaceId;
  const candidates = preferredWorkspaceId
    ? [
        ...memberships.filter(({ workspaceId }) => workspaceId === preferredWorkspaceId),
        ...memberships.filter(({ workspaceId }) => workspaceId !== preferredWorkspaceId),
      ]
    : memberships;

  for (const candidate of candidates) {
    await setLifecycleTenantContext(transaction, candidate.workspaceId);
    const workspace = await transaction.workspace.findFirst({
      where: {
        id: candidate.workspaceId,
        lifecycleState: WorkspaceLifecycleState.ACTIVE,
      },
      select: { id: true },
    });
    if (workspace) {
      await setLifecycleTenantContext(transaction, input.deletedWorkspaceId);
      return {
        workspaceId: candidate.workspaceId,
        lastWorkspaceId: user?.lastWorkspaceId ?? null,
      };
    }
  }

  await setLifecycleTenantContext(transaction, input.deletedWorkspaceId);
  return { workspaceId: null, lastWorkspaceId: user?.lastWorkspaceId ?? null };
}

export async function completeWorkspaceDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly requestId: string;
    readonly actorUserId?: string | null;
    readonly correlationId: string;
    readonly deadlineAt?: Date;
    readonly now?: Date;
    readonly revocationOutcome?:
      "provider_revoked" | "provider_revoke_failed_local_erased" | "local_cleanup_deadline";
    readonly pendingObjectKeys?: readonly string[];
    readonly lifecycleClaim: LifecycleClaimGuard;
  },
): Promise<boolean> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
      workspaceId: input.workspaceId,
    });
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.workspaceId}, 7))`;
    const request = await transaction.dataDeletionRequest.findFirst({
      where: { id: input.requestId, workspaceId: input.workspaceId },
    });
    if (!request || request.state === DataDeletionState.COMPLETED) return true;
    const workspace = await transaction.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { lifecycleState: true },
    });
    if (!workspace) throw new Error("workspace_not_found");
    const now = (await readLifecycleClock(transaction, input.now)).now;
    const operationDeadline =
      input.deadlineAt ??
      (
        await transaction.lifecycleOperation.findUniqueOrThrow({
          where: { id: input.lifecycleClaim.operationId },
          select: { deadlineAt: true },
        })
      ).deadlineAt;
    const activeOperations = await transaction.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM channels
        WHERE workspace_id = ${input.workspaceId}::uuid
          AND operation_lease_id IS NOT NULL
          AND operation_lease_until > CURRENT_TIMESTAMP
      ) AS present
    `;
    if (activeOperations[0]?.present) throw new Error("workspace_operations_in_flight");
    if (workspace.lifecycleState !== WorkspaceLifecycleState.DELETED) {
      const tokenKeys = await transaction.channel.findMany({
        where: { workspaceId: input.workspaceId, tokenCiphertextReference: { not: null } },
        select: {
          id: true,
          tokenCiphertextReference: true,
          consent: { select: { userId: true } },
        },
      });
      for (const channel of tokenKeys) {
        await enqueueTokenKeyRetirement(transaction, {
          workspaceId: input.workspaceId,
          channelId: channel.id,
          ...(channel.consent?.userId ? { subjectUserId: channel.consent.userId } : {}),
          keyReference: channel.tokenCiphertextReference,
          correlationId: input.correlationId,
          deadlineAt: operationDeadline,
          now,
        });
      }
      await transaction.outboxMessage.deleteMany({ where: { workspaceId: input.workspaceId } });
      await transaction.platformExecution.deleteMany({ where: { workspaceId: input.workspaceId } });
      await transaction.publishingIntent.deleteMany({ where: { workspaceId: input.workspaceId } });
      await transaction.$executeRaw`SELECT delete_workspace_immutable_history(
        ${input.workspaceId}::uuid,
        ${request.id}::uuid
      )`;
      await transaction.sourceAsset.deleteMany({ where: { workspaceId: input.workspaceId } });
      await transaction.content.deleteMany({ where: { workspaceId: input.workspaceId } });
      await transaction.channel.deleteMany({ where: { workspaceId: input.workspaceId } });
      await transaction.invitation.deleteMany({ where: { workspaceId: input.workspaceId } });
      const [workspaceMembers, workspaceSessions] = await Promise.all([
        transaction.membership.findMany({
          where: { workspaceId: input.workspaceId },
          select: { userId: true },
        }),
        transaction.session.findMany({
          where: { currentWorkspaceId: input.workspaceId },
          select: { userId: true },
        }),
      ]);
      const affectedUserIds = new Set([
        ...workspaceMembers.map(({ userId }) => userId),
        ...workspaceSessions.map(({ userId }) => userId),
      ]);
      for (const userId of affectedUserIds) {
        const fallback = await resolveWorkspaceDeletionFallback(transaction, {
          userId,
          deletedWorkspaceId: input.workspaceId,
        });
        const movedSessions = await transaction.session.updateMany({
          where: { userId, currentWorkspaceId: input.workspaceId },
          data: { currentWorkspaceId: fallback.workspaceId },
        });
        if (movedSessions.count > 0 || fallback.lastWorkspaceId === input.workspaceId) {
          await transaction.user.update({
            where: { id: userId },
            data: { lastWorkspaceId: fallback.workspaceId },
          });
        }
      }
      await transaction.membership.deleteMany({ where: { workspaceId: input.workspaceId } });
      // Preserve the pseudonymized Workspace id as the last real audit scope for
      // users who no longer have an active Workspace. Login/logout events remain
      // attributable without restoring access to deleted tenant data.
      await transaction.$executeRaw`SELECT pseudonymize_workspace_audit(${input.workspaceId}::uuid)`;
      await transaction.workspace.update({
        where: { id: input.workspaceId },
        data: {
          name: `Deleted workspace ${request.requestReference}`,
          lifecycleState: WorkspaceLifecycleState.DELETED,
          deletedAt: now,
        },
      });
    }
    if (
      await tokenKeyRetirementPending(transaction, {
        workspaceId: input.workspaceId,
      })
    ) {
      await transaction.dataDeletionRequest.update({
        where: { id: request.id },
        data: {
          state: DataDeletionState.PROCESSING,
          failureCategory: null,
          completedAt: null,
        },
      });
      return false;
    }
    const pendingObjectKeys = [...new Set(input.pendingObjectKeys ?? [])];
    if (pendingObjectKeys.length > 0) {
      await transaction.dataDeletionRequest.update({
        where: { id: request.id },
        data: {
          state: DataDeletionState.FAILED,
          requestedByUserId: null,
          pendingObjectKeys,
          failureCategory: "object_deletion_pending",
          completedAt: null,
        },
      });
      await appendAudit(transaction, {
        workspaceId: input.workspaceId,
        action: "data.deletion_failed",
        targetType: "workspace",
        targetId: input.workspaceId,
        result: "failed",
        correlationId: input.correlationId,
        metadata: {
          failure_category: "object_deletion_pending",
          pending_object_count: pendingObjectKeys.length,
          local_data_deleted: true,
        },
        occurredAt: now,
      });
      return false;
    }
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "data.deletion_completed",
      targetType: "workspace",
      targetId: input.workspaceId,
      result: "success",
      correlationId: input.correlationId,
      metadata: {
        request_reference: request.requestReference,
        third_party_content_deleted: false,
        revocation_outcome: input.revocationOutcome ?? "provider_revoked",
      },
      occurredAt: now,
    });
    await transaction.dataDeletionRequest.update({
      where: { id: request.id },
      data: {
        state: DataDeletionState.COMPLETED,
        requestedByUserId: null,
        pendingObjectKeys: [],
        failureCategory: null,
        completedAt: now,
      },
    });
    return true;
  });
}

export async function recordExpiredAuthorizedDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly correlationId: string;
    readonly expectedTokenCiphertextReference: string | null;
    readonly channelOperationGeneration: bigint;
    readonly now?: Date;
    readonly lifecycleClaim: LifecycleClaimGuard;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    });
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    const retentionScope = await transaction.channel.findFirst({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
      },
      select: { platform: true, consent: { select: { userId: true } } },
    });
    if (
      !retentionScope ||
      (retentionScope.platform !== "youtube" &&
        retentionScope.platform !== "facebook" &&
        retentionScope.platform !== "tiktok")
    ) {
      throw new Error("unsupported_channel_platform");
    }
    const platform = retentionScope.platform;
    const retentionDeadline = (
      await transaction.lifecycleOperation.findUniqueOrThrow({
        where: { id: input.lifecycleClaim.operationId },
        select: { deadlineAt: true },
      })
    ).deadlineAt;
    const evaluationTime = input.now ?? null;
    const transitioned = await transaction.$queryRaw<
      {
        external_account_id: string | null;
        denied_at: Date;
      }[]
    >`
      UPDATE channels
      SET state = 'reauthorization_required'::channel_state,
          denied_at = COALESCE(${evaluationTime}::timestamptz, CURRENT_TIMESTAMP),
          operation_lease_id = NULL,
          operation_lease_until = NULL,
          operation_lease_generation = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.channelId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid
        AND state = 'connected'::channel_state
        AND token_ciphertext_reference IS NOT DISTINCT FROM ${input.expectedTokenCiphertextReference}
        AND operation_lease_id = ${input.lifecycleClaim.operationId}::uuid
        AND operation_generation = ${input.channelOperationGeneration}
        AND operation_lease_generation = ${input.channelOperationGeneration}
        AND operation_lease_until > CURRENT_TIMESTAMP
      RETURNING external_account_id, denied_at
    `;
    const channel = transitioned[0];
    if (!channel) throw new Error("authorized_data_refresh_superseded");
    const now = channel.denied_at;
    let authorizedAuditTargetIds: readonly string[] = [input.channelId];
    if (channel.external_account_id) {
      authorizedAuditTargetIds = await pseudonymizePlatformAuthorizedData(transaction, {
        platform,
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        accountReference: channel.external_account_id,
        replacementAccountReference: `expired:${input.channelId}`,
        replacementDisplayName: expiredDisplayName(platform),
      });
    }
    await transaction.$executeRaw`SELECT pseudonymize_channel_audit(
      ${input.workspaceId}::uuid,
      ${input.channelId}::uuid,
      ${authorizedAuditTargetIds}::text[]
    )`;
    await enqueueTokenKeyRetirement(transaction, {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      ...(retentionScope?.consent?.userId ? { subjectUserId: retentionScope.consent.userId } : {}),
      keyReference: input.expectedTokenCiphertextReference,
      correlationId: input.correlationId,
      deadlineAt: retentionDeadline,
      now,
    });
    await transaction.channel.update({
      where: { id: input.channelId },
      data: {
        externalAccountId: null,
        displayName: null,
        authorizationSubjectReference: null,
        grantedScopes: [],
        tokenEnvelopeCiphertext: null,
        tokenCiphertextReference: null,
        authorizedAt: null,
        refreshedAt: null,
        authorizedDataExpiresAt: null,
      },
    });
    await transaction.lifecycleStep.upsert({
      where: {
        operationId_name: {
          operationId: input.lifecycleClaim.operationId,
          name: "delete_expired_authorization",
        },
      },
      create: {
        operationId: input.lifecycleClaim.operationId,
        name: "delete_expired_authorization",
        ordinal: 30,
        state: LifecycleStepState.COMPLETED,
        attempt: 1,
        claimGeneration: input.lifecycleClaim.claimGeneration,
        outcome: { authorized_data_deleted: true },
        startedAt: now,
        completedAt: now,
      },
      update: {
        state: LifecycleStepState.COMPLETED,
        claimGeneration: input.lifecycleClaim.claimGeneration,
        outcome: { authorized_data_deleted: true },
        failureCategory: null,
        completedAt: now,
      },
    });
  });
}

export async function completeAuthorizedDataRetention(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly correlationId: string;
    readonly lifecycleClaim: LifecycleClaimGuard;
  },
): Promise<boolean> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await assertLifecycleClaim(transaction, input.lifecycleClaim, {
      kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    });
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    if (
      await tokenKeyRetirementPending(transaction, {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
      })
    ) {
      return false;
    }

    const deletionStep = await transaction.lifecycleStep.findUnique({
      where: {
        operationId_name: {
          operationId: input.lifecycleClaim.operationId,
          name: "delete_expired_authorization",
        },
      },
      select: { state: true },
    });
    if (deletionStep?.state === LifecycleStepState.COMPLETED) {
      const existingAudit = await transaction.auditEvent.findFirst({
        where: {
          workspaceId: input.workspaceId,
          action: "data.retention_deleted",
          targetId: input.channelId,
          correlationId: input.correlationId,
        },
        select: { id: true },
      });
      if (!existingAudit) {
        await appendAudit(transaction, {
          workspaceId: input.workspaceId,
          action: "data.retention_deleted",
          targetType: "channel",
          targetId: input.channelId,
          result: "success",
          correlationId: input.correlationId,
          metadata: { reason: "refresh_failed", within_days: 30 },
        });
      }
    }
    return true;
  });
}
