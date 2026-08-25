import { createHash, randomUUID } from "node:crypto";

import {
  claimExpiredSourceAssetUploadCleanup,
  completeSourceAsset,
  completeSourceAssetUploadCleanup,
  createContent,
  createDatabaseClient,
  createPendingSourceAsset,
  createSession,
  createWorkspace,
  decideContent,
  failSourceAsset,
  getContentDetail,
  submitContent,
  updateContentDraft,
  upsertIdentityUser,
  withTenant,
} from "@jingtang/db";
import { S3AssetStorage } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const workerDatabaseUrl = process.env.DATABASE_WORKER_URL;
const storageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;
if (!databaseUrl || !workerDatabaseUrl || !storageEndpoint) {
  throw new Error("Content integration tests require app and worker databases plus object storage");
}

const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const workerDb = createDatabaseClient(workerDatabaseUrl);
const storage = new S3AssetStorage({
  endpoint: storageEndpoint,
  region: process.env.OBJECT_STORAGE_REGION ?? "ap-southeast-1",
  bucket: process.env.OBJECT_STORAGE_BUCKET ?? "jingtang-test-assets",
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? "jingtang_test",
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? "test_storage_only_change_me",
  },
  forcePathStyle: true,
  autoCreateBucket: true,
  serverSideEncryption: false,
});

async function workspaceFixture(label: string) {
  const user = await upsertIdentityUser(db, {
    subject: `d4-${label}-${randomUUID()}`,
    email: `d4-${label}-${randomUUID()}@example.test`,
    name: label,
    locale: "en",
  });
  const session = await createSession(db, {
    userId: user.id,
    secret: "integration-secret-at-least-32-bytes",
  });
  const workspace = await createWorkspace(db, {
    name: `${label} Workspace`,
    userId: user.id,
    sessionId: session.id,
    correlationId: randomUUID(),
  });
  return { user, workspace };
}

async function uploadedAsset(workspaceId: string, userId: string) {
  const bytes = new TextEncoder().encode("D4 source asset owned by the integration fixture");
  const digest = createHash("sha256").update(bytes).digest();
  const assetId = randomUUID();
  const objectKey = `workspaces/${workspaceId}/source-assets/${assetId}/fixture.mp4`;
  await createPendingSourceAsset(db, {
    id: assetId,
    workspaceId,
    objectKey,
    filename: "fixture.mp4",
    mediaType: "video/mp4",
    byteSize: bytes.byteLength,
    sha256: digest.toString("hex"),
    ownershipConfirmed: true,
    uploadedByUserId: userId,
  });
  await storage.put({
    key: objectKey,
    body: bytes,
    contentType: "video/mp4",
    sha256Base64: digest.toString("base64"),
  });
  await completeSourceAsset(db, {
    workspaceId,
    assetId,
    actorUserId: userId,
    correlationId: randomUUID(),
  });
  return assetId;
}

afterAll(async () =>
  Promise.all([db.$disconnect(), adminDb.$disconnect(), workerDb.$disconnect()]),
);

describe("D4 content and approval closure", () => {
  it("stores a real Source Asset and keeps approval separate from publishing", async () => {
    const owner = await workspaceFixture("content-owner");
    const assetId = await uploadedAsset(owner.workspace.id, owner.user.id);
    const content = await createContent(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      internalTitle: "Autumn campaign",
      sourceAssetId: assetId,
      platformVersions: [
        {
          platform: "youtube",
          accountReference: "youtube-review-target",
          accountDisplayName: "Global YouTube review target",
          title: "Autumn campaign launch",
          description: "User-authored copy stays unchanged.",
          privacyStatus: "private",
          madeForKids: false,
        },
      ],
      correlationId: randomUUID(),
    });
    const submission = await submitContent(db, {
      workspaceId: owner.workspace.id,
      contentId: content.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    await decideContent(db, {
      workspaceId: owner.workspace.id,
      contentId: content.id,
      revisionId: submission.revisionId,
      actorUserId: owner.user.id,
      result: "approved",
      correlationId: randomUUID(),
    });

    const detail = await getContentDetail(db, owner.workspace.id, content.id);
    expect(detail).toMatchObject({
      status: "approved",
      revision: { id: submission.revisionId, number: 1 },
      approval: { result: "approved" },
      publishing: { intentCount: 0, executionCount: 0 },
    });
    expect(detail?.revision.platformVersions[0]?.description).toBe(
      "User-authored copy stays unchanged.",
    );
    const actions = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.auditEvent.findMany({
        where: { workspaceId: owner.workspace.id, action: { startsWith: "content." } },
        select: { action: true },
      }),
    );
    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["content.created", "content.submitted", "content.approved"]),
    );
    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.approvalDecision.update({
          where: { id: detail?.approval?.id ?? randomUUID() },
          data: { reason: "mutated" },
        }),
      ),
    ).rejects.toThrow(/append-only|permission denied/);
  });

  it("blocks failed or cross-tenant Source Assets from content creation", async () => {
    const first = await workspaceFixture("failed-asset-owner");
    const second = await workspaceFixture("other-asset-owner");
    const bytes = new TextEncoder().encode("failed upload");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const assetId = randomUUID();
    await createPendingSourceAsset(db, {
      id: assetId,
      workspaceId: first.workspace.id,
      objectKey: `workspaces/${first.workspace.id}/source-assets/${assetId}/failed.mp4`,
      filename: "failed.mp4",
      mediaType: "video/mp4",
      byteSize: bytes.byteLength,
      sha256: digest,
      ownershipConfirmed: true,
      uploadedByUserId: first.user.id,
    });
    await failSourceAsset(db, {
      workspaceId: first.workspace.id,
      assetId,
      actorUserId: first.user.id,
      correlationId: randomUUID(),
      failureCategory: "object_storage_unavailable",
    });
    const input = {
      actorUserId: first.user.id,
      internalTitle: "Blocked content",
      sourceAssetId: assetId,
      platformVersions: [
        {
          platform: "youtube" as const,
          accountReference: "review",
          accountDisplayName: "Review",
          title: "Blocked",
          description: "",
          privacyStatus: "private" as const,
          madeForKids: false,
        },
      ],
      correlationId: randomUUID(),
    };
    await expect(createContent(db, { ...input, workspaceId: first.workspace.id })).rejects.toThrow(
      "source_asset_not_ready",
    );
    await expect(
      createContent(db, {
        ...input,
        workspaceId: second.workspace.id,
        actorUserId: second.user.id,
      }),
    ).rejects.toThrow("source_asset_not_ready");
  });

  it("atomically fail-closes expired pending uploads and retries object cleanup", async () => {
    const owner = await workspaceFixture("expired-upload-owner");
    const expiredAssetId = randomUUID();
    const recentAssetId = randomUUID();
    const createPending = (assetId: string, filename: string) =>
      createPendingSourceAsset(db, {
        id: assetId,
        workspaceId: owner.workspace.id,
        objectKey: `workspaces/${owner.workspace.id}/source-assets/${assetId}/${filename}`,
        filename,
        mediaType: "video/mp4",
        byteSize: 128,
        sha256: createHash("sha256").update(assetId).digest("hex"),
        ownershipConfirmed: true,
        uploadedByUserId: owner.user.id,
      });
    await Promise.all([
      createPending(expiredAssetId, "expired.mp4"),
      createPending(recentAssetId, "recent.mp4"),
    ]);
    await adminDb.$executeRaw`
      UPDATE source_assets
      SET created_at = clock_timestamp() - interval '30 minutes'
      WHERE id = ${expiredAssetId}::uuid
    `;

    const cutoff = new Date(Date.now() - 20 * 60_000);
    await expect(
      claimExpiredSourceAssetUploadCleanup(workerDb, { uploadCutoff: cutoff }),
    ).resolves.toEqual([
      {
        assetId: expiredAssetId,
        workspaceId: owner.workspace.id,
        objectKey: `workspaces/${owner.workspace.id}/source-assets/${expiredAssetId}/expired.mp4`,
      },
    ]);
    await expect(
      adminDb.sourceAsset.findUniqueOrThrow({
        where: { id: expiredAssetId },
        select: { status: true, failureCategory: true },
      }),
    ).resolves.toEqual({
      status: "FAILED",
      failureCategory: "upload_expired_cleanup_pending",
    });
    const auditEvents = await adminDb.auditEvent.findMany({
      where: {
        workspaceId: owner.workspace.id,
        action: "source_asset.upload_failed",
        targetId: expiredAssetId,
      },
      select: { actorType: true, metadata: true, result: true },
    });
    expect(auditEvents).toEqual([
      {
        actorType: "system",
        metadata: { cleanup_state: "pending", failure_category: "upload_expired" },
        result: "failed",
      },
    ]);

    await expect(
      claimExpiredSourceAssetUploadCleanup(workerDb, { uploadCutoff: cutoff }),
    ).resolves.toEqual([]);
    await adminDb.$executeRaw`
      UPDATE source_assets
      SET updated_at = clock_timestamp() - interval '1 minute'
      WHERE id = ${expiredAssetId}::uuid
    `;
    const concurrentRetries = await Promise.all([
      claimExpiredSourceAssetUploadCleanup(workerDb, { uploadCutoff: cutoff }),
      claimExpiredSourceAssetUploadCleanup(workerDb, { uploadCutoff: cutoff }),
    ]);
    expect(concurrentRetries.map((entries) => entries.length).sort()).toEqual([0, 1]);
    await expect(
      adminDb.auditEvent.count({
        where: {
          workspaceId: owner.workspace.id,
          action: "source_asset.upload_failed",
          targetId: expiredAssetId,
        },
      }),
    ).resolves.toBe(1);
    await expect(completeSourceAssetUploadCleanup(workerDb, expiredAssetId)).resolves.toBe(true);
    await expect(completeSourceAssetUploadCleanup(workerDb, expiredAssetId)).resolves.toBe(false);
    await expect(
      claimExpiredSourceAssetUploadCleanup(workerDb, { uploadCutoff: cutoff }),
    ).resolves.toEqual([]);
    await expect(
      adminDb.sourceAsset.findUniqueOrThrow({
        where: { id: recentAssetId },
        select: { status: true, failureCategory: true },
      }),
    ).resolves.toEqual({ status: "PENDING_UPLOAD", failureCategory: null });
  });

  it("allows only one Content to claim a Source Asset under concurrency", async () => {
    const owner = await workspaceFixture("asset-claim-owner");
    const assetId = await uploadedAsset(owner.workspace.id, owner.user.id);
    const command = () =>
      createContent(db, {
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        internalTitle: "Concurrent claim",
        sourceAssetId: assetId,
        platformVersions: [
          {
            platform: "youtube",
            accountReference: "review",
            accountDisplayName: "Review",
            title: "Concurrent claim",
            description: "",
            privacyStatus: "private",
            madeForKids: false,
          },
        ],
        correlationId: randomUUID(),
      });
    const results = await Promise.allSettled([command(), command()]);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((entry) => entry.status === "rejected")).toHaveLength(1);
  });

  it("requires an exact pending revision and a reason for rejection", async () => {
    const owner = await workspaceFixture("rejection-owner");
    const assetId = await uploadedAsset(owner.workspace.id, owner.user.id);
    const content = await createContent(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      internalTitle: "Review fixture",
      sourceAssetId: assetId,
      platformVersions: [
        {
          platform: "youtube",
          accountReference: "review",
          accountDisplayName: "Review",
          title: "Review fixture",
          description: "",
          privacyStatus: "private",
          madeForKids: false,
        },
      ],
      correlationId: randomUUID(),
    });
    const submission = await submitContent(db, {
      workspaceId: owner.workspace.id,
      contentId: content.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    await expect(
      decideContent(db, {
        workspaceId: owner.workspace.id,
        contentId: content.id,
        revisionId: submission.revisionId,
        actorUserId: owner.user.id,
        result: "rejected",
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("rejection_reason_required");
    await expect(
      decideContent(db, {
        workspaceId: owner.workspace.id,
        contentId: content.id,
        revisionId: randomUUID(),
        actorUserId: owner.user.id,
        result: "approved",
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("invalid_state");
    await decideContent(db, {
      workspaceId: owner.workspace.id,
      contentId: content.id,
      revisionId: submission.revisionId,
      actorUserId: owner.user.id,
      result: "rejected",
      reason: "Clarify the reviewed title.",
      correlationId: randomUUID(),
    });
    await updateContentDraft(db, {
      workspaceId: owner.workspace.id,
      contentId: content.id,
      actorUserId: owner.user.id,
      internalTitle: "Review fixture revised",
      platformVersions: [
        {
          platform: "youtube",
          accountReference: "review",
          accountDisplayName: "Review",
          title: "Review fixture revision two",
          description: "",
          privacyStatus: "private",
          madeForKids: false,
        },
      ],
      correlationId: randomUUID(),
    });
    await expect(getContentDetail(db, owner.workspace.id, content.id)).resolves.toMatchObject({
      status: "draft",
      currentRevisionNumber: 2,
      revision: { number: 2, submittedAt: null },
      approval: null,
    });
  });
});
