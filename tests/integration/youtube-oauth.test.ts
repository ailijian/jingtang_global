import { randomUUID } from "node:crypto";

import { youtubeOAuthScopes } from "@jingtang/application";
import {
  beginYouTubeConnection,
  claimNextOutboxMessage,
  completeSourceAsset,
  completeYouTubeConnection,
  denyYouTubeConnection,
  confirmContentPublishing,
  createContent,
  createDatabaseClient,
  createPendingSourceAsset,
  createSession,
  createWorkspace,
  listYouTubeChannels,
  recordConsent,
  readYouTubeExecutionWorkItem,
  recordYouTubeExecutionPublished,
  recordYouTubeUploadAccepted,
  releaseYouTubeChannelOperationLease,
  resetYouTubeExecutionForRetry,
  decideContent,
  finishOutboxMessage,
  submitContent,
  upsertIdentityUser,
  withTenant,
} from "@jingtang/db";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for D5 integration tests");
const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const vault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

async function fixture(label: string) {
  const user = await upsertIdentityUser(db, {
    subject: `d5-${label}-${randomUUID()}`,
    email: `d5-${label}-${randomUUID()}@example.test`,
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
  const consent = await recordConsent(db, {
    userId: user.id,
    termsVersion: "d5-terms-v1",
    privacyVersion: "d5-privacy-v1",
    dataPurposeVersion: "d5-youtube-purpose-v1",
    displayedLocale: "en",
    acceptanceMethod: "youtube_connection_checkbox",
  });
  return { user, workspace, consent };
}

afterAll(async () => Promise.all([db.$disconnect(), adminDb.$disconnect()]));

describe("D5 YouTube OAuth persistence boundary", () => {
  it("stores only an authenticated token envelope and exposes tenant-bound channel metadata", async () => {
    const owner = await fixture("youtube-owner");
    const other = await fixture("other-owner");
    const channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const envelope = await vault.seal({
      accessToken: "integration-access-token",
      refreshToken: "integration-refresh-token",
    });
    await completeYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_TEST_OWNER",
      displayName: "JINGTANG Test Channel",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: envelope,
      correlationId: randomUUID(),
    });

    await expect(listYouTubeChannels(db, other.workspace.id)).resolves.toEqual([]);
    await expect(listYouTubeChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        id: channel.id,
        state: "connected",
        externalAccountId: "UC_TEST_OWNER",
        displayName: "JINGTANG Test Channel",
        grantedScopes: youtubeOAuthScopes,
      },
    ]);
    const persisted = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.findUniqueOrThrow({ where: { id: channel.id } }),
    );
    expect(persisted.tokenEnvelopeCiphertext).not.toContain("integration-refresh-token");
    await expect(vault.open(persisted.tokenEnvelopeCiphertext ?? "")).resolves.toMatchObject({
      refreshToken: "integration-refresh-token",
    });
    const actions = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.auditEvent.findMany({
        where: { workspaceId: owner.workspace.id, targetId: channel.id },
        select: { action: true },
        orderBy: { occurredAt: "asc" },
      }),
    );
    expect(actions.map((entry) => entry.action)).toEqual([
      "channel.connection_started",
      "channel.connected",
    ]);
  });

  it("rejects duplicate connection attempts and cross-tenant callback completion", async () => {
    const owner = await fixture("duplicate-owner");
    const other = await fixture("callback-attacker");
    const channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    await expect(
      beginYouTubeConnection(db, {
        workspaceId: owner.workspace.id,
        consentRecordId: owner.consent.id,
        actorUserId: owner.user.id,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("channel_connection_in_progress");
    await expect(
      completeYouTubeConnection(db, {
        workspaceId: other.workspace.id,
        channelId: channel.id,
        actorUserId: other.user.id,
        externalAccountId: "UC_CROSS_TENANT",
        displayName: "Cross tenant",
        grantedScopes: youtubeOAuthScopes,
        tokenEnvelopeCiphertext: await vault.seal({ refreshToken: "must-not-persist" }),
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("channel_not_found");
  });

  it("does not let a failed or replayed callback reset an established connection", async () => {
    const owner = await fixture("callback-replay-owner");
    const channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const connection = {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_REPLAY_PROTECTED",
      displayName: "Replay protected",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: await vault.seal({ refreshToken: "protected" }),
      correlationId: randomUUID(),
    } as const;
    await completeYouTubeConnection(db, connection);

    await expect(completeYouTubeConnection(db, connection)).rejects.toThrow("channel_not_found");
    await denyYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      reason: "exchange_failed",
    });

    await expect(listYouTubeChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        id: channel.id,
        state: "connected",
        externalAccountId: "UC_REPLAY_PROTECTED",
      },
    ]);
  });

  it("confirms one immutable private execution and outbox message idempotently", async () => {
    const owner = await fixture("publishing-owner");
    const channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    await completeYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_PUBLISH_TARGET",
      displayName: "Publish target",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: await vault.seal({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        grantedScopes: youtubeOAuthScopes,
      }),
      correlationId: randomUUID(),
    });
    const assetId = randomUUID();
    await createPendingSourceAsset(db, {
      id: assetId,
      workspaceId: owner.workspace.id,
      objectKey: `workspaces/${owner.workspace.id}/source-assets/${assetId}/video.mp4`,
      filename: "video.mp4",
      mediaType: "video/mp4",
      byteSize: 3,
      sha256: "a".repeat(64),
      ownershipConfirmed: true,
      uploadedByUserId: owner.user.id,
    });
    await completeSourceAsset(db, {
      workspaceId: owner.workspace.id,
      assetId,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const content = await createContent(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      internalTitle: "Private publish fixture",
      sourceAssetId: assetId,
      platformVersions: [
        {
          platform: "youtube",
          accountReference: "UC_PUBLISH_TARGET",
          accountDisplayName: "Publish target",
          title: "Approved exact title",
          description: "Approved exact description",
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
    const [first, second] = await Promise.all([
      confirmContentPublishing(db, {
        workspaceId: owner.workspace.id,
        contentId: content.id,
        revisionId: submission.revisionId,
        actorUserId: owner.user.id,
        consentVersion: "d5-youtube-purpose-v1",
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      }),
      confirmContentPublishing(db, {
        workspaceId: owner.workspace.id,
        contentId: content.id,
        revisionId: submission.revisionId,
        actorUserId: owner.user.id,
        consentVersion: "d5-youtube-purpose-v1",
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      }),
    ]);
    expect(second).toEqual(first);
    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.outboxMessage.count({ where: { workspaceId: owner.workspace.id } }),
      ),
    ).resolves.toBe(1);
    const firstClaim = await claimNextOutboxMessage(adminDb);
    expect(firstClaim).toMatchObject({
      workspaceId: owner.workspace.id,
      platformExecutionId: first.executionId,
      attempt: 0,
    });
    await finishOutboxMessage(adminDb, {
      id: firstClaim?.id ?? randomUUID(),
      outcome: "retry",
      failureCategory: "service_unavailable",
      retryAfterSeconds: 0,
    });
    const secondClaim = await claimNextOutboxMessage(adminDb);
    expect(secondClaim).toMatchObject({
      platformExecutionId: first.executionId,
      attempt: 1,
    });
    const firstWork = await readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId);
    expect(firstWork).toMatchObject({ state: "publishing", providerId: null });
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).rejects.toThrow("execution_recovery_required");
    await resetYouTubeExecutionForRetry(db, owner.workspace.id, first.executionId);
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).resolves.toMatchObject({ state: "publishing", providerId: null });
    await recordYouTubeUploadAccepted(db, {
      workspaceId: owner.workspace.id,
      executionId: first.executionId,
      providerId: "youtube-video-id",
      providerUrl: "https://www.youtube.com/watch?v=youtube-video-id",
    });
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).resolves.toMatchObject({ state: "processing", providerId: "youtube-video-id" });
    await recordYouTubeExecutionPublished(db, owner.workspace.id, first.executionId);
    await releaseYouTubeChannelOperationLease(
      db,
      owner.workspace.id,
      firstWork.channelId,
      first.executionId,
    );
    await finishOutboxMessage(adminDb, {
      id: secondClaim?.id ?? randomUUID(),
      outcome: "completed",
    });
    await finishOutboxMessage(adminDb, {
      id: secondClaim?.id ?? randomUUID(),
      outcome: "retry",
      failureCategory: "must_not_resurrect",
      retryAfterSeconds: 0,
    });
    await expect(
      adminDb.outboxMessage.findUniqueOrThrow({
        where: { id: secondClaim?.id ?? randomUUID() },
        select: { state: true, failureCategory: true },
      }),
    ).resolves.toEqual({ state: "COMPLETED", failureCategory: null });
  });
});
