import { createHash } from "node:crypto";

import {
  ApprovalResult,
  ChannelState,
  ContentStatus,
  OutboxState,
  Platform,
  PlatformExecutionState,
  PrivacyStatus,
  PublishingIntentState,
  PublishingMode,
  SourceAssetStatus,
  ValidationStatus,
  type Prisma,
  type PrismaClient,
} from "./generated/client.js";
import { appendAudit, withTenant } from "./repository.js";

export interface PlatformExecutionView {
  readonly id: string;
  readonly state:
    | "not_started"
    | "publishing"
    | "processing"
    | "published"
    | "failed"
    | "needs_attention"
    | "cancelled";
  readonly failureCategory: string | null;
  readonly providerId: string | null;
  readonly providerUrl: string | null;
  readonly updatedAt: Date;
}

const executionStateToDomain: Readonly<
  Record<PlatformExecutionState, PlatformExecutionView["state"]>
> = {
  NOT_STARTED: "not_started",
  PUBLISHING: "publishing",
  PROCESSING: "processing",
  PUBLISHED: "published",
  FAILED: "failed",
  NEEDS_ATTENTION: "needs_attention",
  CANCELLED: "cancelled",
};

export function platformExecutionView(entry: {
  readonly id: string;
  readonly state: PlatformExecutionState;
  readonly failureCategory: string | null;
  readonly providerId: string | null;
  readonly providerUrl: string | null;
  readonly updatedAt: Date;
}): PlatformExecutionView {
  return {
    id: entry.id,
    state: executionStateToDomain[entry.state],
    failureCategory: entry.failureCategory,
    providerId: entry.providerId,
    providerUrl: entry.providerUrl,
    updatedAt: entry.updatedAt,
  };
}

function payloadHash(value: Prisma.InputJsonValue): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function confirmContentPublishing(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly contentId: string;
    readonly revisionId: string;
    readonly actorUserId: string;
    readonly consentVersion: string;
    readonly idempotencyKey: string;
    readonly correlationId: string;
  },
): Promise<{ readonly intentId: string; readonly executionId: string }> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.contentId}, 3))`;
    const existing = await transaction.publishingIntent.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: { executions: { select: { id: true } } },
    });
    if (existing) {
      if (
        existing.contentId !== input.contentId ||
        existing.revisionId !== input.revisionId ||
        existing.confirmedByUserId !== input.actorUserId
      ) {
        throw new Error("idempotency_conflict");
      }
      const execution = existing.executions[0];
      if (!execution) throw new Error("platform_execution_not_found");
      return { intentId: existing.id, executionId: execution.id };
    }
    const alreadyConfirmed = await transaction.publishingIntent.findFirst({
      where: {
        workspaceId: input.workspaceId,
        contentId: input.contentId,
        revisionId: input.revisionId,
      },
      include: { executions: { select: { id: true }, take: 1 } },
      orderBy: { confirmedAt: "desc" },
    });
    if (alreadyConfirmed) {
      const execution = alreadyConfirmed.executions[0];
      if (!execution) throw new Error("platform_execution_not_found");
      return { intentId: alreadyConfirmed.id, executionId: execution.id };
    }

    const content = await transaction.content.findUnique({
      where: { id: input.contentId, workspaceId: input.workspaceId },
      include: {
        sourceAsset: true,
        revisions: {
          where: { id: input.revisionId },
          include: { approvalDecision: true, platformVersions: true },
        },
      },
    });
    const revision = content?.revisions[0];
    const version = revision?.platformVersions[0];
    if (!content || !revision || !version) throw new Error("content_not_found");
    if (
      content.status !== ContentStatus.APPROVED ||
      content.currentRevisionNumber !== revision.revisionNumber ||
      revision.approvalDecision?.result !== ApprovalResult.APPROVED ||
      !content.sourceAsset ||
      content.sourceAsset.status !== SourceAssetStatus.COMPLETE ||
      !content.sourceAsset.mediaType.startsWith("video/") ||
      version.validationStatus !== ValidationStatus.VALID
    ) {
      throw new Error("content_not_publishable");
    }
    if (revision.platformVersions.length !== 1 || version.platform !== Platform.YOUTUBE) {
      throw new Error("unsupported_platform_selection");
    }
    if (version.privacyStatus !== PrivacyStatus.PRIVATE) {
      throw new Error("youtube_test_upload_must_be_private");
    }
    const channel = await transaction.channel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        platform: "youtube",
        externalAccountId: version.accountReference,
        state: ChannelState.CONNECTED,
      },
      select: { id: true },
    });
    if (!channel) throw new Error("connected_channel_not_found");

    const snapshot = {
      revision_id: revision.id,
      versions: [
        {
          platform_version_id: version.id,
          platform: "youtube",
          account_reference: version.accountReference,
          title: version.title,
          description: version.description,
          privacy_status: "private",
          made_for_kids: version.madeForKids,
        },
      ],
    } satisfies Prisma.InputJsonObject;
    const hash = payloadHash(snapshot);
    const confirmedAt = new Date();
    const intent = await transaction.publishingIntent.create({
      data: {
        workspaceId: input.workspaceId,
        contentId: content.id,
        revisionId: revision.id,
        platformVersionIds: [version.id],
        accountReferences: [version.accountReference],
        payloadSnapshot: snapshot,
        permissionDecision: "allowed",
        state: PublishingIntentState.READY,
        mode: PublishingMode.IMMEDIATE,
        confirmedByUserId: input.actorUserId,
        consentVersion: input.consentVersion,
        payloadHash: hash,
        idempotencyKey: input.idempotencyKey,
        confirmedAt,
      },
      select: { id: true },
    });
    const execution = await transaction.platformExecution.create({
      data: {
        workspaceId: input.workspaceId,
        publishingIntentId: intent.id,
        platformVersionId: version.id,
        operation: "publish",
        attempt: 1,
        idempotencyKey: `${input.idempotencyKey}:youtube`,
        state: PlatformExecutionState.NOT_STARTED,
      },
      select: { id: true },
    });
    await transaction.outboxMessage.create({
      data: {
        workspaceId: input.workspaceId,
        platformExecutionId: execution.id,
        topic: "platform.youtube.publish.v1",
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "publishing.confirmed",
      targetType: "publishing_intent",
      targetId: intent.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { platform: "youtube", execution_id: execution.id },
    });
    return { intentId: intent.id, executionId: execution.id };
  });
}

export interface ClaimedOutboxMessage {
  readonly id: string;
  readonly workspaceId: string;
  readonly platformExecutionId: string;
  readonly attempt: number;
}

export async function claimNextOutboxMessage(
  adminClient: PrismaClient,
): Promise<ClaimedOutboxMessage | null> {
  const rows = await adminClient.$queryRaw<
    {
      id: string;
      workspace_id: string;
      platform_execution_id: string;
      attempt: number;
    }[]
  >`
    UPDATE "outbox_messages"
    SET
      "state" = 'claimed'::"outbox_state",
      "claimed_at" = CURRENT_TIMESTAMP,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id"
      FROM "outbox_messages"
      WHERE
        (
          "state" = 'pending'::"outbox_state"
          OR ("state" = 'claimed'::"outbox_state" AND "claimed_at" < CURRENT_TIMESTAMP - INTERVAL '2 minutes')
        )
        AND "available_at" <= CURRENT_TIMESTAMP
      ORDER BY "available_at", "created_at"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "workspace_id", "platform_execution_id", "attempt"
  `;
  const row = rows[0];
  return row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        platformExecutionId: row.platform_execution_id,
        attempt: row.attempt,
      }
    : null;
}

export async function finishOutboxMessage(
  adminClient: PrismaClient,
  input: {
    readonly id: string;
    readonly outcome: "completed" | "retry" | "dead";
    readonly failureCategory?: string;
    readonly retryAfterSeconds?: number;
  },
): Promise<void> {
  const state =
    input.outcome === "completed"
      ? OutboxState.COMPLETED
      : input.outcome === "dead"
        ? OutboxState.DEAD
        : OutboxState.PENDING;
  await adminClient.outboxMessage.updateMany({
    where: { id: input.id, state: OutboxState.CLAIMED },
    data: {
      state,
      completedAt: input.outcome === "completed" ? new Date() : null,
      claimedAt: null,
      failureCategory: input.failureCategory ?? null,
      ...(input.outcome === "retry"
        ? {
            availableAt: new Date(Date.now() + (input.retryAfterSeconds ?? 5) * 1000),
            ...(input.failureCategory ? { attempt: { increment: 1 } } : {}),
          }
        : {}),
    },
  });
}

export async function renewOutboxMessageClaim(
  adminClient: PrismaClient,
  id: string,
): Promise<void> {
  await adminClient.outboxMessage.updateMany({
    where: { id, state: OutboxState.CLAIMED },
    data: { claimedAt: new Date() },
  });
}

const channelOperationLeaseMs = 2 * 60 * 1000;

export async function acquireYouTubeChannelOperationLease(
  client: PrismaClient,
  workspaceId: string,
  channelId: string,
  leaseId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await withTenant(client, workspaceId, (transaction) =>
    transaction.channel.updateMany({
      where: {
        id: channelId,
        workspaceId,
        state: ChannelState.CONNECTED,
        OR: [
          { operationLeaseUntil: null },
          { operationLeaseUntil: { lte: now } },
          { operationLeaseId: leaseId },
        ],
      },
      data: {
        operationLeaseId: leaseId,
        operationLeaseUntil: new Date(now.getTime() + channelOperationLeaseMs),
      },
    }),
  );
  return result.count === 1;
}

export async function renewYouTubeChannelOperationLease(
  client: PrismaClient,
  workspaceId: string,
  channelId: string,
  executionId: string,
): Promise<void> {
  await withTenant(client, workspaceId, (transaction) =>
    transaction.channel.updateMany({
      where: { id: channelId, workspaceId, operationLeaseId: executionId },
      data: { operationLeaseUntil: new Date(Date.now() + channelOperationLeaseMs) },
    }),
  );
}

export async function releaseYouTubeChannelOperationLease(
  client: PrismaClient,
  workspaceId: string,
  channelId: string,
  executionId: string,
): Promise<void> {
  await withTenant(client, workspaceId, (transaction) =>
    transaction.channel.updateMany({
      where: { id: channelId, workspaceId, operationLeaseId: executionId },
      data: { operationLeaseId: null, operationLeaseUntil: null },
    }),
  );
}

export interface YouTubeExecutionWorkItem {
  readonly executionId: string;
  readonly workspaceId: string;
  readonly state: PlatformExecutionView["state"];
  readonly providerId: string | null;
  readonly channelId: string;
  readonly tokenEnvelopeCiphertext: string;
  readonly objectKey: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly title: string;
  readonly description: string;
  readonly madeForKids: boolean;
}

export async function readYouTubeExecutionWorkItem(
  client: PrismaClient,
  workspaceId: string,
  executionId: string,
): Promise<YouTubeExecutionWorkItem> {
  return withTenant(client, workspaceId, async (transaction) => {
    const execution = await transaction.platformExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: {
        publishingIntent: true,
        platformVersion: {
          include: {
            revision: {
              include: { content: { include: { sourceAsset: true } }, approvalDecision: true },
            },
          },
        },
      },
    });
    if (!execution) throw new Error("platform_execution_not_found");
    if (execution.state === PlatformExecutionState.PUBLISHING && !execution.providerId) {
      throw new Error("execution_recovery_required");
    }
    const version = execution.platformVersion;
    const revision = version.revision;
    const content = revision.content;
    if (
      execution.operation !== "publish" ||
      execution.publishingIntent.state !== PublishingIntentState.READY ||
      content.status !== ContentStatus.APPROVED ||
      content.currentRevisionNumber !== revision.revisionNumber ||
      revision.approvalDecision?.result !== ApprovalResult.APPROVED ||
      version.platform !== Platform.YOUTUBE ||
      version.privacyStatus !== PrivacyStatus.PRIVATE ||
      version.validationStatus !== ValidationStatus.VALID ||
      !content.sourceAsset ||
      content.sourceAsset.status !== SourceAssetStatus.COMPLETE ||
      !content.sourceAsset.mediaType.startsWith("video/")
    ) {
      throw new Error("execution_not_authorized");
    }
    const channel = await transaction.channel.findFirst({
      where: {
        workspaceId,
        platform: "youtube",
        externalAccountId: version.accountReference,
        state: ChannelState.CONNECTED,
      },
    });
    if (!channel?.tokenEnvelopeCiphertext) throw new Error("channel_reauthorization_required");
    const leaseNow = new Date();
    const lease = await transaction.channel.updateMany({
      where: {
        id: channel.id,
        workspaceId,
        state: ChannelState.CONNECTED,
        OR: [
          { operationLeaseUntil: null },
          { operationLeaseUntil: { lte: leaseNow } },
          { operationLeaseId: execution.id },
        ],
      },
      data: {
        operationLeaseId: execution.id,
        operationLeaseUntil: new Date(leaseNow.getTime() + channelOperationLeaseMs),
      },
    });
    if (lease.count !== 1) throw new Error("channel_operation_busy");
    if (execution.state === PlatformExecutionState.NOT_STARTED) {
      await transaction.platformExecution.update({
        where: { id: execution.id },
        data: { state: PlatformExecutionState.PUBLISHING, failureCategory: null },
      });
      await appendAudit(transaction, {
        workspaceId,
        action: "platform.publish_started",
        targetType: "platform_execution",
        targetId: execution.id,
        result: "success",
        correlationId: execution.publishingIntent.id,
        metadata: { platform: "youtube", attempt: execution.attempt },
      });
    }
    return {
      executionId: execution.id,
      workspaceId,
      state:
        execution.state === PlatformExecutionState.NOT_STARTED
          ? "publishing"
          : executionStateToDomain[execution.state],
      providerId: execution.providerId,
      channelId: channel.id,
      tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
      objectKey: content.sourceAsset.objectKey,
      mediaType: content.sourceAsset.mediaType,
      byteSize: Number(content.sourceAsset.byteSize),
      title: version.title,
      description: version.description,
      madeForKids: version.madeForKids,
    };
  });
}

export async function resetYouTubeExecutionForRetry(
  client: PrismaClient,
  workspaceId: string,
  executionId: string,
): Promise<void> {
  await withTenant(client, workspaceId, (transaction) =>
    transaction.platformExecution.updateMany({
      where: {
        id: executionId,
        workspaceId,
        state: PlatformExecutionState.PUBLISHING,
        providerId: null,
      },
      data: { state: PlatformExecutionState.NOT_STARTED },
    }),
  );
}

export async function recordYouTubeUploadAccepted(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly providerId: string;
    readonly providerUrl: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        state: PlatformExecutionState.PUBLISHING,
      },
      data: {
        state: PlatformExecutionState.PROCESSING,
        providerId: input.providerId,
        providerUrl: input.providerUrl,
        failureCategory: null,
      },
    });
    if (updated.count !== 1) throw new Error("execution_not_publishing");
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "platform.uploaded",
      targetType: "platform_execution",
      targetId: input.executionId,
      result: "success",
      correlationId: input.executionId,
      metadata: { platform: "youtube", provider_reference_recorded: true },
    });
  });
}

export async function recordYouTubeExecutionPublished(
  client: PrismaClient,
  workspaceId: string,
  executionId: string,
): Promise<void> {
  await withTenant(client, workspaceId, async (transaction) => {
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: executionId,
        workspaceId,
        state: PlatformExecutionState.PROCESSING,
      },
      data: { state: PlatformExecutionState.PUBLISHED, failureCategory: null },
    });
    if (updated.count !== 1) throw new Error("execution_not_processing");
    await appendAudit(transaction, {
      workspaceId,
      action: "platform.published",
      targetType: "platform_execution",
      targetId: executionId,
      result: "success",
      correlationId: executionId,
      metadata: { platform: "youtube" },
    });
  });
}

export async function recordYouTubeExecutionFailure(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly failureCategory: string;
    readonly needsAttention: boolean;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        state: {
          notIn: [PlatformExecutionState.CANCELLED, PlatformExecutionState.PUBLISHED],
        },
      },
      data: {
        state: input.needsAttention
          ? PlatformExecutionState.NEEDS_ATTENTION
          : PlatformExecutionState.FAILED,
        failureCategory: input.failureCategory,
      },
    });
    if (updated.count !== 1) return;
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "platform.publish_failed",
      targetType: "platform_execution",
      targetId: input.executionId,
      result: "failed",
      correlationId: input.executionId,
      metadata: { platform: "youtube", failure_category: input.failureCategory },
    });
  });
}

export async function updateChannelTokenEnvelope(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly tokenEnvelopeCiphertext: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.channel.updateMany({
      where: { id: input.channelId, workspaceId: input.workspaceId, state: ChannelState.CONNECTED },
      data: { tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext, refreshedAt: new Date() },
    });
  });
}

export async function requireYouTubeReauthorization(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly executionId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const result = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        state: { in: [ChannelState.CONNECTED, ChannelState.CONNECTING] },
      },
      data: {
        state: ChannelState.REAUTHORIZATION_REQUIRED,
        tokenEnvelopeCiphertext: null,
        grantedScopes: [],
      },
    });
    if (result.count === 0) return;
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "channel.reauthorization_required",
      targetType: "channel",
      targetId: input.channelId,
      result: "failed",
      correlationId: input.executionId,
      metadata: { platform: "youtube", execution_id: input.executionId },
    });
  });
}
