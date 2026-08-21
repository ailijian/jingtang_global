import type {
  ApprovalResult,
  ContentStatus,
  Platform,
  PrivacyStatus,
  SourceAssetStatus,
} from "@jingtang/domain";

import {
  ApprovalResult as DbApprovalResult,
  ContentStatus as DbContentStatus,
  Platform as DbPlatform,
  PrivacyStatus as DbPrivacyStatus,
  SourceAssetStatus as DbSourceAssetStatus,
  ValidationStatus,
  type Prisma,
  type PrismaClient,
} from "./generated/client.js";
import { appendAudit, withTenant } from "./repository.js";

const contentStatusToDomain: Readonly<Record<DbContentStatus, ContentStatus>> = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  REJECTED: "rejected",
  APPROVED: "approved",
};

const assetStatusToDomain: Readonly<Record<DbSourceAssetStatus, SourceAssetStatus>> = {
  PENDING_UPLOAD: "pending_upload",
  COMPLETE: "complete",
  FAILED: "failed",
};

const platformToDb: Readonly<Record<Platform, DbPlatform>> = { youtube: DbPlatform.YOUTUBE };
const platformToDomain: Readonly<Record<DbPlatform, Platform>> = { YOUTUBE: "youtube" };
const privacyToDb: Readonly<Record<PrivacyStatus, DbPrivacyStatus>> = {
  private: DbPrivacyStatus.PRIVATE,
  unlisted: DbPrivacyStatus.UNLISTED,
  public: DbPrivacyStatus.PUBLIC,
};
const privacyToDomain: Readonly<Record<DbPrivacyStatus, PrivacyStatus>> = {
  PRIVATE: "private",
  UNLISTED: "unlisted",
  PUBLIC: "public",
};
const decisionToDb: Readonly<Record<ApprovalResult, DbApprovalResult>> = {
  approved: DbApprovalResult.APPROVED,
  rejected: DbApprovalResult.REJECTED,
};

export interface PlatformVersionInput {
  readonly platform: Platform;
  readonly accountReference: string;
  readonly accountDisplayName: string;
  readonly title: string;
  readonly description: string;
  readonly privacyStatus: PrivacyStatus;
  readonly madeForKids: boolean;
}

export interface SourceAssetView {
  readonly id: string;
  readonly workspaceId: string;
  readonly contentId: string | null;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly status: SourceAssetStatus;
  readonly ownershipConfirmed: boolean;
  readonly failureCategory: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ContentSummaryView {
  readonly id: string;
  readonly internalTitle: string;
  readonly status: ContentStatus;
  readonly currentRevisionNumber: number;
  readonly createdByName: string;
  readonly platformCount: number;
  readonly updatedAt: Date;
}

export interface ContentDetailView extends ContentSummaryView {
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly sourceAsset: SourceAssetView;
  readonly revision: {
    readonly id: string;
    readonly number: number;
    readonly submittedAt: Date | null;
    readonly platformVersions: readonly {
      readonly id: string;
      readonly platform: Platform;
      readonly accountReference: string;
      readonly accountDisplayName: string;
      readonly title: string;
      readonly description: string;
      readonly privacyStatus: PrivacyStatus;
      readonly madeForKids: boolean;
    }[];
  };
  readonly approval: {
    readonly id: string;
    readonly result: ApprovalResult;
    readonly reason: string | null;
    readonly actorName: string;
    readonly decidedAt: Date;
  } | null;
  readonly publishing: {
    readonly intentCount: number;
    readonly executionCount: number;
  };
  readonly activity: readonly {
    readonly id: string;
    readonly action: string;
    readonly result: string;
    readonly actorName: string | null;
    readonly occurredAt: Date;
  }[];
}

function sourceAssetView(entry: {
  id: string;
  workspaceId: string;
  contentId: string | null;
  originalFilename: string;
  mediaType: string;
  byteSize: bigint;
  sha256: string;
  status: DbSourceAssetStatus;
  ownershipConfirmed: boolean;
  failureCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SourceAssetView {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    contentId: entry.contentId,
    filename: entry.originalFilename,
    mediaType: entry.mediaType,
    byteSize: Number(entry.byteSize),
    sha256: entry.sha256,
    status: assetStatusToDomain[entry.status],
    ownershipConfirmed: entry.ownershipConfirmed,
    failureCategory: entry.failureCategory,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function createPendingSourceAsset(
  client: PrismaClient,
  input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly objectKey: string;
    readonly filename: string;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly sha256: string;
    readonly ownershipConfirmed: true;
    readonly uploadedByUserId: string;
  },
): Promise<SourceAssetView> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    const asset = await transaction.sourceAsset.create({
      data: {
        id: input.id,
        workspaceId: input.workspaceId,
        objectKey: input.objectKey,
        originalFilename: input.filename,
        mediaType: input.mediaType,
        byteSize: BigInt(input.byteSize),
        sha256: input.sha256,
        ownershipConfirmed: input.ownershipConfirmed,
        uploadedByUserId: input.uploadedByUserId,
      },
    });
    return sourceAssetView(asset);
  });
}

export async function completeSourceAsset(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly assetId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
  },
): Promise<SourceAssetView> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    const asset = await transaction.sourceAsset.update({
      where: {
        id: input.assetId,
        workspaceId: input.workspaceId,
        status: DbSourceAssetStatus.PENDING_UPLOAD,
      },
      data: { status: DbSourceAssetStatus.COMPLETE, failureCategory: null },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "source_asset.uploaded",
      targetType: "source_asset",
      targetId: asset.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { media_type: asset.mediaType, byte_size: Number(asset.byteSize) },
    });
    return sourceAssetView(asset);
  });
}

export async function failSourceAsset(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly assetId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly failureCategory: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.sourceAsset.update({
      where: {
        id: input.assetId,
        workspaceId: input.workspaceId,
        status: DbSourceAssetStatus.PENDING_UPLOAD,
      },
      data: { status: DbSourceAssetStatus.FAILED, failureCategory: input.failureCategory },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "source_asset.upload_failed",
      targetType: "source_asset",
      targetId: input.assetId,
      result: "failed",
      correlationId: input.correlationId,
      metadata: { failure_category: input.failureCategory },
    });
  });
}

function platformVersionData(
  workspaceId: string,
  revisionId: string,
  entry: PlatformVersionInput,
): Prisma.PlatformVersionCreateManyInput {
  return {
    workspaceId,
    revisionId,
    platform: platformToDb[entry.platform],
    accountReference: entry.accountReference.trim(),
    accountDisplayName: entry.accountDisplayName.trim(),
    title: entry.title.trim(),
    description: entry.description,
    privacyStatus: privacyToDb[entry.privacyStatus],
    madeForKids: entry.madeForKids,
    validationStatus: ValidationStatus.VALID,
  };
}

export async function createContent(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly internalTitle: string;
    readonly sourceAssetId: string;
    readonly platformVersions: readonly PlatformVersionInput[];
    readonly correlationId: string;
  },
): Promise<{ readonly id: string }> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.sourceAssetId}, 2))`;
    const asset = await transaction.sourceAsset.findUnique({ where: { id: input.sourceAssetId } });
    if (
      !asset ||
      asset.workspaceId !== input.workspaceId ||
      asset.status !== DbSourceAssetStatus.COMPLETE ||
      !asset.ownershipConfirmed ||
      asset.contentId
    ) {
      throw new Error("source_asset_not_ready");
    }
    if (!input.platformVersions.length) throw new Error("platform_version_required");
    const content = await transaction.content.create({
      data: {
        workspaceId: input.workspaceId,
        internalTitle: input.internalTitle.trim(),
        createdByUserId: input.actorUserId,
      },
      select: { id: true },
    });
    const revision = await transaction.contentRevision.create({
      data: {
        workspaceId: input.workspaceId,
        contentId: content.id,
        revisionNumber: 1,
        sourceAssetId: asset.id,
        createdByUserId: input.actorUserId,
      },
      select: { id: true },
    });
    await transaction.platformVersion.createMany({
      data: input.platformVersions.map((entry) =>
        platformVersionData(input.workspaceId, revision.id, entry),
      ),
    });
    const claimed = await transaction.sourceAsset.updateMany({
      where: {
        id: asset.id,
        workspaceId: input.workspaceId,
        contentId: null,
        status: DbSourceAssetStatus.COMPLETE,
      },
      data: { contentId: content.id },
    });
    if (claimed.count !== 1) throw new Error("source_asset_not_ready");
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "content.created",
      targetType: "content",
      targetId: content.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { revision_number: 1, platform_count: input.platformVersions.length },
    });
    return content;
  });
}

export async function listContents(
  client: PrismaClient,
  workspaceId: string,
  status?: ContentStatus,
): Promise<readonly ContentSummaryView[]> {
  const statusMap: Readonly<Record<ContentStatus, DbContentStatus>> = {
    draft: DbContentStatus.DRAFT,
    pending_approval: DbContentStatus.PENDING_APPROVAL,
    rejected: DbContentStatus.REJECTED,
    approved: DbContentStatus.APPROVED,
  };
  const entries = await withTenant(client, workspaceId, (transaction) =>
    transaction.content.findMany({
      where: { workspaceId, ...(status ? { status: statusMap[status] } : {}) },
      include: {
        createdBy: { select: { name: true } },
        revisions: {
          where: {},
          include: { _count: { select: { platformVersions: true } } },
          orderBy: { revisionNumber: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  );
  return entries.map((entry) => ({
    id: entry.id,
    internalTitle: entry.internalTitle,
    status: contentStatusToDomain[entry.status],
    currentRevisionNumber: entry.currentRevisionNumber,
    createdByName: entry.createdBy.name,
    platformCount: entry.revisions[0]?._count.platformVersions ?? 0,
    updatedAt: entry.updatedAt,
  }));
}

export async function getContentDetail(
  client: PrismaClient,
  workspaceId: string,
  contentId: string,
): Promise<ContentDetailView | null> {
  const entry = await withTenant(client, workspaceId, (transaction) =>
    transaction.content.findUnique({
      where: { id: contentId, workspaceId },
      include: {
        createdBy: { select: { name: true } },
        sourceAsset: true,
        revisions: {
          where: {},
          include: {
            platformVersions: { orderBy: { createdAt: "asc" } },
            approvalDecision: { include: { actor: { select: { name: true } } } },
          },
          orderBy: { revisionNumber: "desc" },
        },
        _count: { select: { publishingIntents: true } },
      },
    }),
  );
  if (!entry || !entry.sourceAsset) return null;
  const revision = entry.revisions.find(
    (candidate) => candidate.revisionNumber === entry.currentRevisionNumber,
  );
  if (!revision) throw new Error("content_revision_not_found");
  const targetIds = [
    entry.id,
    ...entry.revisions.map((candidate) => candidate.id),
    ...entry.revisions.flatMap((candidate) =>
      candidate.approvalDecision ? [candidate.approvalDecision.id] : [],
    ),
  ];
  const operational = await withTenant(client, workspaceId, async (transaction) => {
    const executionCount = await transaction.platformExecution.count({
      where: { workspaceId, publishingIntent: { contentId } },
    });
    const activity = await transaction.auditEvent.findMany({
      where: { workspaceId, targetId: { in: targetIds } },
      include: { actor: { select: { name: true } } },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });
    return { executionCount, activity };
  });
  return {
    id: entry.id,
    internalTitle: entry.internalTitle,
    status: contentStatusToDomain[entry.status],
    currentRevisionNumber: entry.currentRevisionNumber,
    createdByName: entry.createdBy.name,
    createdByUserId: entry.createdByUserId,
    platformCount: revision.platformVersions.length,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    sourceAsset: sourceAssetView(entry.sourceAsset),
    revision: {
      id: revision.id,
      number: revision.revisionNumber,
      submittedAt: revision.submittedAt,
      platformVersions: revision.platformVersions.map((version) => ({
        id: version.id,
        platform: platformToDomain[version.platform],
        accountReference: version.accountReference,
        accountDisplayName: version.accountDisplayName,
        title: version.title,
        description: version.description,
        privacyStatus: privacyToDomain[version.privacyStatus],
        madeForKids: version.madeForKids,
      })),
    },
    approval: revision.approvalDecision
      ? {
          id: revision.approvalDecision.id,
          result:
            revision.approvalDecision.result === DbApprovalResult.APPROVED
              ? "approved"
              : "rejected",
          reason: revision.approvalDecision.reason,
          actorName: revision.approvalDecision.actor.name,
          decidedAt: revision.approvalDecision.decidedAt,
        }
      : null,
    publishing: {
      intentCount: entry._count.publishingIntents,
      executionCount: operational.executionCount,
    },
    activity: operational.activity.map((event) => ({
      id: event.id,
      action: event.action,
      result: event.result,
      actorName: event.actor?.name ?? null,
      occurredAt: event.occurredAt,
    })),
  };
}

export async function updateContentDraft(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly contentId: string;
    readonly actorUserId: string;
    readonly internalTitle: string;
    readonly platformVersions: readonly PlatformVersionInput[];
    readonly correlationId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.contentId}, 1))`;
    const content = await transaction.content.findUnique({
      where: { id: input.contentId, workspaceId: input.workspaceId },
      include: {
        revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
      },
    });
    if (!content) throw new Error("content_not_found");
    if (content.status === DbContentStatus.PENDING_APPROVAL) throw new Error("invalid_state");
    if (!input.platformVersions.length) throw new Error("platform_version_required");
    const current = content.revisions[0];
    if (!current) throw new Error("content_revision_not_found");
    let revisionId = current.id;
    let revisionNumber = current.revisionNumber;
    if (content.status === DbContentStatus.DRAFT && current.submittedAt === null) {
      await transaction.platformVersion.deleteMany({ where: { revisionId: current.id } });
    } else {
      revisionNumber += 1;
      const revision = await transaction.contentRevision.create({
        data: {
          workspaceId: input.workspaceId,
          contentId: content.id,
          revisionNumber,
          sourceAssetId: current.sourceAssetId,
          createdByUserId: input.actorUserId,
        },
        select: { id: true },
      });
      revisionId = revision.id;
    }
    await transaction.platformVersion.createMany({
      data: input.platformVersions.map((entry) =>
        platformVersionData(input.workspaceId, revisionId, entry),
      ),
    });
    await transaction.content.update({
      where: { id: content.id },
      data: {
        internalTitle: input.internalTitle.trim(),
        status: DbContentStatus.DRAFT,
        currentRevisionNumber: revisionNumber,
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "content.edited",
      targetType: "content_revision",
      targetId: revisionId,
      result: "success",
      correlationId: input.correlationId,
      metadata: { revision_number: revisionNumber, platform_count: input.platformVersions.length },
    });
  });
}

export async function submitContent(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly contentId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
  },
): Promise<{ readonly revisionId: string }> {
  return withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.contentId}, 1))`;
    const content = await transaction.content.findUnique({
      where: { id: input.contentId, workspaceId: input.workspaceId },
      include: {
        sourceAsset: true,
        revisions: {
          include: { _count: { select: { platformVersions: true } } },
          orderBy: { revisionNumber: "desc" },
          take: 1,
        },
      },
    });
    if (!content) throw new Error("content_not_found");
    if (content.status !== DbContentStatus.DRAFT) throw new Error("invalid_state");
    const revision = content.revisions[0];
    if (
      !revision ||
      revision.submittedAt ||
      !content.sourceAsset ||
      content.sourceAsset.status !== DbSourceAssetStatus.COMPLETE ||
      revision._count.platformVersions < 1
    ) {
      throw new Error("content_not_ready");
    }
    await transaction.contentRevision.update({
      where: { id: revision.id },
      data: { submittedAt: new Date() },
    });
    await transaction.content.update({
      where: { id: content.id },
      data: { status: DbContentStatus.PENDING_APPROVAL },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "content.submitted",
      targetType: "content_revision",
      targetId: revision.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { revision_number: revision.revisionNumber },
    });
    return { revisionId: revision.id };
  });
}

export async function decideContent(
  client: PrismaClient,
  input: {
    readonly workspaceId: string;
    readonly contentId: string;
    readonly revisionId: string;
    readonly actorUserId: string;
    readonly result: ApprovalResult;
    readonly reason?: string;
    readonly correlationId: string;
  },
): Promise<void> {
  await withTenant(client, input.workspaceId, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.contentId}, 1))`;
    const content = await transaction.content.findUnique({
      where: { id: input.contentId, workspaceId: input.workspaceId },
      include: {
        revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
      },
    });
    const revision = content?.revisions[0];
    if (!content || !revision) throw new Error("content_not_found");
    if (
      content.status !== DbContentStatus.PENDING_APPROVAL ||
      revision.id !== input.revisionId ||
      !revision.submittedAt
    ) {
      throw new Error("invalid_state");
    }
    const reason = input.reason?.trim() || null;
    if (input.result === "rejected" && !reason) throw new Error("rejection_reason_required");
    const approval = await transaction.approvalDecision.create({
      data: {
        workspaceId: input.workspaceId,
        contentId: content.id,
        revisionId: revision.id,
        actorUserId: input.actorUserId,
        result: decisionToDb[input.result],
        reason,
      },
      select: { id: true },
    });
    await transaction.content.update({
      where: { id: content.id },
      data: {
        status: input.result === "approved" ? DbContentStatus.APPROVED : DbContentStatus.REJECTED,
      },
    });
    await appendAudit(transaction, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: input.result === "approved" ? "content.approved" : "content.rejected",
      targetType: "approval",
      targetId: approval.id,
      result: "success",
      correlationId: input.correlationId,
      metadata: { revision_number: revision.revisionNumber },
    });
  });
}

export async function listActivity(
  client: PrismaClient,
  workspaceId: string,
  limit = 100,
): Promise<
  readonly {
    readonly id: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly result: string;
    readonly actorName: string | null;
    readonly occurredAt: Date;
  }[]
> {
  return withTenant(client, workspaceId, async (transaction) => {
    const events = await transaction.auditEvent.findMany({
      where: { workspaceId },
      include: { actor: { select: { name: true } } },
      orderBy: { occurredAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      result: event.result,
      actorName: event.actor?.name ?? null,
      occurredAt: event.occurredAt,
    }));
  });
}
