import { randomBytes } from "node:crypto";

import {
  ChannelState,
  DataDeletionState,
  OutboxState,
  PlatformExecutionState,
  WorkspaceLifecycleState,
  type PrismaClient,
} from "./generated/client.js";
import { appendAudit, withTenant } from "./repository.js";

const authorizedDataLifetimeMs = 30 * 24 * 60 * 60 * 1000;

export interface DisconnectPreparation {
  readonly channelId: string;
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
  },
): Promise<DisconnectPreparation> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    const channel = await transaction.channel.findFirst({
      where: { id: input.channelId, workspaceId: input.workspaceId, platform: "youtube" },
    });
    if (!channel) throw new Error("channel_not_found");
    if (channel.state === ChannelState.DISCONNECTED) {
      return {
        channelId: channel.id,
        tokenEnvelopeCiphertext: null,
        alreadyDisconnected: true,
        revocationDeferred: false,
      };
    }
    if (
      channel.state !== ChannelState.CONNECTED &&
      channel.state !== ChannelState.REAUTHORIZATION_REQUIRED &&
      channel.state !== ChannelState.DISCONNECTING
    ) {
      throw new Error("channel_not_disconnectable");
    }
    const now = input.now ?? new Date();
    if (channel.state !== ChannelState.DISCONNECTING) {
      await transaction.channel.update({
        where: { id: channel.id },
        data: {
          state: ChannelState.DISCONNECTING,
          deniedAt: now,
          disconnectRequestedAt: now,
          revokeFailureCategory: null,
          revokeAttemptCount: 0,
        },
      });
      const versions = await transaction.platformVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          platform: "YOUTUBE",
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
        metadata: { platform: "youtube" },
      });
    }
    return {
      channelId: channel.id,
      tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
      alreadyDisconnected: false,
      revocationDeferred:
        channel.operationLeaseId !== null &&
        channel.operationLeaseUntil !== null &&
        channel.operationLeaseUntil > now,
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
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        state: ChannelState.DISCONNECTING,
      },
      data: {
        revokeFailureCategory: input.failureCategory,
        revokeAttemptCount: { increment: 1 },
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: "channel.disconnect_failed",
      targetType: "channel",
      targetId: input.channelId,
      result: "failed",
      correlationId: input.correlationId,
      metadata: { platform: "youtube", failure_category: input.failureCategory },
    });
  });
}

export async function completeYouTubeDisconnect(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly actorUserId?: string;
    readonly correlationId: string;
    readonly now?: Date;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    const channel = await transaction.channel.findFirst({
      where: { id: input.channelId, workspaceId: input.workspaceId, platform: "youtube" },
    });
    if (!channel || channel.state === ChannelState.DISCONNECTED) return;
    if (channel.state !== ChannelState.DISCONNECTING) throw new Error("channel_not_disconnecting");
    const now = input.now ?? new Date();
    if (
      channel.operationLeaseId &&
      channel.operationLeaseUntil &&
      channel.operationLeaseUntil > now
    ) {
      throw new Error("channel_operations_in_flight");
    }
    const accountReference = channel.externalAccountId;
    const authorizedAuditTargetIds = [channel.id];
    if (accountReference) {
      const versions = await transaction.platformVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          platform: "YOUTUBE",
          accountReference,
        },
        select: { id: true },
      });
      const versionIds = versions.map((entry) => entry.id);
      if (versionIds.length) {
        const executions = await transaction.platformExecution.findMany({
          where: { workspaceId: input.workspaceId, platformVersionId: { in: versionIds } },
          select: { id: true },
        });
        authorizedAuditTargetIds.push(...executions.map((entry) => entry.id));
        await transaction.platformExecution.updateMany({
          where: { workspaceId: input.workspaceId, platformVersionId: { in: versionIds } },
          data: { providerId: null, providerUrl: null },
        });
        await transaction.platformVersion.updateMany({
          where: { id: { in: versionIds } },
          data: {
            accountReference: `disconnected:${channel.id}`,
            accountDisplayName: "Disconnected YouTube channel",
          },
        });
      }
    }
    await transaction.$executeRaw`SELECT pseudonymize_workspace_audit(${input.workspaceId}::uuid, ${authorizedAuditTargetIds}::text[], false)`;
    await transaction.channel.update({
      where: { id: channel.id },
      data: {
        state: ChannelState.DISCONNECTED,
        externalAccountId: null,
        displayName: null,
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
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: "channel.disconnected",
      targetType: "channel",
      targetId: channel.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { platform: "youtube", authorized_data_deleted: true },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: "data.retention_deleted",
      targetType: "channel",
      targetId: channel.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { reason: "user_revocation", within_days: 7 },
    });
  });
}

export interface ExpiredYouTubeAuthorization {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly tokenEnvelopeCiphertext: string;
}

export interface PendingYouTubeDisconnect {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly tokenEnvelopeCiphertext: string;
  readonly revokeAttemptCount: number;
}

export async function listPendingYouTubeDisconnects(
  adminClient: PrismaClient,
  retryBefore: Date,
  limit = 25,
  now = new Date(),
): Promise<readonly PendingYouTubeDisconnect[]> {
  const channels = await adminClient.channel.findMany({
    where: {
      platform: "youtube",
      state: ChannelState.DISCONNECTING,
      disconnectRequestedAt: { lte: retryBefore },
      revokeAttemptCount: { lt: 5 },
      tokenEnvelopeCiphertext: { not: null },
      OR: [{ operationLeaseUntil: null }, { operationLeaseUntil: { lte: now } }],
    },
    select: {
      id: true,
      workspaceId: true,
      tokenEnvelopeCiphertext: true,
      revokeAttemptCount: true,
    },
    orderBy: [{ disconnectRequestedAt: "asc" }, { revokeAttemptCount: "asc" }],
    take: limit,
  });
  return channels.flatMap((channel) =>
    channel.tokenEnvelopeCiphertext
      ? [
          {
            workspaceId: channel.workspaceId,
            channelId: channel.id,
            tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
            revokeAttemptCount: channel.revokeAttemptCount,
          },
        ]
      : [],
  );
}

export async function listExpiredYouTubeAuthorizations(
  adminClient: PrismaClient,
  now: Date,
  limit = 25,
): Promise<readonly ExpiredYouTubeAuthorization[]> {
  const channels = await adminClient.channel.findMany({
    where: {
      platform: "youtube",
      state: ChannelState.CONNECTED,
      authorizedDataExpiresAt: { lte: now },
      tokenEnvelopeCiphertext: { not: null },
      OR: [{ operationLeaseUntil: null }, { operationLeaseUntil: { lte: now } }],
    },
    select: { id: true, workspaceId: true, tokenEnvelopeCiphertext: true },
    orderBy: { authorizedDataExpiresAt: "asc" },
    take: limit,
  });
  return channels.flatMap((channel) =>
    channel.tokenEnvelopeCiphertext
      ? [
          {
            workspaceId: channel.workspaceId,
            channelId: channel.id,
            tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
          },
        ]
      : [],
  );
}

export async function refreshYouTubeAuthorizedData(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly tokenEnvelopeCiphertext: string;
    readonly externalAccountId: string;
    readonly displayName: string;
    readonly now: Date;
    readonly correlationId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const result = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        state: ChannelState.CONNECTED,
      },
      data: {
        tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        refreshedAt: input.now,
        authorizedDataExpiresAt: new Date(input.now.getTime() + authorizedDataLifetimeMs),
      },
    });
    if (result.count !== 1) return;
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "data.retention_refreshed",
      targetType: "channel",
      targetId: input.channelId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { platform: "youtube", next_refresh_within_days: 30 },
    });
  });
}

export interface WorkspaceDeletionMaterial {
  readonly requestId: string;
  readonly requestReference: string;
  readonly objectKeys: readonly string[];
  readonly channels: readonly {
    readonly id: string;
    readonly tokenEnvelopeCiphertext: string | null;
  }[];
  readonly operationsInFlight: boolean;
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
    const now = input.now ?? new Date();
    const request =
      existing && existing.state !== DataDeletionState.COMPLETED
        ? await transaction.dataDeletionRequest.update({
            where: { id: existing.id },
            data: {
              state: DataDeletionState.PROCESSING,
              failureCategory: null,
              startedAt: existing.startedAt ?? now,
            },
          })
        : await transaction.dataDeletionRequest.create({
            data: {
              workspaceId: input.workspaceId,
              requestedByUserId: input.actorUserId,
              requestReference: `DEL-${randomBytes(8).toString("hex").toUpperCase()}`,
              state: DataDeletionState.PROCESSING,
              startedAt: now,
              dataClasses: [
                "workspace",
                "memberships",
                "content",
                "source_assets",
                "youtube_authorized_data",
                "oauth_tokens",
              ],
            },
          });
    await transaction.workspace.update({
      where: { id: input.workspaceId },
      data: {
        lifecycleState: WorkspaceLifecycleState.DELETION_PENDING,
        deletionRequestedAt: workspace.deletionRequestedAt ?? now,
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
    const [assets, channels] = await Promise.all([
      transaction.sourceAsset.findMany({
        where: { workspaceId: input.workspaceId },
        select: { objectKey: true },
      }),
      transaction.channel.findMany({
        where: { workspaceId: input.workspaceId },
        select: {
          id: true,
          tokenEnvelopeCiphertext: true,
          operationLeaseId: true,
          operationLeaseUntil: true,
        },
      }),
    ]);
    return {
      requestId: request.id,
      requestReference: request.requestReference,
      objectKeys: assets.map((entry) => entry.objectKey),
      channels,
      operationsInFlight: channels.some(
        (channel) =>
          channel.operationLeaseId !== null &&
          channel.operationLeaseUntil !== null &&
          channel.operationLeaseUntil > now,
      ),
    };
  });
}

export async function failWorkspaceDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly requestId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly failureCategory: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.dataDeletionRequest.updateMany({
      where: { id: input.requestId, workspaceId: input.workspaceId },
      data: { state: DataDeletionState.FAILED, failureCategory: input.failureCategory },
    });
    await transaction.workspace.updateMany({
      where: {
        id: input.workspaceId,
        lifecycleState: WorkspaceLifecycleState.DELETION_PENDING,
      },
      data: { lifecycleState: WorkspaceLifecycleState.ACTIVE },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "data.deletion_failed",
      targetType: "workspace",
      targetId: input.workspaceId,
      result: "failed",
      correlationId: input.correlationId,
      metadata: { failure_category: input.failureCategory },
    });
  });
}

export async function completeWorkspaceDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly requestId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly now?: Date;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.workspaceId}, 7))`;
    const request = await transaction.dataDeletionRequest.findFirst({
      where: { id: input.requestId, workspaceId: input.workspaceId },
    });
    if (!request || request.state === DataDeletionState.COMPLETED) return;
    const now = input.now ?? new Date();
    const activeOperation = await transaction.channel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        operationLeaseId: { not: null },
        operationLeaseUntil: { gt: now },
      },
      select: { id: true },
    });
    if (activeOperation) throw new Error("workspace_operations_in_flight");
    await transaction.outboxMessage.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.platformExecution.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.publishingIntent.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.approvalDecision.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.platformVersion.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.contentRevision.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.sourceAsset.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.content.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.channel.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.invitation.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.membership.deleteMany({ where: { workspaceId: input.workspaceId } });
    await transaction.session.updateMany({
      where: { currentWorkspaceId: input.workspaceId },
      data: { currentWorkspaceId: null },
    });
    await transaction.user.updateMany({
      where: { lastWorkspaceId: input.workspaceId },
      data: { lastWorkspaceId: null },
    });
    await transaction.$executeRaw`SELECT pseudonymize_workspace_audit(${input.workspaceId}::uuid, NULL::text[], true)`;
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
      },
      occurredAt: now,
    });
    await transaction.dataDeletionRequest.update({
      where: { id: request.id },
      data: {
        state: DataDeletionState.COMPLETED,
        requestedByUserId: null,
        failureCategory: null,
        completedAt: now,
      },
    });
    await transaction.workspace.update({
      where: { id: input.workspaceId },
      data: {
        name: `Deleted workspace ${request.requestReference}`,
        lifecycleState: WorkspaceLifecycleState.DELETED,
        deletedAt: now,
      },
    });
  });
}

export async function recordExpiredAuthorizedDataDeletion(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly correlationId: string;
    readonly now?: Date;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const now = input.now ?? new Date();
    const channel = await transaction.channel.findFirst({
      where: { id: input.channelId, workspaceId: input.workspaceId },
      select: { externalAccountId: true },
    });
    const authorizedAuditTargetIds = [input.channelId];
    if (channel?.externalAccountId) {
      const versions = await transaction.platformVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          platform: "YOUTUBE",
          accountReference: channel.externalAccountId,
        },
        select: { id: true },
      });
      const versionIds = versions.map((entry) => entry.id);
      if (versionIds.length) {
        const executions = await transaction.platformExecution.findMany({
          where: { workspaceId: input.workspaceId, platformVersionId: { in: versionIds } },
          select: { id: true },
        });
        authorizedAuditTargetIds.push(...executions.map((entry) => entry.id));
        await transaction.platformExecution.updateMany({
          where: { workspaceId: input.workspaceId, platformVersionId: { in: versionIds } },
          data: { providerId: null, providerUrl: null },
        });
        await transaction.platformVersion.updateMany({
          where: { id: { in: versionIds } },
          data: {
            accountReference: `expired:${input.channelId}`,
            accountDisplayName: "Expired YouTube authorization",
          },
        });
      }
    }
    await transaction.$executeRaw`SELECT pseudonymize_workspace_audit(${input.workspaceId}::uuid, ${authorizedAuditTargetIds}::text[], false)`;
    await transaction.channel.updateMany({
      where: { id: input.channelId, workspaceId: input.workspaceId },
      data: {
        state: ChannelState.REAUTHORIZATION_REQUIRED,
        externalAccountId: null,
        displayName: null,
        grantedScopes: [],
        tokenEnvelopeCiphertext: null,
        tokenCiphertextReference: null,
        authorizedAt: null,
        refreshedAt: null,
        authorizedDataExpiresAt: null,
        deniedAt: now,
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "data.retention_deleted",
      targetType: "channel",
      targetId: input.channelId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { reason: "refresh_failed", within_days: 30 },
    });
  });
}
