import { createHash } from "node:crypto";

import {
  ApprovalResult,
  ChannelState,
  ContentStatus,
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
import {
  enqueueTokenKeyRetirement,
  pseudonymizePlatformAuthorizedData,
  pseudonymizeYouTubeAuthorizedData,
} from "./lifecycle-repository.js";
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
    readonly tikTokSettings?: {
      readonly privacyLevel: "SELF_ONLY";
      readonly disableComment: boolean;
      readonly disableDuet: boolean;
      readonly disableStitch: boolean;
      readonly brandContentToggle: false;
      readonly brandOrganicToggle: boolean;
      readonly isAigc: boolean;
      readonly musicUsageConfirmed: true;
      readonly creatorInfoConfirmed: true;
      readonly creatorUsername: string;
      readonly creatorNickname: string;
      readonly maximumVideoDurationSeconds: number;
    };
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
    if (
      revision.platformVersions.length !== 1 ||
      (version.platform !== Platform.YOUTUBE &&
        version.platform !== Platform.FACEBOOK &&
        version.platform !== Platform.TIKTOK)
    ) {
      throw new Error("unsupported_platform_selection");
    }
    if (version.platform === Platform.YOUTUBE && version.privacyStatus !== PrivacyStatus.PRIVATE) {
      throw new Error("youtube_test_upload_must_be_private");
    }
    if (
      version.platform === Platform.FACEBOOK &&
      (version.privacyStatus !== PrivacyStatus.PUBLIC || version.madeForKids)
    ) {
      throw new Error("facebook_page_publish_settings_invalid");
    }
    if (version.platform === Platform.FACEBOOK && content.sourceAsset.mediaType !== "video/mp4") {
      throw new Error("facebook_mp4_required");
    }
    if (
      version.platform === Platform.FACEBOOK &&
      content.sourceAsset.byteSize > BigInt(500 * 1024 * 1024)
    ) {
      throw new Error("facebook_video_too_large");
    }
    if (
      version.platform === Platform.TIKTOK &&
      (version.privacyStatus !== PrivacyStatus.UNSELECTED ||
        version.madeForKids ||
        content.sourceAsset.mediaType !== "video/mp4" ||
        content.sourceAsset.byteSize > BigInt(500 * 1024 * 1024) ||
        !content.sourceAsset.durationSeconds ||
        !input.tikTokSettings ||
        input.tikTokSettings.privacyLevel !== "SELF_ONLY" ||
        input.tikTokSettings.brandContentToggle ||
        !input.tikTokSettings.musicUsageConfirmed ||
        !input.tikTokSettings.creatorInfoConfirmed ||
        content.sourceAsset.durationSeconds > input.tikTokSettings.maximumVideoDurationSeconds)
    ) {
      throw new Error("tiktok_private_publish_settings_invalid");
    }
    const platform =
      version.platform === Platform.YOUTUBE
        ? "youtube"
        : version.platform === Platform.FACEBOOK
          ? "facebook"
          : "tiktok";
    const channel = await transaction.channel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        platform,
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
          platform,
          account_reference: version.accountReference,
          title: version.title,
          description: version.description,
          privacy_status:
            version.privacyStatus === PrivacyStatus.PRIVATE
              ? "private"
              : version.privacyStatus === PrivacyStatus.PUBLIC
                ? "public"
                : "unselected",
          made_for_kids: platform === "youtube" ? version.madeForKids : false,
          ...(platform === "tiktok"
            ? {
                tiktok_settings: {
                  ...input.tikTokSettings,
                  source: "FILE_UPLOAD",
                },
              }
            : {}),
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
        idempotencyKey: `${input.idempotencyKey}:${platform}`,
        state: PlatformExecutionState.NOT_STARTED,
      },
      select: { id: true },
    });
    await transaction.outboxMessage.create({
      data: {
        workspaceId: input.workspaceId,
        platformExecutionId: execution.id,
        topic: `platform.${platform}.publish.v1`,
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
      metadata: { platform, execution_id: execution.id },
    });
    return { intentId: intent.id, executionId: execution.id };
  });
}

export interface ClaimedOutboxMessage {
  readonly id: string;
  readonly workspaceId: string;
  readonly platformExecutionId: string;
  readonly attempt: number;
  readonly claimOwner: string;
  readonly claimGeneration: bigint;
  readonly topic:
    "platform.youtube.publish.v1" | "platform.facebook.publish.v1" | "platform.tiktok.publish.v1";
}

export interface ClaimedOutboxDispatch {
  readonly id: string;
  readonly workspaceId: string;
  readonly platformExecutionId: string;
  readonly topic: string;
  readonly dispatchOwner: string;
  readonly dispatchGeneration: bigint;
}

export async function claimNextOutboxForDispatch(
  workerClient: PrismaClient,
  dispatcherId: string,
): Promise<ClaimedOutboxDispatch | null> {
  const rows = await workerClient.$queryRaw<
    {
      id: string;
      workspace_id: string;
      platform_execution_id: string;
      topic: string;
      claim_owner: string;
      claim_generation: bigint;
    }[]
  >`
    UPDATE "outbox_messages"
    SET
      "state" = 'dispatching'::"outbox_state",
      "claimed_at" = CURRENT_TIMESTAMP,
      "claim_owner" = ${dispatcherId},
      "claim_until" = CURRENT_TIMESTAMP + INTERVAL '1 minute',
      "claim_generation" = "claim_generation" + 1,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id"
      FROM "outbox_messages"
      WHERE
        (
          "state" = 'pending'::"outbox_state"
          OR ("state" = 'dispatching'::"outbox_state" AND "claim_until" <= CURRENT_TIMESTAMP)
        )
        AND "available_at" <= CURRENT_TIMESTAMP
      ORDER BY "available_at", "created_at"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "workspace_id", "platform_execution_id", "topic", "claim_owner", "claim_generation"
  `;
  const row = rows[0];
  return row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        platformExecutionId: row.platform_execution_id,
        topic: row.topic,
        dispatchOwner: row.claim_owner,
        dispatchGeneration: row.claim_generation,
      }
    : null;
}

export async function completeOutboxDispatch(
  workerClient: PrismaClient,
  input: {
    readonly id: string;
    readonly dispatchOwner: string;
    readonly dispatchGeneration: bigint;
  },
): Promise<void> {
  const changed = await workerClient.$executeRaw`
    UPDATE "outbox_messages"
    SET "state" = 'dispatched'::"outbox_state",
        "claimed_at" = NULL,
        "claim_owner" = NULL,
        "claim_until" = NULL,
        "failure_category" = NULL,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.id}::uuid
      AND "state" = 'dispatching'::"outbox_state"
      AND "claim_owner" = ${input.dispatchOwner}
      AND "claim_generation" = ${input.dispatchGeneration}
      AND "claim_until" > CURRENT_TIMESTAMP
  `;
  if (changed === 1) return;
  const state = await workerClient.outboxMessage.findUnique({
    where: { id: input.id },
    select: { state: true },
  });
  if (state && ["CLAIMED", "COMPLETED", "DEAD"].includes(state.state)) return;
  throw new Error("outbox_dispatch_claim_lost");
}

export async function releaseOutboxDispatch(
  workerClient: PrismaClient,
  input: {
    readonly id: string;
    readonly dispatchOwner: string;
    readonly dispatchGeneration: bigint;
    readonly retryAfterSeconds: number;
    readonly failureCategory: string;
  },
): Promise<void> {
  const changed = await workerClient.$executeRaw`
    UPDATE "outbox_messages"
    SET "state" = 'pending'::"outbox_state",
        "claimed_at" = NULL,
        "claim_owner" = NULL,
        "claim_until" = NULL,
        "failure_category" = ${input.failureCategory},
        "available_at" = CURRENT_TIMESTAMP + (${input.retryAfterSeconds} * INTERVAL '1 second'),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.id}::uuid
      AND "state" = 'dispatching'::"outbox_state"
      AND "claim_owner" = ${input.dispatchOwner}
      AND "claim_generation" = ${input.dispatchGeneration}
  `;
  if (changed !== 1) throw new Error("outbox_dispatch_claim_lost");
}

export type QueuedOutboxClaimResult =
  | { readonly kind: "claimed"; readonly message: ClaimedOutboxMessage }
  | { readonly kind: "busy" | "terminal" | "missing" };

export async function claimQueuedOutboxMessage(
  workerClient: PrismaClient,
  input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly platformExecutionId: string;
    readonly workerId: string;
  },
): Promise<QueuedOutboxClaimResult> {
  const rows = await workerClient.$queryRaw<
    {
      id: string;
      workspace_id: string;
      platform_execution_id: string;
      attempt: number;
      claim_owner: string;
      claim_generation: bigint;
      topic: string;
    }[]
  >`
    UPDATE "outbox_messages"
    SET "state" = 'claimed'::"outbox_state",
        "claimed_at" = CURRENT_TIMESTAMP,
        "claim_owner" = ${input.workerId},
        "claim_until" = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
        "claim_generation" = "claim_generation" + 1,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.id}::uuid
      AND "workspace_id" = ${input.workspaceId}::uuid
      AND "platform_execution_id" = ${input.platformExecutionId}::uuid
      AND (
        "state" IN ('dispatching'::"outbox_state", 'dispatched'::"outbox_state")
        OR ("state" = 'claimed'::"outbox_state" AND "claim_until" <= CURRENT_TIMESTAMP)
      )
    RETURNING "id", "workspace_id", "platform_execution_id", "attempt", "claim_owner", "claim_generation", "topic"
  `;
  const row = rows[0];
  if (row) {
    return {
      kind: "claimed",
      message: {
        id: row.id,
        workspaceId: row.workspace_id,
        platformExecutionId: row.platform_execution_id,
        attempt: row.attempt,
        claimOwner: row.claim_owner,
        claimGeneration: row.claim_generation,
        topic:
          row.topic === "platform.facebook.publish.v1"
            ? "platform.facebook.publish.v1"
            : row.topic === "platform.tiktok.publish.v1"
              ? "platform.tiktok.publish.v1"
              : "platform.youtube.publish.v1",
      },
    };
  }
  const existing = await workerClient.outboxMessage.findUnique({
    where: { id: input.id },
    select: { workspaceId: true, platformExecutionId: true, state: true },
  });
  if (!existing) return { kind: "missing" };
  if (
    existing.workspaceId !== input.workspaceId ||
    existing.platformExecutionId !== input.platformExecutionId
  ) {
    return { kind: "missing" };
  }
  return ["COMPLETED", "DEAD"].includes(existing.state) ? { kind: "terminal" } : { kind: "busy" };
}

export async function claimNextOutboxMessage(
  workerClient: PrismaClient,
  workerId: string,
): Promise<ClaimedOutboxMessage | null> {
  const rows = await workerClient.$queryRaw<
    {
      id: string;
      workspace_id: string;
      platform_execution_id: string;
      attempt: number;
      claim_owner: string;
      claim_generation: bigint;
      topic: string;
    }[]
  >`
    UPDATE "outbox_messages"
    SET
      "state" = 'claimed'::"outbox_state",
      "claimed_at" = CURRENT_TIMESTAMP,
      "claim_owner" = ${workerId},
      "claim_until" = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
      "claim_generation" = "claim_generation" + 1,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id"
      FROM "outbox_messages"
      WHERE
        (
          "state" = 'pending'::"outbox_state"
          OR ("state" = 'claimed'::"outbox_state" AND "claim_until" <= CURRENT_TIMESTAMP)
        )
        AND "available_at" <= CURRENT_TIMESTAMP
      ORDER BY "available_at", "created_at"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "workspace_id", "platform_execution_id", "attempt", "claim_owner", "claim_generation", "topic"
  `;
  const row = rows[0];
  return row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        platformExecutionId: row.platform_execution_id,
        attempt: row.attempt,
        claimOwner: row.claim_owner,
        claimGeneration: row.claim_generation,
        topic:
          row.topic === "platform.facebook.publish.v1"
            ? "platform.facebook.publish.v1"
            : row.topic === "platform.tiktok.publish.v1"
              ? "platform.tiktok.publish.v1"
              : "platform.youtube.publish.v1",
      }
    : null;
}

export async function finishOutboxMessage(
  workerClient: PrismaClient,
  input: {
    readonly id: string;
    readonly outcome: "completed" | "retry" | "dead";
    readonly failureCategory?: string;
    readonly retryAfterSeconds?: number;
    readonly claimOwner: string;
    readonly claimGeneration: bigint;
  },
): Promise<void> {
  if (input.outcome === "retry") {
    const retryAfterSeconds = input.retryAfterSeconds ?? 5;
    const attemptIncrement = input.failureCategory ? 1 : 0;
    const changed = await workerClient.$executeRaw`
      UPDATE "outbox_messages"
      SET
        "state" = 'pending'::"outbox_state",
        "completed_at" = NULL,
        "claimed_at" = NULL,
        "claim_owner" = NULL,
        "claim_until" = NULL,
        "failure_category" = ${input.failureCategory ?? null},
        "available_at" = CURRENT_TIMESTAMP + (${retryAfterSeconds} * INTERVAL '1 second'),
        "attempt" = "attempt" + ${attemptIncrement},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE
        "id" = ${input.id}::uuid
        AND "state" = 'claimed'::"outbox_state"
        AND "claim_owner" = ${input.claimOwner}
        AND "claim_generation" = ${input.claimGeneration}
        AND "claim_until" > CURRENT_TIMESTAMP
    `;
    if (changed !== 1) throw new Error("outbox_claim_lost");
    return;
  }

  const state = input.outcome === "completed" ? "completed" : "dead";
  const changed = await workerClient.$executeRaw`
    UPDATE "outbox_messages"
    SET
      "state" = ${state}::"outbox_state",
      "completed_at" = CURRENT_TIMESTAMP,
      "claimed_at" = NULL,
      "claim_owner" = NULL,
      "claim_until" = NULL,
      "failure_category" = ${input.failureCategory ?? null},
      "updated_at" = CURRENT_TIMESTAMP
    WHERE
      "id" = ${input.id}::uuid
      AND "state" = 'claimed'::"outbox_state"
      AND "claim_owner" = ${input.claimOwner}
      AND "claim_generation" = ${input.claimGeneration}
      AND "claim_until" > CURRENT_TIMESTAMP
  `;
  if (changed !== 1) throw new Error("outbox_claim_lost");
}

export async function renewOutboxMessageClaim(
  workerClient: PrismaClient,
  input: { readonly id: string; readonly claimOwner: string; readonly claimGeneration: bigint },
): Promise<boolean> {
  const changed = await workerClient.$executeRaw`
    UPDATE "outbox_messages"
    SET "claimed_at" = CURRENT_TIMESTAMP,
        "claim_until" = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.id}::uuid
      AND "state" = 'claimed'::outbox_state
      AND "claim_owner" = ${input.claimOwner}
      AND "claim_generation" = ${input.claimGeneration}
      AND "claim_until" > CURRENT_TIMESTAMP
  `;
  return changed === 1;
}

const channelOperationLeaseMs = 2 * 60 * 1000;

export async function acquireYouTubeChannelOperationLease(
  client: PrismaClient,
  workspaceId: string,
  channelId: string,
  leaseId: string,
): Promise<bigint | null> {
  return withTenant(client, workspaceId, async (transaction) => {
    const rows = await transaction.$queryRaw<{ operation_generation: bigint }[]>`
      UPDATE channels
      SET operation_lease_id = ${leaseId}::uuid,
          operation_lease_until = CURRENT_TIMESTAMP + (${channelOperationLeaseMs} * INTERVAL '1 millisecond'),
          operation_lease_generation = operation_generation,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${channelId}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND state = 'connected'::channel_state
        AND (
          operation_lease_until IS NULL
          OR operation_lease_until <= CURRENT_TIMESTAMP
          OR operation_lease_id = ${leaseId}::uuid
        )
      RETURNING operation_generation
    `;
    return rows[0]?.operation_generation ?? null;
  });
}

export async function renewYouTubeChannelOperationLease(
  client: PrismaClient,
  workspaceId: string,
  channelId: string,
  executionId: string,
  leaseGeneration: bigint,
): Promise<boolean> {
  return withTenant(client, workspaceId, async (transaction) => {
    const changed = await transaction.$executeRaw`
      UPDATE channels
      SET operation_lease_until = CURRENT_TIMESTAMP + (${channelOperationLeaseMs} * INTERVAL '1 millisecond'),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${channelId}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND state = 'connected'::channel_state
        AND operation_lease_id = ${executionId}::uuid
        AND operation_generation = ${leaseGeneration}
        AND operation_lease_generation = ${leaseGeneration}
        AND operation_lease_until > CURRENT_TIMESTAMP
    `;
    return changed === 1;
  });
}

export async function releaseYouTubeChannelOperationLease(
  client: PrismaClient,
  workspaceId: string,
  channelId: string,
  executionId: string,
  leaseGeneration: bigint,
): Promise<void> {
  await withTenant(client, workspaceId, (transaction) =>
    transaction.channel.updateMany({
      where: {
        id: channelId,
        workspaceId,
        operationLeaseId: executionId,
        operationLeaseGeneration: leaseGeneration,
      },
      data: {
        operationLeaseId: null,
        operationLeaseUntil: null,
        operationLeaseGeneration: null,
      },
    }),
  );
}

export interface YouTubeExecutionWorkItem {
  readonly executionId: string;
  readonly platform: "youtube" | "facebook" | "tiktok";
  readonly workspaceId: string;
  readonly state: PlatformExecutionView["state"];
  readonly providerId: string | null;
  readonly channelId: string;
  readonly externalAccountId: string;
  readonly tokenEnvelopeCiphertext: string;
  readonly tokenCiphertextReference: string | null;
  readonly leaseGeneration: bigint;
  readonly objectKey: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly durationSeconds: number | null;
  readonly sha256: string;
  readonly title: string;
  readonly description: string;
  readonly madeForKids: boolean;
  readonly tikTokSettings?: {
    readonly privacyLevel: "SELF_ONLY";
    readonly disableComment: boolean;
    readonly disableDuet: boolean;
    readonly disableStitch: boolean;
    readonly brandContentToggle: false;
    readonly brandOrganicToggle: boolean;
    readonly isAigc: boolean;
    readonly musicUsageConfirmed: true;
    readonly creatorInfoConfirmed: true;
    readonly creatorUsername: string;
    readonly creatorNickname: string;
    readonly maximumVideoDurationSeconds: number;
  };
}

export async function readYouTubeExecutionWorkItem(
  client: PrismaClient,
  workspaceId: string,
  executionId: string,
): Promise<YouTubeExecutionWorkItem> {
  return readPlatformExecutionWorkItem(client, workspaceId, executionId, Platform.YOUTUBE);
}

export async function readFacebookExecutionWorkItem(
  client: PrismaClient,
  workspaceId: string,
  executionId: string,
): Promise<YouTubeExecutionWorkItem> {
  return readPlatformExecutionWorkItem(client, workspaceId, executionId, Platform.FACEBOOK);
}

export async function readTikTokExecutionWorkItem(
  client: PrismaClient,
  workspaceId: string,
  executionId: string,
): Promise<YouTubeExecutionWorkItem> {
  return readPlatformExecutionWorkItem(client, workspaceId, executionId, Platform.TIKTOK);
}

function tikTokSettingsFromSnapshot(
  value: Prisma.JsonValue,
): YouTubeExecutionWorkItem["tikTokSettings"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const versions = "versions" in value && Array.isArray(value.versions) ? value.versions : [];
  const version = versions[0];
  if (typeof version !== "object" || version === null || Array.isArray(version)) return undefined;
  const settings = "tiktok_settings" in version ? version.tiktok_settings : undefined;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings))
    return undefined;
  if (
    settings.privacyLevel !== "SELF_ONLY" ||
    typeof settings.disableComment !== "boolean" ||
    typeof settings.disableDuet !== "boolean" ||
    typeof settings.disableStitch !== "boolean" ||
    settings.brandContentToggle !== false ||
    typeof settings.brandOrganicToggle !== "boolean" ||
    typeof settings.isAigc !== "boolean" ||
    settings.musicUsageConfirmed !== true ||
    settings.creatorInfoConfirmed !== true ||
    typeof settings.creatorUsername !== "string" ||
    typeof settings.creatorNickname !== "string" ||
    typeof settings.maximumVideoDurationSeconds !== "number"
  ) {
    return undefined;
  }
  return {
    privacyLevel: "SELF_ONLY",
    disableComment: settings.disableComment,
    disableDuet: settings.disableDuet,
    disableStitch: settings.disableStitch,
    brandContentToggle: false,
    brandOrganicToggle: settings.brandOrganicToggle,
    isAigc: settings.isAigc,
    musicUsageConfirmed: true,
    creatorInfoConfirmed: true,
    creatorUsername: settings.creatorUsername,
    creatorNickname: settings.creatorNickname,
    maximumVideoDurationSeconds: settings.maximumVideoDurationSeconds,
  };
}

async function readPlatformExecutionWorkItem(
  client: PrismaClient,
  workspaceId: string,
  executionId: string,
  expectedPlatform: Platform,
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
    if (
      execution.state === PlatformExecutionState.PUBLISHED ||
      execution.state === PlatformExecutionState.CANCELLED ||
      execution.state === PlatformExecutionState.FAILED ||
      execution.state === PlatformExecutionState.NEEDS_ATTENTION
    ) {
      throw new Error("execution_terminal");
    }
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
      version.platform !== expectedPlatform ||
      (expectedPlatform === Platform.YOUTUBE && version.privacyStatus !== PrivacyStatus.PRIVATE) ||
      (expectedPlatform === Platform.FACEBOOK &&
        (version.privacyStatus !== PrivacyStatus.PUBLIC || version.madeForKids)) ||
      (expectedPlatform === Platform.TIKTOK &&
        (version.privacyStatus !== PrivacyStatus.UNSELECTED || version.madeForKids)) ||
      version.validationStatus !== ValidationStatus.VALID ||
      !content.sourceAsset ||
      content.sourceAsset.status !== SourceAssetStatus.COMPLETE ||
      !content.sourceAsset.mediaType.startsWith("video/")
    ) {
      throw new Error("execution_not_authorized");
    }
    if (expectedPlatform === Platform.FACEBOOK && content.sourceAsset.mediaType !== "video/mp4") {
      throw new Error("facebook_mp4_required");
    }
    if (
      expectedPlatform === Platform.FACEBOOK &&
      content.sourceAsset.byteSize > BigInt(500 * 1024 * 1024)
    ) {
      throw new Error("facebook_video_too_large");
    }
    const tikTokSettings =
      expectedPlatform === Platform.TIKTOK
        ? tikTokSettingsFromSnapshot(execution.publishingIntent.payloadSnapshot)
        : undefined;
    if (
      expectedPlatform === Platform.TIKTOK &&
      (content.sourceAsset.mediaType !== "video/mp4" ||
        content.sourceAsset.byteSize > BigInt(500 * 1024 * 1024) ||
        !content.sourceAsset.durationSeconds ||
        !tikTokSettings ||
        content.sourceAsset.durationSeconds > tikTokSettings.maximumVideoDurationSeconds)
    ) {
      throw new Error("tiktok_private_publish_settings_invalid");
    }
    const platform =
      expectedPlatform === Platform.YOUTUBE
        ? "youtube"
        : expectedPlatform === Platform.FACEBOOK
          ? "facebook"
          : "tiktok";
    const channel = await transaction.channel.findFirst({
      where: {
        workspaceId,
        platform,
        externalAccountId: version.accountReference,
        state: ChannelState.CONNECTED,
      },
    });
    if (!channel?.tokenEnvelopeCiphertext || !channel.externalAccountId) {
      throw new Error("channel_reauthorization_required");
    }
    const leaseRows = await transaction.$queryRaw<{ operation_generation: bigint }[]>`
      UPDATE channels
      SET operation_lease_id = ${execution.id}::uuid,
          operation_lease_until = CURRENT_TIMESTAMP + (${channelOperationLeaseMs} * INTERVAL '1 millisecond'),
          operation_lease_generation = operation_generation,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${channel.id}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND state = 'connected'::channel_state
        AND (
          operation_lease_until IS NULL
          OR operation_lease_until <= CURRENT_TIMESTAMP
          OR operation_lease_id = ${execution.id}::uuid
        )
      RETURNING operation_generation
    `;
    const leaseGeneration = leaseRows[0]?.operation_generation;
    if (leaseGeneration === undefined) throw new Error("channel_operation_busy");
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
        metadata: { platform, attempt: execution.attempt },
      });
    }
    return {
      executionId: execution.id,
      platform,
      workspaceId,
      state:
        execution.state === PlatformExecutionState.NOT_STARTED
          ? "publishing"
          : executionStateToDomain[execution.state],
      providerId: execution.providerId,
      channelId: channel.id,
      externalAccountId: channel.externalAccountId,
      tokenEnvelopeCiphertext: channel.tokenEnvelopeCiphertext,
      tokenCiphertextReference: channel.tokenCiphertextReference,
      leaseGeneration,
      objectKey: content.sourceAsset.objectKey,
      mediaType: content.sourceAsset.mediaType,
      byteSize: Number(content.sourceAsset.byteSize),
      durationSeconds: content.sourceAsset.durationSeconds,
      sha256: content.sourceAsset.sha256,
      title: version.title,
      description: version.description,
      madeForKids: version.madeForKids,
      ...(tikTokSettings ? { tikTokSettings } : {}),
    };
  });
}

export async function resetYouTubeExecutionForRetry(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertYouTubePublishFence(transaction, input);
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        state: PlatformExecutionState.PUBLISHING,
        providerId: null,
      },
      data: { state: PlatformExecutionState.NOT_STARTED },
    });
    if (updated.count !== 1) throw new Error("execution_retry_reset_rejected");
  });
}

async function assertYouTubePublishFence(
  transaction: Prisma.TransactionClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly executionId: string;
    readonly leaseGeneration: bigint;
  },
): Promise<void> {
  const rows = await transaction.$queryRaw<{ valid: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM channels
      WHERE id = ${input.channelId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid
        AND state = 'connected'::channel_state
        AND operation_lease_id = ${input.executionId}::uuid
        AND operation_generation = ${input.leaseGeneration}
        AND operation_lease_generation = ${input.leaseGeneration}
        AND operation_lease_until > CURRENT_TIMESTAMP
    ) AS valid
  `;
  if (!rows[0]?.valid) throw new Error("publish_fence_lost");
}

export async function recordTikTokPublishInitialized(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly publishId: string;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertYouTubePublishFence(transaction, input);
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        state: PlatformExecutionState.PUBLISHING,
        providerId: null,
      },
      data: {
        providerId: input.publishId,
        providerUrl: null,
        failureCategory: null,
      },
    });
    if (updated.count !== 1) throw new Error("tiktok_publish_initialization_superseded");
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "platform.publish_initialized",
      targetType: "platform_execution",
      targetId: input.executionId,
      result: "success",
      correlationId: input.executionId,
      metadata: { platform: "tiktok", provider_reference_recorded: true },
    });
  });
}

export async function recordTikTokUploadCompleted(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly publishId: string;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertYouTubePublishFence(transaction, input);
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        state: PlatformExecutionState.PUBLISHING,
        providerId: input.publishId,
        platformVersion: { platform: Platform.TIKTOK },
      },
      data: { state: PlatformExecutionState.PROCESSING, failureCategory: null },
    });
    if (updated.count !== 1) throw new Error("tiktok_upload_completion_superseded");
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "platform.uploaded",
      targetType: "platform_execution",
      targetId: input.executionId,
      result: "success",
      correlationId: input.executionId,
      metadata: { platform: "tiktok", provider_reference_recorded: true },
    });
  });
}

export async function recordYouTubeUploadAccepted(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly providerId: string;
    readonly providerUrl: string;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertYouTubePublishFence(transaction, input);
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
      metadata: { platform: input.platform ?? "youtube", provider_reference_recorded: true },
    });
  });
}

export async function recordYouTubeExecutionPublished(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertYouTubePublishFence(transaction, input);
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        state: PlatformExecutionState.PROCESSING,
      },
      data: { state: PlatformExecutionState.PUBLISHED, failureCategory: null },
    });
    if (updated.count !== 1) throw new Error("execution_not_processing");
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "platform.published",
      targetType: "platform_execution",
      targetId: input.executionId,
      result: "success",
      correlationId: input.executionId,
      metadata: { platform: input.platform ?? "youtube" },
    });
  });
}

export async function recordYouTubeExecutionPublishedAndCompleteOutbox(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
    readonly outboxMessageId: string;
    readonly claimOwner: string;
    readonly claimGeneration: bigint;
    readonly platform?: "youtube" | "facebook" | "tiktok";
    readonly completedProviderId?: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertYouTubePublishFence(transaction, input);
    const execution = await transaction.platformExecution.findFirst({
      where: { id: input.executionId, workspaceId: input.workspaceId },
      select: { state: true },
    });
    if (!execution) throw new Error("platform_execution_not_found");
    if (execution.state === PlatformExecutionState.PROCESSING) {
      const updated = await transaction.platformExecution.updateMany({
        where: {
          id: input.executionId,
          workspaceId: input.workspaceId,
          state: PlatformExecutionState.PROCESSING,
        },
        data: {
          state: PlatformExecutionState.PUBLISHED,
          failureCategory: null,
          ...(input.completedProviderId ? { providerId: input.completedProviderId } : {}),
        },
      });
      if (updated.count !== 1) throw new Error("execution_not_processing");
      await appendAudit(transaction, {
        workspaceId: input.workspaceId,
        action: "platform.published",
        targetType: "platform_execution",
        targetId: input.executionId,
        result: "success",
        correlationId: input.executionId,
        metadata: { platform: input.platform ?? "youtube" },
      });
    } else if (execution.state !== PlatformExecutionState.PUBLISHED) {
      throw new Error("execution_not_processing");
    }
    const completed = await transaction.$executeRaw`
      UPDATE "outbox_messages"
      SET
        "state" = 'completed'::"outbox_state",
        "completed_at" = CURRENT_TIMESTAMP,
        "claimed_at" = NULL,
        "claim_owner" = NULL,
        "claim_until" = NULL,
        "failure_category" = NULL,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE
        "id" = ${input.outboxMessageId}::uuid
        AND "workspace_id" = ${input.workspaceId}::uuid
        AND "platform_execution_id" = ${input.executionId}::uuid
        AND "state" = 'claimed'::"outbox_state"
        AND "claim_owner" = ${input.claimOwner}
        AND "claim_generation" = ${input.claimGeneration}
        AND "claim_until" > CURRENT_TIMESTAMP
    `;
    if (completed !== 1) throw new Error("outbox_claim_lost");
  });
}

export async function recordYouTubeExecutionFailure(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly failureCategory: string;
    readonly needsAttention: boolean;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await assertYouTubePublishFence(transaction, input);
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
      metadata: { platform: input.platform ?? "youtube", failure_category: input.failureCategory },
    });
  });
}

export async function recordYouTubeExecutionFailureAndCompleteOutbox(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly failureCategory: string;
    readonly needsAttention: boolean;
    readonly requireReauthorization: boolean;
    readonly channelId: string;
    readonly leaseGeneration: bigint;
    readonly outboxMessageId: string;
    readonly claimOwner: string;
    readonly claimGeneration: bigint;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    await assertYouTubePublishFence(transaction, input);
    const execution = await transaction.platformExecution.findFirst({
      where: { id: input.executionId, workspaceId: input.workspaceId },
      select: { state: true },
    });
    if (!execution) throw new Error("platform_execution_not_found");
    if (
      execution.state === PlatformExecutionState.PUBLISHED ||
      execution.state === PlatformExecutionState.CANCELLED
    ) {
      throw new Error("execution_failure_superseded");
    }
    if (
      execution.state !== PlatformExecutionState.FAILED &&
      execution.state !== PlatformExecutionState.NEEDS_ATTENTION
    ) {
      await transaction.platformExecution.update({
        where: { id: input.executionId },
        data: {
          state: input.needsAttention
            ? PlatformExecutionState.NEEDS_ATTENTION
            : PlatformExecutionState.FAILED,
          failureCategory: input.failureCategory,
        },
      });
      await appendAudit(transaction, {
        workspaceId: input.workspaceId,
        action: "platform.publish_failed",
        targetType: "platform_execution",
        targetId: input.executionId,
        result: "failed",
        correlationId: input.executionId,
        metadata: {
          platform: input.platform ?? "youtube",
          failure_category: input.failureCategory,
        },
      });
    }
    if (input.requireReauthorization) {
      await requireYouTubeReauthorizationInTransaction(transaction, input);
    }
    const completed = await transaction.$executeRaw`
      UPDATE "outbox_messages"
      SET "state" = 'dead'::"outbox_state",
          "completed_at" = CURRENT_TIMESTAMP,
          "claimed_at" = NULL,
          "claim_owner" = NULL,
          "claim_until" = NULL,
          "failure_category" = ${input.failureCategory},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.outboxMessageId}::uuid
        AND "workspace_id" = ${input.workspaceId}::uuid
        AND "platform_execution_id" = ${input.executionId}::uuid
        AND "state" = 'claimed'::"outbox_state"
        AND "claim_owner" = ${input.claimOwner}
        AND "claim_generation" = ${input.claimGeneration}
        AND "claim_until" > CURRENT_TIMESTAMP
    `;
    if (completed !== 1) throw new Error("outbox_claim_lost");
  });
}

export async function recordClaimedYouTubeExecutionFailure(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly outboxMessageId: string;
    readonly claimOwner: string;
    readonly claimGeneration: bigint;
    readonly failureCategory: string;
    readonly needsAttention: boolean;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const claim = await transaction.$queryRaw<{ valid: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM "outbox_messages"
        WHERE "id" = ${input.outboxMessageId}::uuid
          AND "workspace_id" = ${input.workspaceId}::uuid
          AND "platform_execution_id" = ${input.executionId}::uuid
          AND "state" = 'claimed'::"outbox_state"
          AND "claim_owner" = ${input.claimOwner}
          AND "claim_generation" = ${input.claimGeneration}
          AND "claim_until" > CURRENT_TIMESTAMP
      ) AS valid
    `;
    if (!claim[0]?.valid) throw new Error("outbox_claim_lost");
    const execution = await transaction.platformExecution.findFirst({
      where: { id: input.executionId, workspaceId: input.workspaceId },
      select: { state: true, publishingIntentId: true },
    });
    if (!execution) throw new Error("platform_execution_not_found");
    if (
      execution.state === PlatformExecutionState.PUBLISHED ||
      execution.state === PlatformExecutionState.CANCELLED ||
      execution.state === PlatformExecutionState.FAILED ||
      execution.state === PlatformExecutionState.NEEDS_ATTENTION
    ) {
      return;
    }
    const updated = await transaction.platformExecution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        state: { in: [PlatformExecutionState.NOT_STARTED, PlatformExecutionState.PUBLISHING] },
        providerId: null,
      },
      data: {
        state: input.needsAttention
          ? PlatformExecutionState.NEEDS_ATTENTION
          : PlatformExecutionState.FAILED,
        failureCategory: input.failureCategory,
      },
    });
    if (updated.count !== 1) throw new Error("execution_recovery_superseded");
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      action: "platform.publish_failed",
      targetType: "platform_execution",
      targetId: input.executionId,
      result: "failed",
      correlationId: execution.publishingIntentId,
      metadata: { platform: input.platform ?? "youtube", failure_category: input.failureCategory },
    });
  });
}

export async function recordClaimedYouTubeExecutionFailureAndCompleteOutbox(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly outboxMessageId: string;
    readonly claimOwner: string;
    readonly claimGeneration: bigint;
    readonly failureCategory: string;
    readonly needsAttention: boolean;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    const claim = await transaction.$queryRaw<{ valid: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "outbox_messages"
        WHERE "id" = ${input.outboxMessageId}::uuid
          AND "workspace_id" = ${input.workspaceId}::uuid
          AND "platform_execution_id" = ${input.executionId}::uuid
          AND "state" = 'claimed'::"outbox_state"
          AND "claim_owner" = ${input.claimOwner}
          AND "claim_generation" = ${input.claimGeneration}
          AND "claim_until" > CURRENT_TIMESTAMP
      ) AS valid
    `;
    if (!claim[0]?.valid) throw new Error("outbox_claim_lost");
    const execution = await transaction.platformExecution.findFirst({
      where: { id: input.executionId, workspaceId: input.workspaceId },
      select: { state: true, publishingIntentId: true },
    });
    if (!execution) throw new Error("platform_execution_not_found");
    const alreadyTerminal =
      execution.state === PlatformExecutionState.PUBLISHED ||
      execution.state === PlatformExecutionState.CANCELLED ||
      execution.state === PlatformExecutionState.FAILED ||
      execution.state === PlatformExecutionState.NEEDS_ATTENTION;
    if (!alreadyTerminal) {
      const updated = await transaction.platformExecution.updateMany({
        where: {
          id: input.executionId,
          workspaceId: input.workspaceId,
          state: {
            in: [
              PlatformExecutionState.NOT_STARTED,
              PlatformExecutionState.PUBLISHING,
              PlatformExecutionState.PROCESSING,
            ],
          },
        },
        data: {
          state: input.needsAttention
            ? PlatformExecutionState.NEEDS_ATTENTION
            : PlatformExecutionState.FAILED,
          failureCategory: input.failureCategory,
        },
      });
      if (updated.count !== 1) throw new Error("execution_recovery_superseded");
      await appendAudit(transaction, {
        workspaceId: input.workspaceId,
        action: "platform.publish_failed",
        targetType: "platform_execution",
        targetId: input.executionId,
        result: "failed",
        correlationId: execution.publishingIntentId,
        metadata: {
          platform: input.platform ?? "youtube",
          failure_category: input.failureCategory,
        },
      });
    }
    const published = execution.state === PlatformExecutionState.PUBLISHED;
    const completed = await transaction.$executeRaw`
      UPDATE "outbox_messages"
      SET "state" = ${published ? "completed" : "dead"}::"outbox_state",
          "completed_at" = CURRENT_TIMESTAMP,
          "claimed_at" = NULL,
          "claim_owner" = NULL,
          "claim_until" = NULL,
          "failure_category" = ${published ? null : input.failureCategory},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.outboxMessageId}::uuid
        AND "workspace_id" = ${input.workspaceId}::uuid
        AND "platform_execution_id" = ${input.executionId}::uuid
        AND "state" = 'claimed'::"outbox_state"
        AND "claim_owner" = ${input.claimOwner}
        AND "claim_generation" = ${input.claimGeneration}
        AND "claim_until" > CURRENT_TIMESTAMP
    `;
    if (completed !== 1) throw new Error("outbox_claim_lost");
  });
}

export async function updateChannelTokenEnvelope(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly tokenEnvelopeCiphertext: string;
    readonly tokenCiphertextReference: string;
    readonly expectedTokenCiphertextReference: string | null;
    readonly executionId: string;
    readonly leaseGeneration: bigint;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    await assertYouTubePublishFence(transaction, input);
    const updated = await transaction.channel.updateMany({
      where: {
        id: input.channelId,
        workspaceId: input.workspaceId,
        state: ChannelState.CONNECTED,
        tokenCiphertextReference: input.expectedTokenCiphertextReference,
      },
      data: {
        tokenEnvelopeCiphertext: input.tokenEnvelopeCiphertext,
        tokenCiphertextReference: input.tokenCiphertextReference,
        refreshedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("publish_fence_lost");
    await enqueueTokenKeyRetirement(transaction, {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      keyReference: input.expectedTokenCiphertextReference,
      correlationId: input.executionId,
    });
  });
}

async function requireYouTubeReauthorizationInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly executionId: string;
    readonly leaseGeneration: bigint;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  const channel = await transaction.channel.findFirst({
    where: {
      id: input.channelId,
      workspaceId: input.workspaceId,
      state: { in: [ChannelState.CONNECTED, ChannelState.CONNECTING] },
    },
    select: { externalAccountId: true, tokenCiphertextReference: true },
  });
  if (!channel) return;
  const result = await transaction.channel.updateMany({
    where: {
      id: input.channelId,
      workspaceId: input.workspaceId,
      state: { in: [ChannelState.CONNECTED, ChannelState.CONNECTING] },
    },
    data: {
      state: ChannelState.REAUTHORIZATION_REQUIRED,
      deniedAt: new Date(),
    },
  });
  if (result.count === 0) return;
  let authorizedAuditTargetIds: readonly string[] = [input.channelId];
  if (channel.externalAccountId) {
    const platform = input.platform ?? "youtube";
    authorizedAuditTargetIds = await (platform === "facebook"
      ? pseudonymizePlatformAuthorizedData(transaction, {
          platform,
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          accountReference: channel.externalAccountId,
          replacementAccountReference: `expired:${input.channelId}`,
          replacementDisplayName: "Expired Facebook Page authorization",
        })
      : pseudonymizeYouTubeAuthorizedData(transaction, {
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          accountReference: channel.externalAccountId,
          replacementAccountReference: `expired:${input.channelId}`,
          replacementDisplayName: "Expired YouTube authorization",
        }));
  }
  await transaction.$executeRaw`SELECT pseudonymize_channel_audit(
      ${input.workspaceId}::uuid,
      ${input.channelId}::uuid,
      ${authorizedAuditTargetIds}::text[]
  )`;
  await enqueueTokenKeyRetirement(transaction, {
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    keyReference: channel.tokenCiphertextReference,
    correlationId: input.executionId,
  });
  await transaction.channel.update({
    where: { id: input.channelId },
    data: {
      externalAccountId: null,
      displayName: null,
      authorizationSubjectReference: null,
      tokenEnvelopeCiphertext: null,
      tokenCiphertextReference: null,
      grantedScopes: [],
      authorizedAt: null,
      refreshedAt: null,
      authorizedDataExpiresAt: null,
    },
  });
  await appendAudit(transaction, {
    workspaceId: input.workspaceId,
    action: "channel.reauthorization_required",
    targetType: "channel",
    targetId: input.channelId,
    result: "failed",
    correlationId: input.executionId,
    metadata: { platform: input.platform ?? "youtube", execution_id: input.executionId },
  });
}

export async function requireYouTubeReauthorization(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly executionId: string;
    readonly leaseGeneration: bigint;
    readonly platform?: "youtube" | "facebook" | "tiktok";
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.channelId}, 6))`;
    await assertYouTubePublishFence(transaction, input);
    await requireYouTubeReauthorizationInTransaction(transaction, input);
  });
}
