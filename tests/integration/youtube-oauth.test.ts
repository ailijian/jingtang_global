import { randomUUID } from "node:crypto";

import { youtubeOAuthScopes } from "@jingtang/application";
import {
  beginYouTubeConnection,
  claimNextOutboxMessage,
  completeYouTubeDisconnect,
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
  prepareYouTubeDisconnect,
  recordConsent,
  readYouTubeExecutionWorkItem,
  recordClaimedYouTubeExecutionFailureAndCompleteOutbox,
  recordYouTubeExecutionFailureAndCompleteOutbox,
  recordYouTubeExecutionPublished,
  recordYouTubeExecutionPublishedAndCompleteOutbox,
  recordYouTubeExecutionFailure,
  recordYouTubeUploadAccepted,
  releaseYouTubeChannelOperationLease,
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
const workerDb = createDatabaseClient(process.env.DATABASE_WORKER_URL ?? databaseUrl);
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

afterAll(async () =>
  Promise.all([db.$disconnect(), adminDb.$disconnect(), workerDb.$disconnect()]),
);

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
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_TEST_OWNER",
      displayName: "JINGTANG Test Channel",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
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
    await expect(
      vault.open(persisted.tokenEnvelopeCiphertext ?? "", persisted.tokenCiphertextReference ?? ""),
    ).resolves.toMatchObject({
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
    const envelope = await vault.seal({ refreshToken: "must-not-persist" });
    await expect(
      completeYouTubeConnection(db, {
        workspaceId: other.workspace.id,
        channelId: channel.id,
        consentRecordId: owner.consent.id,
        actorUserId: other.user.id,
        externalAccountId: "UC_CROSS_TENANT",
        displayName: "Cross tenant",
        grantedScopes: youtubeOAuthScopes,
        tokenEnvelopeCiphertext: envelope.ciphertext,
        tokenCiphertextReference: envelope.keyReference,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("channel_not_found");
  });

  it("recovers an expired connection attempt without allowing the old callback to mutate it", async () => {
    const owner = await fixture("expired-attempt-owner");
    const original = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.update({
        where: { id: original.id },
        data: { updatedAt: new Date(Date.now() - 11 * 60_000) },
      }),
    );
    const replacementConsent = await recordConsent(db, {
      userId: owner.user.id,
      termsVersion: "d5-terms-v1",
      privacyVersion: "d5-privacy-v1",
      dataPurposeVersion: "d5-youtube-purpose-v1",
      displayedLocale: "en",
      acceptanceMethod: "youtube_connection_checkbox",
    });
    const replacement = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: replacementConsent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    expect(replacement.id).toBe(original.id);

    const staleEnvelope = await vault.seal({ refreshToken: "stale-callback-token" });
    await expect(
      completeYouTubeConnection(db, {
        workspaceId: owner.workspace.id,
        channelId: original.id,
        consentRecordId: owner.consent.id,
        actorUserId: owner.user.id,
        externalAccountId: "UC_STALE_CALLBACK",
        displayName: "Stale callback",
        grantedScopes: youtubeOAuthScopes,
        tokenEnvelopeCiphertext: staleEnvelope.ciphertext,
        tokenCiphertextReference: staleEnvelope.keyReference,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("channel_not_found");
    await denyYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: original.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      reason: "exchange_failed",
    });
    await expect(listYouTubeChannels(db, owner.workspace.id)).resolves.toMatchObject([
      { id: original.id, state: "connecting" },
    ]);

    const currentEnvelope = await vault.seal({ refreshToken: "current-callback-token" });
    await completeYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: replacement.id,
      consentRecordId: replacementConsent.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_CURRENT_CALLBACK",
      displayName: "Current callback",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: currentEnvelope.ciphertext,
      tokenCiphertextReference: currentEnvelope.keyReference,
      correlationId: randomUUID(),
    });
    await expect(listYouTubeChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        id: original.id,
        state: "connected",
        externalAccountId: "UC_CURRENT_CALLBACK",
      },
    ]);
  });

  it("does not let a failed or replayed callback reset an established connection", async () => {
    const owner = await fixture("callback-replay-owner");
    const channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const envelope = await vault.seal({ refreshToken: "protected" });
    const connection = {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_REPLAY_PROTECTED",
      displayName: "Replay protected",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      correlationId: randomUUID(),
    } as const;
    await completeYouTubeConnection(db, connection);

    await expect(completeYouTubeConnection(db, connection)).rejects.toThrow("channel_not_found");
    await denyYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: owner.consent.id,
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
    const envelope = await vault.seal({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: youtubeOAuthScopes,
    });
    await completeYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_PUBLISH_TARGET",
      displayName: "Publish target",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
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
    const workerId = `youtube-oauth-${randomUUID()}`;
    const firstClaim = await claimNextOutboxMessage(workerDb, workerId);
    expect(firstClaim).toMatchObject({
      workspaceId: owner.workspace.id,
      platformExecutionId: first.executionId,
      attempt: 0,
    });
    await finishOutboxMessage(workerDb, {
      id: firstClaim?.id ?? randomUUID(),
      outcome: "retry",
      failureCategory: "service_unavailable",
      retryAfterSeconds: 0,
      claimOwner: firstClaim?.claimOwner ?? workerId,
      claimGeneration: firstClaim?.claimGeneration ?? 0n,
    });
    const secondClaim = await claimNextOutboxMessage(workerDb, workerId);
    expect(secondClaim).toMatchObject({
      platformExecutionId: first.executionId,
      attempt: 1,
    });
    const firstWork = await readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId);
    expect(firstWork).toMatchObject({ state: "publishing", providerId: null });
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).rejects.toThrow("execution_recovery_required");
    await recordClaimedYouTubeExecutionFailureAndCompleteOutbox(workerDb, {
      workspaceId: owner.workspace.id,
      executionId: first.executionId,
      outboxMessageId: secondClaim?.id ?? randomUUID(),
      claimOwner: secondClaim?.claimOwner ?? workerId,
      claimGeneration: secondClaim?.claimGeneration ?? 0n,
      failureCategory: "execution_recovery_required",
      needsAttention: true,
    });
    await expect(
      adminDb.platformExecution.findUniqueOrThrow({ where: { id: first.executionId } }),
    ).resolves.toMatchObject({
      state: "NEEDS_ATTENTION",
      failureCategory: "execution_recovery_required",
    });
    await expect(
      adminDb.outboxMessage.findUniqueOrThrow({ where: { id: secondClaim?.id ?? randomUUID() } }),
    ).resolves.toMatchObject({
      state: "DEAD",
      failureCategory: "execution_recovery_required",
    });
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).rejects.toThrow("execution_terminal");
    // Continue exercising the remaining publish transitions with a fresh execution
    // state after the focused crash-recovery assertion above.
    await adminDb.$transaction([
      adminDb.platformExecution.update({
        where: { id: first.executionId },
        data: { state: "NOT_STARTED", failureCategory: null },
      }),
      adminDb.outboxMessage.update({
        where: { id: secondClaim?.id ?? randomUUID() },
        data: {
          state: "CLAIMED",
          completedAt: null,
          claimedAt: new Date(),
          claimOwner: secondClaim?.claimOwner ?? workerId,
          claimUntil: new Date(Date.now() + 120_000),
          failureCategory: null,
        },
      }),
    ]);
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).resolves.toMatchObject({ state: "publishing", providerId: null });
    await recordYouTubeUploadAccepted(db, {
      workspaceId: owner.workspace.id,
      executionId: first.executionId,
      providerId: "youtube-video-id",
      providerUrl: "https://www.youtube.com/watch?v=youtube-video-id",
      channelId: firstWork.channelId,
      leaseGeneration: firstWork.leaseGeneration,
    });
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).resolves.toMatchObject({ state: "processing", providerId: "youtube-video-id" });

    await recordYouTubeExecutionFailureAndCompleteOutbox(workerDb, {
      workspaceId: owner.workspace.id,
      executionId: first.executionId,
      channelId: firstWork.channelId,
      leaseGeneration: firstWork.leaseGeneration,
      outboxMessageId: secondClaim?.id ?? randomUUID(),
      claimOwner: secondClaim?.claimOwner ?? workerId,
      claimGeneration: secondClaim?.claimGeneration ?? 0n,
      failureCategory: "provider_processing_failed",
      needsAttention: false,
      requireReauthorization: false,
    });
    await expect(
      adminDb.platformExecution.findUniqueOrThrow({ where: { id: first.executionId } }),
    ).resolves.toMatchObject({
      state: "FAILED",
      failureCategory: "provider_processing_failed",
    });
    await expect(
      adminDb.outboxMessage.findUniqueOrThrow({ where: { id: secondClaim?.id ?? randomUUID() } }),
    ).resolves.toMatchObject({ state: "DEAD", failureCategory: "provider_processing_failed" });
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).rejects.toThrow("execution_terminal");
    await adminDb.$transaction([
      adminDb.platformExecution.update({
        where: { id: first.executionId },
        data: { state: "PROCESSING", failureCategory: null },
      }),
      adminDb.outboxMessage.update({
        where: { id: secondClaim?.id ?? randomUUID() },
        data: {
          state: "CLAIMED",
          completedAt: null,
          claimedAt: new Date(),
          claimOwner: secondClaim?.claimOwner ?? workerId,
          claimUntil: new Date(Date.now() + 120_000),
          failureCategory: null,
        },
      }),
    ]);

    // An expired outbox claim must roll back the execution transition and its audit event.
    await adminDb.outboxMessage.update({
      where: { id: secondClaim?.id ?? randomUUID() },
      data: { claimUntil: new Date(0) },
    });
    await expect(
      recordYouTubeExecutionPublishedAndCompleteOutbox(workerDb, {
        workspaceId: owner.workspace.id,
        executionId: first.executionId,
        channelId: firstWork.channelId,
        leaseGeneration: firstWork.leaseGeneration,
        outboxMessageId: secondClaim?.id ?? randomUUID(),
        claimOwner: secondClaim?.claimOwner ?? workerId,
        claimGeneration: secondClaim?.claimGeneration ?? 0n,
      }),
    ).rejects.toThrow("outbox_claim_lost");
    await expect(
      adminDb.platformExecution.findUniqueOrThrow({ where: { id: first.executionId } }),
    ).resolves.toMatchObject({ state: "PROCESSING", providerId: "youtube-video-id" });
    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.auditEvent.count({
          where: {
            workspaceId: owner.workspace.id,
            targetId: first.executionId,
            action: "platform.published",
          },
        }),
      ),
    ).resolves.toBe(0);
    const publishClaim = await claimNextOutboxMessage(workerDb, `${workerId}-published-crash`);
    expect(publishClaim).toMatchObject({ id: secondClaim?.id, attempt: 1 });

    await recordYouTubeExecutionPublished(db, {
      workspaceId: owner.workspace.id,
      executionId: first.executionId,
      channelId: firstWork.channelId,
      leaseGeneration: firstWork.leaseGeneration,
    });
    await releaseYouTubeChannelOperationLease(
      db,
      owner.workspace.id,
      firstWork.channelId,
      first.executionId,
      firstWork.leaseGeneration,
    );
    await expect(
      recordYouTubeExecutionFailure(db, {
        workspaceId: owner.workspace.id,
        executionId: first.executionId,
        failureCategory: "stale_worker_must_not_mutate",
        needsAttention: true,
        channelId: firstWork.channelId,
        leaseGeneration: firstWork.leaseGeneration,
      }),
    ).rejects.toThrow("publish_fence_lost");

    // Simulate a worker crash after the provider result and execution state were persisted,
    // but before the claimed outbox row was acknowledged.
    await adminDb.outboxMessage.update({
      where: { id: publishClaim?.id ?? randomUUID() },
      data: { claimUntil: new Date(0) },
    });
    await expect(
      finishOutboxMessage(workerDb, {
        id: publishClaim?.id ?? randomUUID(),
        outcome: "completed",
        claimOwner: publishClaim?.claimOwner ?? `${workerId}-published-crash`,
        claimGeneration: publishClaim?.claimGeneration ?? 0n,
      }),
    ).rejects.toThrow("outbox_claim_lost");
    const recoveryClaim = await claimNextOutboxMessage(workerDb, `${workerId}-recovery`);
    expect(recoveryClaim).toMatchObject({
      id: secondClaim?.id,
      platformExecutionId: first.executionId,
      attempt: 1,
    });
    await expect(
      readYouTubeExecutionWorkItem(db, owner.workspace.id, first.executionId),
    ).rejects.toThrow("execution_terminal");
    await recordClaimedYouTubeExecutionFailureAndCompleteOutbox(workerDb, {
      workspaceId: owner.workspace.id,
      executionId: first.executionId,
      outboxMessageId: recoveryClaim?.id ?? randomUUID(),
      claimOwner: recoveryClaim?.claimOwner ?? `${workerId}-recovery`,
      claimGeneration: recoveryClaim?.claimGeneration ?? 0n,
      failureCategory: "execution_terminal",
      needsAttention: false,
    });
    await expect(
      finishOutboxMessage(workerDb, {
        id: recoveryClaim?.id ?? randomUUID(),
        outcome: "retry",
        failureCategory: "must_not_resurrect",
        retryAfterSeconds: 0,
        claimOwner: recoveryClaim?.claimOwner ?? `${workerId}-recovery`,
        claimGeneration: recoveryClaim?.claimGeneration ?? 0n,
      }),
    ).rejects.toThrow("outbox_claim_lost");
    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.auditEvent.count({
          where: {
            workspaceId: owner.workspace.id,
            targetId: first.executionId,
            action: "platform.published",
          },
        }),
      ),
    ).resolves.toBe(1);
    await expect(
      adminDb.outboxMessage.findUniqueOrThrow({
        where: { id: recoveryClaim?.id ?? randomUUID() },
        select: { state: true, failureCategory: true },
      }),
    ).resolves.toEqual({ state: "COMPLETED", failureCategory: null });
    await expect(
      recordClaimedYouTubeExecutionFailureAndCompleteOutbox(workerDb, {
        workspaceId: owner.workspace.id,
        executionId: first.executionId,
        outboxMessageId: recoveryClaim?.id ?? randomUUID(),
        claimOwner: recoveryClaim?.claimOwner ?? `${workerId}-recovery`,
        claimGeneration: recoveryClaim?.claimGeneration ?? 0n,
        failureCategory: "execution_terminal",
        needsAttention: false,
      }),
    ).rejects.toThrow("outbox_claim_lost");
    await expect(
      finishOutboxMessage(workerDb, {
        id: secondClaim?.id ?? randomUUID(),
        outcome: "retry",
        failureCategory: "stale_claim_must_not_resurrect",
        retryAfterSeconds: 0,
        claimOwner: secondClaim?.claimOwner ?? workerId,
        claimGeneration: secondClaim?.claimGeneration ?? 0n,
      }),
    ).rejects.toThrow("outbox_claim_lost");

    // A disconnect that completes after an in-flight provider upload must close the
    // execution and outbox before authorized channel references are erased.
    await adminDb.$transaction([
      adminDb.platformExecution.update({
        where: { id: first.executionId },
        data: { state: "PROCESSING", failureCategory: null },
      }),
      adminDb.outboxMessage.update({
        where: { id: secondClaim?.id ?? randomUUID() },
        data: {
          state: "PENDING",
          completedAt: null,
          claimedAt: null,
          claimOwner: null,
          claimUntil: null,
          failureCategory: null,
          availableAt: new Date(),
        },
      }),
    ]);
    const disconnect = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const disconnectWorkerId = `disconnect-${randomUUID()}`;
    const claimedDisconnect = await adminDb.lifecycleOperation.update({
      where: { id: disconnect.operationId ?? randomUUID() },
      data: {
        state: "CLAIMED",
        claimedBy: disconnectWorkerId,
        claimedUntil: new Date(Date.now() + 120_000),
        claimGeneration: { increment: 1 },
      },
    });
    await completeYouTubeDisconnect(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      lifecycleClaim: {
        operationId: claimedDisconnect.id,
        workerId: disconnectWorkerId,
        claimGeneration: claimedDisconnect.claimGeneration,
      },
    });
    await expect(
      adminDb.platformExecution.findUniqueOrThrow({ where: { id: first.executionId } }),
    ).resolves.toMatchObject({
      state: "NEEDS_ATTENTION",
      failureCategory: "channel_disconnected_during_processing",
      providerId: null,
      providerUrl: null,
    });
    await expect(
      adminDb.outboxMessage.findUniqueOrThrow({ where: { id: secondClaim?.id ?? randomUUID() } }),
    ).resolves.toMatchObject({ state: "DEAD", failureCategory: "channel_disconnected" });
  });
});
