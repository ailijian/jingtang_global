import { createHash, randomUUID } from "node:crypto";

import { tikTokOAuthScopes, youtubeOAuthScopes } from "@jingtang/application";
import {
  accountAuthorizedDataDeletionPending,
  beginTikTokConnection,
  beginWorkspaceDataDeletion,
  beginYouTubeConnection,
  claimLifecycleOperation,
  completeAuthorizedDataRetention,
  completeAccountDeletion,
  completeTikTokConnection,
  completeWorkspaceDataDeletion,
  completeYouTubeConnection,
  completeYouTubeDisconnect,
  changeMemberRole,
  createDatabaseClient,
  createSession,
  createWorkspace,
  enqueueDueLifecycleOperations,
  enqueueTokenKeyRetirement,
  failWorkspaceDataDeletion,
  failYouTubeDisconnect,
  finishLifecycleOperation,
  LifecycleOperationKind,
  LifecycleOperationState,
  LifecycleStepState,
  listUserWorkspaces,
  lifecycleOperationDeadlineExceeded,
  listAccountAuthorizedChannelsForDeletion,
  prepareYouTubeDisconnect,
  prepareAccountIdentityDeletion,
  purgeExpiredLifecycleRecords,
  readSession,
  readExpiredYouTubeAuthorization,
  readWorkspaceDataDeletionMaterial,
  readWorkspaceDataDeletionStatus,
  readYouTubeDisconnectMaterial,
  recordConsent,
  recordExpiredAuthorizedDataDeletion,
  recordLifecycleStep,
  refreshYouTubeAuthorizedData,
  renewLifecycleOperationClaim,
  removeMember,
  requestAccountDeletion,
  selectWorkspace,
  upsertIdentityUser,
  withTenant,
  type LifecycleClaimGuard,
} from "@jingtang/db";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const workerDatabaseUrl = process.env.DATABASE_WORKER_URL;
if (!databaseUrl || !workerDatabaseUrl) {
  throw new Error("DATABASE_URL and DATABASE_WORKER_URL are required for D6 integration tests");
}

const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const workerDb = createDatabaseClient(workerDatabaseUrl);
const vault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

async function fixture(label: string) {
  const email = `d6-${label}-${randomUUID()}@example.test`;
  const user = await upsertIdentityUser(db, {
    subject: `d6-${label}-${randomUUID()}`,
    email,
    name: label,
    locale: "en",
  });
  const session = await createSession(db, {
    userId: user.id,
    secret: "integration-secret-at-least-32-bytes",
  });
  const workspaceName = `${label} Workspace`;
  const workspace = await createWorkspace(db, {
    name: workspaceName,
    userId: user.id,
    sessionId: session.id,
    correlationId: randomUUID(),
  });
  const consent = await recordConsent(db, {
    userId: user.id,
    termsVersion: "d6-terms-v1",
    privacyVersion: "d6-privacy-v1",
    dataPurposeVersion: "d6-youtube-purpose-v1",
    displayedLocale: "en",
    acceptanceMethod: "youtube_connection_checkbox",
  });
  return { user, email, session, workspace: { ...workspace, name: workspaceName }, consent };
}

async function connectedChannel(owner: Awaited<ReturnType<typeof fixture>>, externalId: string) {
  const channel = await beginYouTubeConnection(db, {
    workspaceId: owner.workspace.id,
    consentRecordId: owner.consent.id,
    actorUserId: owner.user.id,
    correlationId: randomUUID(),
  });
  const envelope = await vault.seal({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: new Date("2030-01-01T00:00:00.000Z").toISOString(),
    grantedScopes: youtubeOAuthScopes,
  });
  await completeYouTubeConnection(db, {
    workspaceId: owner.workspace.id,
    channelId: channel.id,
    consentRecordId: owner.consent.id,
    actorUserId: owner.user.id,
    externalAccountId: externalId,
    displayName: `${externalId} channel`,
    grantedScopes: youtubeOAuthScopes,
    tokenEnvelopeCiphertext: envelope.ciphertext,
    tokenCiphertextReference: envelope.keyReference,
    correlationId: randomUUID(),
  });
  return { channel, envelope };
}

async function forceClaim(operationId: string, workerId: string): Promise<LifecycleClaimGuard> {
  const operation = await adminDb.lifecycleOperation.update({
    where: { id: operationId },
    data: {
      state: "CLAIMED",
      claimedBy: workerId,
      claimedUntil: new Date(Date.now() + 120_000),
      claimGeneration: { increment: 1 },
      attempt: { increment: 1 },
    },
    select: { claimGeneration: true },
  });
  return { operationId, workerId, claimGeneration: operation.claimGeneration };
}

async function completeTokenKeyRetirement(input: {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly correlationId: string;
  readonly keyReference: string;
}): Promise<void> {
  const operation = await adminDb.lifecycleOperation.findFirstOrThrow({
    where: {
      kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      correlationId: input.correlationId,
    },
  });
  const guard = await forceClaim(operation.id, `token-retirement-${randomUUID()}`);
  await vault.destroy(input.keyReference);
  await expect(
    finishLifecycleOperation(workerDb, {
      ...guard,
      state: LifecycleOperationState.COMPLETED,
    }),
  ).resolves.toBe(true);
}

afterAll(async () =>
  Promise.all([db.$disconnect(), adminDb.$disconnect(), workerDb.$disconnect()]),
);

describe("D6 unified trust lifecycle", () => {
  it("makes disconnect request-only at the BFF and fences all worker cleanup", async () => {
    const owner = await fixture("disconnect-owner");
    const { channel, envelope } = await connectedChannel(owner, "UC_D6_DISCONNECT");
    const disconnectCorrelationId = randomUUID();
    const request = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: disconnectCorrelationId,
    });
    expect(request.operationId).toBeTruthy();
    let guard = await forceClaim(request.operationId!, `disconnect-${randomUUID()}`);

    await expect(
      completeYouTubeDisconnect(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        lifecycleClaim: guard,
      }),
    ).rejects.toThrow("lifecycle_claim_lost");

    await failYouTubeDisconnect(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      failureCategory: "service_unavailable",
      lifecycleClaim: guard,
    });
    await finishLifecycleOperation(workerDb, {
      ...guard,
      state: LifecycleOperationState.RETRY,
      failureCategory: "service_unavailable",
      retryAfterSeconds: 3_600,
    });
    await expect(
      prepareYouTubeDisconnect(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
      }),
    ).resolves.toMatchObject({ operationId: request.operationId });
    const [wokenOperation, wokenChannel] = await Promise.all([
      adminDb.lifecycleOperation.findUniqueOrThrow({ where: { id: request.operationId! } }),
      adminDb.channel.findUniqueOrThrow({ where: { id: channel.id } }),
    ]);
    expect(wokenOperation.state).toBe("RETRY");
    expect(wokenOperation.failureCategory).toBeNull();
    expect(wokenOperation.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(wokenChannel.revokeFailureCategory).toBeNull();
    guard = await forceClaim(request.operationId!, `disconnect-retry-${randomUUID()}`);

    const currentGeneration = await adminDb.channel.findUniqueOrThrow({
      where: { id: channel.id },
      select: { operationGeneration: true },
    });
    await adminDb.channel.update({
      where: { id: channel.id },
      data: {
        operationLeaseId: randomUUID(),
        operationLeaseUntil: new Date(Date.now() + 120_000),
        // Disconnect has already advanced the generation. The physical upload
        // lease belongs to work that started before the deny fence.
        operationLeaseGeneration: currentGeneration.operationGeneration - 1n,
      },
    });
    await expect(
      readYouTubeDisconnectMaterial(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        lifecycleClaim: guard,
      }),
    ).resolves.toMatchObject({ operationsInFlight: true });
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: randomUUID(),
        lifecycleClaim: guard,
      }),
    ).rejects.toThrow("channel_operations_in_flight");
    await adminDb.channel.update({
      where: { id: channel.id },
      data: {
        operationLeaseId: null,
        operationLeaseUntil: null,
        operationLeaseGeneration: null,
      },
    });

    const material = await readYouTubeDisconnectMaterial(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      lifecycleClaim: guard,
    });
    expect(material.tokenCiphertextReference).toBe(envelope.keyReference);
    expect(material.operationsInFlight).toBe(false);
    await expect(vault.open(envelope.ciphertext, envelope.keyReference)).resolves.toMatchObject({
      refreshToken: "refresh-token",
    });
    await expect(
      recordLifecycleStep(workerDb, {
        ...guard,
        name: "provider_revoke",
        ordinal: 10,
        state: LifecycleStepState.COMPLETED,
        outcome: { provider_revoked: true },
      }),
    ).resolves.toBe(true);
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        revocationOutcome: "provider_revoked",
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(false);
    const parentOperation = await adminDb.lifecycleOperation.findUniqueOrThrow({
      where: { id: request.operationId! },
      select: { deadlineAt: true },
    });
    const retirementOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        channelId: channel.id,
        correlationId: disconnectCorrelationId,
      },
      select: { deadlineAt: true },
    });
    expect(retirementOperation.deadlineAt).toEqual(parentOperation.deadlineAt);
    await completeTokenKeyRetirement({
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      correlationId: disconnectCorrelationId,
      keyReference: envelope.keyReference,
    });
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        revocationOutcome: "provider_revoked",
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(true);
    await expect(
      finishLifecycleOperation(workerDb, {
        ...guard,
        state: LifecycleOperationState.COMPLETED,
        outcome: { provider_revoked: true },
      }),
    ).resolves.toBe(true);

    await expect(vault.open(envelope.ciphertext, envelope.keyReference)).rejects.toThrow(
      "OAuth token envelope could not be authenticated",
    );
    await expect(
      failYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: randomUUID(),
        failureCategory: "stale_worker",
        lifecycleClaim: guard,
      }),
    ).rejects.toThrow("lifecycle_claim_lost");
    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.channel.findUniqueOrThrow({ where: { id: channel.id } }),
      ),
    ).resolves.toMatchObject({
      state: "DISCONNECTED",
      externalAccountId: null,
      tokenEnvelopeCiphertext: null,
      tokenCiphertextReference: null,
    });
  });

  it("closes TikTok disconnects without mutating published history or mislabeling audit evidence", async () => {
    const owner = await fixture("tiktok-disconnect");
    const accountReference = `tiktok-${randomUUID()}`;
    const channel = await beginTikTokConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      oauthStateDigest: createHash("sha256").update(randomUUID()).digest("hex"),
    });
    const envelope = await vault.seal({
      accessToken: "tiktok-access-token",
      accessTokenExpiresAt: new Date("2030-01-01T00:00:00.000Z").toISOString(),
      refreshToken: "tiktok-refresh-token",
      refreshTokenExpiresAt: new Date("2031-01-01T00:00:00.000Z").toISOString(),
      openId: accountReference,
      grantedScopes: tikTokOAuthScopes,
    });
    await completeTikTokConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      externalAccountId: accountReference,
      displayName: "TikTok lifecycle account",
      grantedScopes: tikTokOAuthScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      correlationId: randomUUID(),
    });

    const content = await adminDb.content.create({
      data: {
        workspaceId: owner.workspace.id,
        internalTitle: "TikTok lifecycle evidence",
        status: "APPROVED",
        createdByUserId: owner.user.id,
      },
    });
    const sourceAsset = await adminDb.sourceAsset.create({
      data: {
        workspaceId: owner.workspace.id,
        contentId: content.id,
        objectKey: `integration/tiktok/${randomUUID()}.mp4`,
        originalFilename: "tiktok-lifecycle.mp4",
        mediaType: "video/mp4",
        byteSize: 1024n,
        durationSeconds: 10,
        sha256: createHash("sha256").update("tiktok-lifecycle").digest("hex"),
        status: "COMPLETE",
        ownershipConfirmed: true,
        uploadedByUserId: owner.user.id,
      },
    });
    const revision = await adminDb.contentRevision.create({
      data: {
        workspaceId: owner.workspace.id,
        contentId: content.id,
        revisionNumber: 1,
        sourceAssetId: sourceAsset.id,
        createdByUserId: owner.user.id,
        submittedAt: new Date(),
      },
    });
    const platformVersion = await adminDb.platformVersion.create({
      data: {
        workspaceId: owner.workspace.id,
        revisionId: revision.id,
        platform: "TIKTOK",
        accountReference,
        accountDisplayName: "TikTok lifecycle account",
        title: "Private TikTok lifecycle evidence",
        description: "SELF_ONLY",
        privacyStatus: "PRIVATE",
        madeForKids: false,
      },
    });
    const payloadSnapshot = {
      platform: "tiktok",
      account_reference: accountReference,
      privacy_level: "SELF_ONLY",
    };
    const publishingIntent = await adminDb.publishingIntent.create({
      data: {
        workspaceId: owner.workspace.id,
        contentId: content.id,
        revisionId: revision.id,
        platformVersionIds: [platformVersion.id],
        accountReferences: [accountReference],
        payloadSnapshot,
        permissionDecision: "allowed",
        state: "READY",
        mode: "IMMEDIATE",
        confirmedByUserId: owner.user.id,
        consentVersion: "tiktok-private-direct-post-v1",
        payloadHash: createHash("sha256").update(JSON.stringify(payloadSnapshot)).digest("hex"),
        idempotencyKey: randomUUID(),
        confirmedAt: new Date(),
      },
    });
    const execution = await adminDb.platformExecution.create({
      data: {
        workspaceId: owner.workspace.id,
        publishingIntentId: publishingIntent.id,
        platformVersionId: platformVersion.id,
        operation: "publish_now",
        attempt: 1,
        idempotencyKey: randomUUID(),
        state: "PUBLISHED",
        providerId: "private-publish-reference",
        providerUrl: null,
      },
    });

    const disconnectCorrelationId = randomUUID();
    const request = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: disconnectCorrelationId,
      platform: "tiktok",
    });
    if (!request.operationId) throw new Error("TikTok disconnect operation was not created");
    let guard = await forceClaim(request.operationId, `tiktok-disconnect-failure-${randomUUID()}`);
    await expect(
      failYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        failureCategory: "service_unavailable",
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(true);
    await expect(
      adminDb.auditEvent.findFirstOrThrow({
        where: {
          workspaceId: owner.workspace.id,
          action: "channel.disconnect_failed",
          correlationId: disconnectCorrelationId,
        },
        orderBy: { occurredAt: "desc" },
      }),
    ).resolves.toMatchObject({
      metadata: { platform: "tiktok", failure_category: "service_unavailable" },
    });
    await finishLifecycleOperation(workerDb, {
      ...guard,
      state: LifecycleOperationState.RETRY,
      failureCategory: "service_unavailable",
      retryAfterSeconds: 3_600,
    });
    await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: disconnectCorrelationId,
      platform: "tiktok",
    });
    guard = await forceClaim(request.operationId, `tiktok-disconnect-success-${randomUUID()}`);

    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        revocationOutcome: "provider_revoked",
        lifecycleClaim: guard,
        platform: "tiktok",
      }),
    ).resolves.toBe(false);
    await completeTokenKeyRetirement({
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      correlationId: disconnectCorrelationId,
      keyReference: envelope.keyReference,
    });
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        revocationOutcome: "provider_revoked",
        lifecycleClaim: guard,
        platform: "tiktok",
      }),
    ).resolves.toBe(true);
    await expect(
      finishLifecycleOperation(workerDb, {
        ...guard,
        state: LifecycleOperationState.COMPLETED,
      }),
    ).resolves.toBe(true);

    await expect(
      adminDb.channel.findUniqueOrThrow({ where: { id: channel.id } }),
    ).resolves.toMatchObject({
      state: "DISCONNECTED",
      externalAccountId: null,
      displayName: null,
      grantedScopes: [],
      consentRecordId: null,
      tokenCiphertextReference: null,
      tokenEnvelopeCiphertext: null,
      disconnectedAt: expect.any(Date),
    });
    await expect(
      adminDb.platformVersion.findUniqueOrThrow({ where: { id: platformVersion.id } }),
    ).resolves.toMatchObject({
      accountReference: `disconnected:${channel.id}`,
      accountDisplayName: "Disconnected TikTok account",
    });
    await expect(
      adminDb.platformExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).resolves.toMatchObject({ state: "PUBLISHED", providerId: null, providerUrl: null });
    await expect(
      adminDb.publishingIntent.findUniqueOrThrow({ where: { id: publishingIntent.id } }),
    ).resolves.toMatchObject({
      accountReferences: [`disconnected:${channel.id}`],
      payloadSnapshot: {
        platform: "tiktok",
        account_reference: `disconnected:${channel.id}`,
        privacy_level: "SELF_ONLY",
      },
    });
    await expect(
      adminDb.auditEvent.findFirstOrThrow({
        where: {
          workspaceId: owner.workspace.id,
          action: "channel.disconnected",
          targetId: channel.id,
        },
        orderBy: { occurredAt: "desc" },
      }),
    ).resolves.toMatchObject({
      metadata: {
        platform: "tiktok",
        authorized_data_deleted: true,
        revocation_outcome: "provider_revoked",
      },
    });
  });

  it("keeps a disconnect open for a deduplicated key retirement from another flow", async () => {
    const owner = await fixture("disconnect-deduplicated-retirement");
    const { channel, envelope } = await connectedChannel(owner, "UC_D6_DEDUPED_RETIREMENT");
    const earlierCorrelationId = randomUUID();
    await withTenant(db, owner.workspace.id, (transaction) =>
      enqueueTokenKeyRetirement(transaction, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        keyReference: envelope.keyReference,
        correlationId: earlierCorrelationId,
        deadlineAt: new Date("2100-01-01T00:00:00.000Z"),
      }),
    );

    const disconnectCorrelationId = randomUUID();
    const request = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: disconnectCorrelationId,
    });
    if (!request.operationId) throw new Error("disconnect operation was not created");
    const guard = await forceClaim(request.operationId, `disconnect-deduped-${randomUUID()}`);

    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(false);

    const parent = await adminDb.lifecycleOperation.findUniqueOrThrow({
      where: { id: request.operationId },
      select: { deadlineAt: true },
    });
    const retirements = await adminDb.lifecycleOperation.findMany({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        channelId: channel.id,
      },
    });
    expect(retirements).toHaveLength(1);
    const retirement = retirements[0];
    if (!retirement) throw new Error("retirement operation was not preserved");
    expect(retirement.correlationId).toBe(earlierCorrelationId);
    expect(retirement.deadlineAt).toEqual(parent.deadlineAt);
    expect(retirement.subjectUserId).toBe(owner.user.id);

    const retirementGuard = await forceClaim(
      retirement.id,
      `token-retirement-deduped-${randomUUID()}`,
    );
    await vault.destroy(envelope.keyReference);
    await expect(
      finishLifecycleOperation(workerDb, {
        ...retirementGuard,
        state: LifecycleOperationState.COMPLETED,
      }),
    ).resolves.toBe(true);
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(true);
  });

  it("creates one retention operation per expiry cycle and refreshes only the exact channel", async () => {
    const owner = await fixture("retention-owner");
    const { channel, envelope } = await connectedChannel(owner, "UC_D6_RETENTION");
    const firstExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await adminDb.channel.update({
      where: { id: channel.id },
      data: { authorizedDataExpiresAt: firstExpiry },
    });
    await enqueueDueLifecycleOperations(workerDb);
    const firstOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: { channelId: channel.id, kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION },
      orderBy: { requestedAt: "desc" },
    });
    expect(firstOperation.deadlineAt.getTime()).toBe(firstExpiry.getTime());
    const firstGuard = await forceClaim(firstOperation.id, `retention-a-${randomUUID()}`);
    await adminDb.channel.update({
      where: { id: channel.id },
      data: {
        operationLeaseId: randomUUID(),
        operationLeaseUntil: new Date(Date.now() + 120_000),
        operationLeaseGeneration: channel.operationGeneration,
      },
    });
    await expect(
      readExpiredYouTubeAuthorization(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        expectedAuthorizedDataExpiresAt: firstOperation.deadlineAt,
        lifecycleClaim: firstGuard,
      }),
    ).rejects.toThrow("authorized_data_refresh_blocked");
    await adminDb.channel.update({
      where: { id: channel.id },
      data: {
        operationLeaseId: null,
        operationLeaseUntil: null,
        operationLeaseGeneration: null,
      },
    });
    const material = await readExpiredYouTubeAuthorization(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      expectedAuthorizedDataExpiresAt: firstOperation.deadlineAt,
      lifecycleClaim: firstGuard,
    });
    expect(material.externalAccountId).toBe("UC_D6_RETENTION");

    const refreshedEnvelope = await vault.seal({
      accessToken: "refreshed-access",
      refreshToken: "refreshed-refresh",
      expiresAt: "2030-01-01T00:00:00.000Z",
      grantedScopes: youtubeOAuthScopes,
    });
    const firstRefreshCorrelationId = randomUUID();
    await refreshYouTubeAuthorizedData(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      tokenEnvelopeCiphertext: refreshedEnvelope.ciphertext,
      tokenCiphertextReference: refreshedEnvelope.keyReference,
      externalAccountId: material.externalAccountId,
      expectedTokenCiphertextReference: material.tokenCiphertextReference,
      expectedAuthorizedDataExpiresAt: firstOperation.deadlineAt,
      channelOperationGeneration: material.channelOperationGeneration,
      displayName: "Exact retained channel",
      now: new Date(),
      correlationId: firstRefreshCorrelationId,
      lifecycleClaim: firstGuard,
    });
    await expect(
      adminDb.lifecycleOperation.findFirst({
        where: {
          kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
          workspaceId: owner.workspace.id,
          channelId: channel.id,
        },
      }),
    ).resolves.toMatchObject({ outcome: { key_reference: envelope.keyReference } });
    await expect(
      completeAuthorizedDataRetention(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: firstRefreshCorrelationId,
        lifecycleClaim: firstGuard,
      }),
    ).resolves.toBe(false);
    await completeTokenKeyRetirement({
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      correlationId: firstRefreshCorrelationId,
      keyReference: envelope.keyReference,
    });
    await expect(
      completeAuthorizedDataRetention(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: firstRefreshCorrelationId,
        lifecycleClaim: firstGuard,
      }),
    ).resolves.toBe(true);
    await finishLifecycleOperation(workerDb, {
      ...firstGuard,
      state: LifecycleOperationState.COMPLETED,
    });
    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.channel.findUniqueOrThrow({ where: { id: channel.id } }),
      ),
    ).resolves.toMatchObject({
      externalAccountId: "UC_D6_RETENTION",
      displayName: "Exact retained channel",
      tokenCiphertextReference: refreshedEnvelope.keyReference,
    });

    await adminDb.channel.update({
      where: { id: channel.id },
      data: { authorizedDataExpiresAt: new Date("2026-08-02T00:00:00.000Z") },
    });
    await enqueueDueLifecycleOperations(workerDb);
    const operations = await adminDb.lifecycleOperation.findMany({
      where: { channelId: channel.id, kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION },
      orderBy: { requestedAt: "asc" },
    });
    expect(operations).toHaveLength(2);
    expect(new Set(operations.map((operation) => operation.dedupeKey)).size).toBe(2);
    const secondOperation = operations[1];
    if (!secondOperation) throw new Error("second retention operation was not enqueued");
    const secondGuard = await forceClaim(secondOperation.id, `retention-b-${randomUUID()}`);
    const secondMaterial = await readExpiredYouTubeAuthorization(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      expectedAuthorizedDataExpiresAt: secondOperation.deadlineAt,
      lifecycleClaim: secondGuard,
    });

    await expect(
      refreshYouTubeAuthorizedData(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        tokenEnvelopeCiphertext: refreshedEnvelope.ciphertext,
        tokenCiphertextReference: refreshedEnvelope.keyReference,
        externalAccountId: secondMaterial.externalAccountId,
        expectedTokenCiphertextReference: secondMaterial.tokenCiphertextReference,
        expectedAuthorizedDataExpiresAt: secondOperation.deadlineAt,
        channelOperationGeneration: secondMaterial.channelOperationGeneration,
        displayName: "Must not refresh after deadline",
        now: secondOperation.deadlineAt,
        correlationId: randomUUID(),
        lifecycleClaim: secondGuard,
      }),
    ).rejects.toThrow("authorized_data_refresh_deadline_exceeded");

    await expect(
      refreshYouTubeAuthorizedData(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        tokenEnvelopeCiphertext: refreshedEnvelope.ciphertext,
        tokenCiphertextReference: refreshedEnvelope.keyReference,
        externalAccountId: "UC_DIFFERENT_CHANNEL",
        expectedTokenCiphertextReference: secondMaterial.tokenCiphertextReference,
        expectedAuthorizedDataExpiresAt: secondOperation.deadlineAt,
        channelOperationGeneration: secondMaterial.channelOperationGeneration,
        displayName: "Must not replace identity",
        now: new Date(),
        correlationId: randomUUID(),
        lifecycleClaim: secondGuard,
      }),
    ).rejects.toThrow("authorized_data_refresh_superseded");
    const deletionCorrelationId = randomUUID();
    await recordExpiredAuthorizedDataDeletion(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      correlationId: deletionCorrelationId,
      expectedTokenCiphertextReference: secondMaterial.tokenCiphertextReference,
      channelOperationGeneration: secondMaterial.channelOperationGeneration,
      now: new Date(),
      lifecycleClaim: secondGuard,
    });
    await expect(
      completeAuthorizedDataRetention(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: deletionCorrelationId,
        lifecycleClaim: secondGuard,
      }),
    ).resolves.toBe(false);
    await expect(
      adminDb.auditEvent.findFirst({
        where: {
          workspaceId: owner.workspace.id,
          action: "data.retention_deleted",
          targetId: channel.id,
          correlationId: deletionCorrelationId,
        },
      }),
    ).resolves.toBeNull();
    await expect(
      finishLifecycleOperation(workerDb, {
        ...secondGuard,
        state: LifecycleOperationState.RETRY,
        failureCategory: "lifecycle_cleanup_pending",
        retryAfterSeconds: 60,
      }),
    ).resolves.toBe(true);
    const retirementOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: deletionCorrelationId,
      },
      select: { id: true },
    });
    const deferredUnrelatedOperations = await adminDb.lifecycleOperation.findMany({
      where: {
        id: { notIn: [secondOperation.id, retirementOperation.id] },
        state: { in: [LifecycleOperationState.PENDING, LifecycleOperationState.RETRY] },
        nextAttemptAt: { lte: new Date() },
      },
      select: { id: true, nextAttemptAt: true },
    });
    await adminDb.lifecycleOperation.updateMany({
      where: { id: { in: deferredUnrelatedOperations.map((operation) => operation.id) } },
      data: { nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
    });
    const retirementWorkerId = `retention-child-${randomUUID()}`;
    const retirementClaim = await claimLifecycleOperation(workerDb, retirementWorkerId);
    await Promise.all(
      deferredUnrelatedOperations.map((operation) =>
        adminDb.lifecycleOperation.update({
          where: { id: operation.id },
          data: { nextAttemptAt: operation.nextAttemptAt },
        }),
      ),
    );
    expect(retirementClaim).toMatchObject({
      kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      correlationId: deletionCorrelationId,
    });
    if (!retirementClaim) throw new Error("token retirement child was not claimable");
    await vault.destroy(refreshedEnvelope.keyReference);
    await expect(
      finishLifecycleOperation(workerDb, {
        operationId: retirementClaim.id,
        workerId: retirementWorkerId,
        claimGeneration: retirementClaim.claimGeneration,
        state: LifecycleOperationState.COMPLETED,
      }),
    ).resolves.toBe(true);
    const resumedGuard = await forceClaim(secondOperation.id, `retention-resume-${randomUUID()}`);
    await expect(
      completeAuthorizedDataRetention(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: deletionCorrelationId,
        lifecycleClaim: resumedGuard,
      }),
    ).resolves.toBe(true);
    await expect(
      adminDb.auditEvent.findFirst({
        where: {
          workspaceId: owner.workspace.id,
          action: "data.retention_deleted",
          targetId: channel.id,
          correlationId: deletionCorrelationId,
        },
      }),
    ).resolves.toMatchObject({ result: "success" });
    await finishLifecycleOperation(workerDb, {
      ...resumedGuard,
      state: LifecycleOperationState.COMPLETED,
    });
    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.channel.findUniqueOrThrow({ where: { id: channel.id } }),
      ),
    ).resolves.toMatchObject({
      state: "REAUTHORIZATION_REQUIRED",
      externalAccountId: null,
      tokenEnvelopeCiphertext: null,
      tokenCiphertextReference: null,
    });
  });

  it("never schedules an Authorized Data retry beyond its expiry deadline", async () => {
    const owner = await fixture("retention-retry-deadline");
    const { channel } = await connectedChannel(owner, "UC_D6_RETENTION_RETRY");
    const expiry = new Date(Date.now() + 30_000);
    await adminDb.channel.update({
      where: { id: channel.id },
      data: { authorizedDataExpiresAt: expiry },
    });
    await enqueueDueLifecycleOperations(workerDb);
    const operation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        channelId: channel.id,
        kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION,
      },
      orderBy: { requestedAt: "desc" },
    });
    const guard = await forceClaim(operation.id, `retention-retry-${randomUUID()}`);

    await expect(
      finishLifecycleOperation(workerDb, {
        ...guard,
        state: LifecycleOperationState.RETRY,
        retryAfterSeconds: 900,
      }),
    ).resolves.toBe(true);
    const retried = await adminDb.lifecycleOperation.findUniqueOrThrow({
      where: { id: operation.id },
      select: { state: true, nextAttemptAt: true, deadlineAt: true },
    });
    expect(retried.state).toBe(LifecycleOperationState.RETRY);
    expect(retried.nextAttemptAt.getTime()).toBeLessThanOrEqual(retried.deadlineAt.getTime());
  });

  it("deletes Workspace data only through the claimed worker operation", async () => {
    const owner = await fixture("workspace-delete-owner");
    const { channel, envelope } = await connectedChannel(owner, "UC_D6_WORKSPACE_DELETE");
    await adminDb.channel.update({
      where: { id: channel.id },
      data: {
        operationLeaseId: randomUUID(),
        operationLeaseUntil: new Date(Date.now() + 120_000),
        operationLeaseGeneration: channel.operationGeneration,
      },
    });
    const outsider = await upsertIdentityUser(db, {
      subject: `d6-workspace-delete-outsider-${randomUUID()}`,
      email: `d6-workspace-delete-outsider-${randomUUID()}@example.test`,
      name: "Workspace deletion outsider",
      locale: "en",
    });
    await adminDb.user.update({
      where: { id: outsider.id },
      data: { lastWorkspaceId: owner.workspace.id },
    });
    await expect(
      beginWorkspaceDataDeletion(db, {
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        confirmedWorkspaceName: "wrong name",
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("workspace_confirmation_mismatch");
    const deletionCorrelationId = randomUUID();
    const deletion = await beginWorkspaceDataDeletion(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      confirmedWorkspaceName: owner.workspace.name,
      correlationId: deletionCorrelationId,
    });
    expect(deletion.operationsInFlight).toBe(true);
    const request = await adminDb.dataDeletionRequest.findUniqueOrThrow({
      where: { id: deletion.requestId },
    });
    await expect(
      readWorkspaceDataDeletionStatus(db, {
        requestReference: deletion.requestReference,
        viewerUserId: owner.user.id,
      }),
    ).resolves.toMatchObject({ state: "processing" });
    await expect(
      readWorkspaceDataDeletionStatus(db, {
        requestReference: deletion.requestReference,
        viewerUserId: outsider.id,
      }),
    ).resolves.toBeNull();
    if (!request.lifecycleOperationId) throw new Error("deletion operation was not linked");
    const guard = await forceClaim(
      request.lifecycleOperationId,
      `workspace-delete-${randomUUID()}`,
    );

    await expect(
      completeWorkspaceDataDeletion(db, {
        workspaceId: owner.workspace.id,
        requestId: deletion.requestId,
        actorUserId: owner.user.id,
        correlationId: deletionCorrelationId,
        lifecycleClaim: guard,
      }),
    ).rejects.toThrow("lifecycle_claim_lost");
    const material = await readWorkspaceDataDeletionMaterial(workerDb, {
      workspaceId: owner.workspace.id,
      lifecycleOperationId: request.lifecycleOperationId,
      lifecycleClaim: guard,
    });
    expect(material.requestReference).toBe(deletion.requestReference);
    expect(material.operationsInFlight).toBe(true);
    await expect(
      completeWorkspaceDataDeletion(workerDb, {
        workspaceId: owner.workspace.id,
        requestId: deletion.requestId,
        actorUserId: owner.user.id,
        correlationId: deletionCorrelationId,
        pendingObjectKeys: [],
        lifecycleClaim: guard,
      }),
    ).rejects.toThrow("workspace_operations_in_flight");
    await adminDb.channel.update({
      where: { id: channel.id },
      data: {
        operationLeaseId: null,
        operationLeaseUntil: null,
        operationLeaseGeneration: null,
      },
    });
    await expect(
      completeWorkspaceDataDeletion(workerDb, {
        workspaceId: owner.workspace.id,
        requestId: deletion.requestId,
        actorUserId: owner.user.id,
        correlationId: deletionCorrelationId,
        pendingObjectKeys: [],
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(false);
    const parentOperation = await adminDb.lifecycleOperation.findUniqueOrThrow({
      where: { id: request.lifecycleOperationId },
      select: { deadlineAt: true },
    });
    const retirementOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        channelId: channel.id,
        correlationId: deletionCorrelationId,
      },
      select: { deadlineAt: true },
    });
    expect(retirementOperation.deadlineAt).toEqual(parentOperation.deadlineAt);
    await completeTokenKeyRetirement({
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      correlationId: deletionCorrelationId,
      keyReference: envelope.keyReference,
    });
    await expect(
      completeWorkspaceDataDeletion(workerDb, {
        workspaceId: owner.workspace.id,
        requestId: deletion.requestId,
        actorUserId: owner.user.id,
        correlationId: deletionCorrelationId,
        pendingObjectKeys: [],
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(true);
    await finishLifecycleOperation(workerDb, {
      ...guard,
      state: LifecycleOperationState.COMPLETED,
    });
    await expect(listUserWorkspaces(db, owner.user.id)).resolves.toEqual([]);
    await expect(
      readWorkspaceDataDeletionStatus(db, {
        requestReference: deletion.requestReference,
        viewerUserId: owner.user.id,
      }),
    ).resolves.toMatchObject({ state: "completed", failureCategory: null });
    await expect(
      adminDb.dataDeletionRequest.findUniqueOrThrow({ where: { id: deletion.requestId } }),
    ).resolves.toMatchObject({ state: "COMPLETED", pendingObjectKeys: [] });
    await expect(
      failWorkspaceDataDeletion(workerDb, {
        workspaceId: owner.workspace.id,
        requestId: deletion.requestId,
        correlationId: randomUUID(),
        failureCategory: "stale_worker",
        lifecycleClaim: guard,
      }),
    ).rejects.toThrow("lifecycle_claim_lost");
  });

  it("moves an affected session to another active Workspace after deletion", async () => {
    const owner = await fixture("workspace-delete-fallback");
    const deletedWorkspace = owner.workspace;
    const fallbackWorkspace = await createWorkspace(db, {
      name: "Fallback Workspace",
      userId: owner.user.id,
      sessionId: owner.session.id,
      correlationId: randomUUID(),
    });
    await selectWorkspace(db, {
      workspaceId: deletedWorkspace.id,
      userId: owner.user.id,
      sessionId: owner.session.id,
      correlationId: randomUUID(),
    });

    const correlationId = randomUUID();
    const deletion = await beginWorkspaceDataDeletion(db, {
      workspaceId: deletedWorkspace.id,
      actorUserId: owner.user.id,
      confirmedWorkspaceName: deletedWorkspace.name,
      correlationId,
    });
    const request = await adminDb.dataDeletionRequest.findUniqueOrThrow({
      where: { id: deletion.requestId },
      select: { lifecycleOperationId: true },
    });
    if (!request.lifecycleOperationId) throw new Error("deletion operation was not linked");
    const guard = await forceClaim(
      request.lifecycleOperationId,
      `workspace-delete-fallback-${randomUUID()}`,
    );

    await expect(
      completeWorkspaceDataDeletion(workerDb, {
        workspaceId: deletedWorkspace.id,
        requestId: deletion.requestId,
        actorUserId: owner.user.id,
        correlationId,
        pendingObjectKeys: [],
        lifecycleClaim: guard,
      }),
    ).resolves.toBe(true);
    await finishLifecycleOperation(workerDb, {
      ...guard,
      state: LifecycleOperationState.COMPLETED,
    });

    await expect(
      readSession(db, owner.session.token, "integration-secret-at-least-32-bytes"),
    ).resolves.toMatchObject({ currentWorkspaceId: fallbackWorkspace.id });
    await expect(listUserWorkspaces(db, owner.user.id)).resolves.toEqual([
      expect.objectContaining({ id: fallbackWorkspace.id, name: "Fallback Workspace" }),
    ]);
    await expect(
      adminDb.user.findUniqueOrThrow({
        where: { id: owner.user.id },
        select: { lastWorkspaceId: true },
      }),
    ).resolves.toEqual({ lastWorkspaceId: fallbackWorkspace.id });
  });

  it("serializes account deletion against the successor Owner leaving", async () => {
    const owner = await fixture("account-delete-owner-race");
    const successor = await upsertIdentityUser(db, {
      subject: `d6-account-successor-race-${randomUUID()}`,
      email: `d6-account-successor-race-${randomUUID()}@example.test`,
      name: "Account deletion successor race",
      locale: "en",
    });
    const successorMembership = await adminDb.membership.create({
      data: {
        workspaceId: owner.workspace.id,
        userId: successor.id,
        role: "OWNER_ADMIN",
        status: "ACTIVE",
      },
    });

    const [deletionResult, removalResult] = await Promise.allSettled([
      requestAccountDeletion(db, {
        userId: owner.user.id,
        confirmedEmail: owner.email,
        correlationId: randomUUID(),
      }),
      removeMember(db, {
        workspaceId: owner.workspace.id,
        actorUserId: successor.id,
        membershipId: successorMembership.id,
        correlationId: randomUUID(),
      }),
    ]);

    expect(
      [deletionResult, removalResult].filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const [ownerState, successorState] = await Promise.all([
      adminDb.user.findUniqueOrThrow({
        where: { id: owner.user.id },
        select: { lifecycleState: true },
      }),
      adminDb.membership.findUniqueOrThrow({
        where: { id: successorMembership.id },
        select: { status: true },
      }),
    ]);
    if (deletionResult.status === "fulfilled") {
      expect(removalResult).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ message: "last_owner" }),
      });
      expect(ownerState.lifecycleState).toBe("deletion_pending");
      expect(successorState.status).toBe("ACTIVE");
    } else {
      expect(deletionResult.reason).toMatchObject({
        message: expect.stringContaining("owner transfer or workspace deletion"),
      });
      expect(removalResult.status).toBe("fulfilled");
      expect(ownerState.lifecycleState).toBe("active");
      expect(successorState.status).toBe("REMOVED");
    }
  });

  it("disconnects channels authorized by a deleted account before removing its identity", async () => {
    const owner = await fixture("account-authorized-data-cleanup");
    const successor = await upsertIdentityUser(db, {
      subject: `d6-account-channel-successor-${randomUUID()}`,
      email: `d6-account-channel-successor-${randomUUID()}@example.test`,
      name: "Account channel cleanup successor",
      locale: "en",
    });
    await adminDb.membership.create({
      data: {
        workspaceId: owner.workspace.id,
        userId: successor.id,
        role: "OWNER_ADMIN",
        status: "ACTIVE",
      },
    });
    const connected = await connectedChannel(owner, `account-delete-channel-${randomUUID()}`);
    const accountCorrelationId = randomUUID();
    const requested = await requestAccountDeletion(db, {
      userId: owner.user.id,
      confirmedEmail: owner.email,
      correlationId: accountCorrelationId,
    });
    const guard = await forceClaim(requested.operationId, `account-channel-${randomUUID()}`);
    const accountOperation = await adminDb.lifecycleOperation.findUniqueOrThrow({
      where: { id: requested.operationId },
      select: { deadlineAt: true },
    });

    await expect(listAccountAuthorizedChannelsForDeletion(db, guard)).rejects.toThrow(
      /permission denied/u,
    );
    const channels = await listAccountAuthorizedChannelsForDeletion(workerDb, guard);
    expect(channels).toEqual([
      {
        userId: owner.user.id,
        workspaceId: owner.workspace.id,
        channelId: connected.channel.id,
      },
    ]);
    await prepareYouTubeDisconnect(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: connected.channel.id,
      actorUserId: owner.user.id,
      correlationId: accountCorrelationId,
      deadlineAt: accountOperation.deadlineAt,
    });
    await expect(accountAuthorizedDataDeletionPending(workerDb, guard)).resolves.toBe(true);
    await expect(adminDb.membership.count({ where: { userId: owner.user.id } })).resolves.toBe(1);

    const disconnectOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        workspaceId: owner.workspace.id,
        channelId: connected.channel.id,
        kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
      },
      orderBy: { requestedAt: "desc" },
    });
    const disconnectGuard = await forceClaim(
      disconnectOperation.id,
      `account-channel-disconnect-${randomUUID()}`,
    );
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: connected.channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectOperation.correlationId,
        lifecycleClaim: disconnectGuard,
      }),
    ).resolves.toBe(false);
    const retirementOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        channelId: connected.channel.id,
        correlationId: disconnectOperation.correlationId,
      },
      select: { deadlineAt: true },
    });
    expect(retirementOperation.deadlineAt).toEqual(accountOperation.deadlineAt);
    await completeTokenKeyRetirement({
      workspaceId: owner.workspace.id,
      channelId: connected.channel.id,
      correlationId: disconnectOperation.correlationId,
      keyReference: connected.envelope.keyReference,
    });
    await expect(accountAuthorizedDataDeletionPending(workerDb, guard)).resolves.toBe(true);
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: connected.channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectOperation.correlationId,
        lifecycleClaim: disconnectGuard,
      }),
    ).resolves.toBe(true);
    await finishLifecycleOperation(workerDb, {
      ...disconnectGuard,
      state: LifecycleOperationState.COMPLETED,
    });

    await expect(accountAuthorizedDataDeletionPending(workerDb, guard)).resolves.toBe(false);
    await expect(
      adminDb.channel.findUniqueOrThrow({ where: { id: connected.channel.id } }),
    ).resolves.toMatchObject({
      state: "DISCONNECTED",
      consentRecordId: null,
      tokenEnvelopeCiphertext: null,
      tokenCiphertextReference: null,
    });
    await expect(prepareAccountIdentityDeletion(workerDb, guard)).resolves.toMatchObject({
      userId: owner.user.id,
    });
    await expect(adminDb.membership.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
    await expect(completeAccountDeletion(workerDb, guard)).resolves.toBe(true);
    await finishLifecycleOperation(workerDb, {
      ...guard,
      state: LifecycleOperationState.COMPLETED,
    });
  });

  it("blocks last-owner account deletion and pseudonymizes an approved account request", async () => {
    const owner = await fixture("account-delete-owner");
    await expect(
      requestAccountDeletion(db, {
        userId: owner.user.id,
        confirmedEmail: owner.email,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("account deletion requires owner transfer or workspace deletion");

    const successor = await upsertIdentityUser(db, {
      subject: `d6-account-successor-${randomUUID()}`,
      email: `d6-account-successor-${randomUUID()}@example.test`,
      name: "Account deletion successor",
      locale: "en",
    });
    const successorMembership = await adminDb.membership.create({
      data: {
        workspaceId: owner.workspace.id,
        userId: successor.id,
        role: "OWNER_ADMIN",
        status: "ACTIVE",
      },
    });
    await expect(
      requestAccountDeletion(db, {
        userId: owner.user.id,
        confirmedEmail: "wrong@example.test",
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("account deletion confirmation mismatch");

    const requested = await requestAccountDeletion(db, {
      userId: owner.user.id,
      confirmedEmail: owner.email,
      correlationId: randomUUID(),
    });
    await expect(adminDb.session.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
    await expect(
      changeMemberRole(db, {
        workspaceId: owner.workspace.id,
        actorUserId: successor.id,
        membershipId: successorMembership.id,
        role: "editor",
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("last_owner");
    await expect(
      removeMember(db, {
        workspaceId: owner.workspace.id,
        actorUserId: successor.id,
        membershipId: successorMembership.id,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("last_owner");
    const guard = await forceClaim(requested.operationId, `account-delete-${randomUUID()}`);
    await expect(
      prepareAccountIdentityDeletion(db, {
        operationId: requested.operationId,
        workerId: guard.workerId,
        claimGeneration: guard.claimGeneration,
      }),
    ).rejects.toThrow(/permission denied/u);
    await adminDb.membership.delete({
      where: { workspaceId_userId: { workspaceId: owner.workspace.id, userId: successor.id } },
    });
    await expect(
      prepareAccountIdentityDeletion(workerDb, {
        operationId: requested.operationId,
        workerId: guard.workerId,
        claimGeneration: guard.claimGeneration,
      }),
    ).rejects.toThrow("account deletion requires owner transfer or workspace deletion");
    await expect(adminDb.membership.count({ where: { userId: owner.user.id } })).resolves.toBe(1);
    await adminDb.membership.create({
      data: {
        workspaceId: owner.workspace.id,
        userId: successor.id,
        role: "OWNER_ADMIN",
        status: "ACTIVE",
      },
    });
    const material = await prepareAccountIdentityDeletion(workerDb, {
      operationId: requested.operationId,
      workerId: guard.workerId,
      claimGeneration: guard.claimGeneration,
    });
    expect(material).toMatchObject({ userId: owner.user.id, email: owner.email });
    await expect(adminDb.membership.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
    await expect(
      completeAccountDeletion(workerDb, {
        operationId: requested.operationId,
        workerId: guard.workerId,
        claimGeneration: guard.claimGeneration,
      }),
    ).resolves.toBe(true);
    await finishLifecycleOperation(workerDb, {
      ...guard,
      state: LifecycleOperationState.COMPLETED,
    });
    await expect(
      adminDb.user.findUniqueOrThrow({ where: { id: owner.user.id } }),
    ).resolves.toMatchObject({
      lifecycleState: "deleted",
      name: "Deleted user",
      lastWorkspaceId: null,
    });
    await expect(adminDb.membership.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
    const operation = await adminDb.lifecycleOperation.findUniqueOrThrow({
      where: { id: requested.operationId },
    });
    const audit = await adminDb.accountAuditEvent.findMany({
      where: { correlationId: operation.correlationId },
      select: { action: true },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "account.deletion_requested",
      "account.deletion_completed",
    ]);
    await expect(
      completeAccountDeletion(workerDb, {
        operationId: requested.operationId,
        workerId: guard.workerId,
        claimGeneration: guard.claimGeneration,
      }),
    ).resolves.toBe(false);
  });

  it("allows only one worker claim generation and rejects stale completion", async () => {
    const operation = await adminDb.lifecycleOperation.create({
      data: {
        kind: LifecycleOperationKind.RETENTION_PURGE,
        dedupeKey: `claim-race-${randomUUID()}`,
        requestReference: `RACE-${randomUUID().slice(0, 12)}`,
        correlationId: randomUUID(),
        requestedAt: new Date("1900-01-01T00:00:00.000Z"),
        deadlineAt: new Date("2100-01-01T00:00:00.000Z"),
        nextAttemptAt: new Date("1900-01-01T00:00:00.000Z"),
        retentionExpiresAt: new Date("2100-01-01T00:00:00.000Z"),
      },
    });
    const claimants = [`claim-a-${randomUUID()}`, `claim-b-${randomUUID()}`];
    const claims = await Promise.all(
      claimants.map(async (workerId) => ({
        workerId,
        claim: await claimLifecycleOperation(workerDb, workerId),
      })),
    );
    const targetClaims = claims.filter((entry) => entry.claim?.id === operation.id);
    expect(targetClaims).toHaveLength(1);
    const first = targetClaims[0];
    if (!first?.claim) throw new Error("race operation was not claimed");
    for (const unrelated of claims.filter(
      (entry) => entry.claim && entry.claim.id !== operation.id,
    )) {
      if (!unrelated.claim) continue;
      await finishLifecycleOperation(workerDb, {
        operationId: unrelated.claim.id,
        workerId: unrelated.workerId,
        claimGeneration: unrelated.claim.claimGeneration,
        state: LifecycleOperationState.RETRY,
        retryAfterSeconds: 3600,
      }).catch(() => undefined);
    }
    await expect(
      recordLifecycleStep(workerDb, {
        operationId: first.claim.id,
        workerId: "wrong-worker",
        claimGeneration: first.claim.claimGeneration,
        name: "purge",
        ordinal: 10,
        state: LifecycleStepState.COMPLETED,
      }),
    ).resolves.toBe(false);
    await expect(
      renewLifecycleOperationClaim(workerDb, {
        operationId: first.claim.id,
        workerId: first.workerId,
        claimGeneration: first.claim.claimGeneration,
      }),
    ).resolves.toBe(true);
    await expect(
      lifecycleOperationDeadlineExceeded(workerDb, {
        operationId: first.claim.id,
        workerId: first.workerId,
        claimGeneration: first.claim.claimGeneration,
      }),
    ).resolves.toBe(false);
    await adminDb.lifecycleOperation.update({
      where: { id: operation.id },
      data: { deadlineAt: new Date("1900-01-01T00:00:00.000Z") },
    });
    await expect(
      lifecycleOperationDeadlineExceeded(workerDb, {
        operationId: first.claim.id,
        workerId: first.workerId,
        claimGeneration: first.claim.claimGeneration,
      }),
    ).resolves.toBe(true);
    await adminDb.lifecycleOperation.update({
      where: { id: operation.id },
      data: { claimedUntil: new Date("1900-01-01T00:00:00.000Z") },
    });
    const reclaimWorker = `claim-c-${randomUUID()}`;
    const reclaimed = await claimLifecycleOperation(workerDb, reclaimWorker);
    expect(reclaimed?.id).toBe(operation.id);
    if (!reclaimed) throw new Error("expired operation was not reclaimed");
    await expect(
      finishLifecycleOperation(workerDb, {
        operationId: first.claim.id,
        workerId: first.workerId,
        claimGeneration: first.claim.claimGeneration,
        state: LifecycleOperationState.COMPLETED,
      }),
    ).resolves.toBe(false);
    await expect(
      finishLifecycleOperation(workerDb, {
        operationId: reclaimed.id,
        workerId: reclaimWorker,
        claimGeneration: reclaimed.claimGeneration,
        state: LifecycleOperationState.COMPLETED,
      }),
    ).resolves.toBe(true);
  });

  it("purges terminated invitations within seven days without deleting active consent evidence", async () => {
    const owner = await fixture("retention-purge");
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const invitation = async (
      label: string,
      status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED",
      expiresAt: Date,
      updatedAt: Date,
    ) =>
      adminDb.invitation.create({
        data: {
          workspaceId: owner.workspace.id,
          email: `${label}-${randomUUID()}@example.test`,
          tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
          role: "VIEWER",
          status,
          invitedByUserId: owner.user.id,
          expiresAt,
          updatedAt,
        },
      });

    const [acceptedOld, revokedOld, expiredOld, pendingExpiredOld] = await Promise.all([
      invitation("accepted-old", "ACCEPTED", future, eightDaysAgo),
      invitation("revoked-old", "REVOKED", future, eightDaysAgo),
      invitation("expired-old", "EXPIRED", eightDaysAgo, eightDaysAgo),
      invitation("pending-expired-old", "PENDING", eightDaysAgo, sixDaysAgo),
    ]);
    const [acceptedRecent, pendingExpiredRecent, pendingActive] = await Promise.all([
      invitation("accepted-recent", "ACCEPTED", future, sixDaysAgo),
      invitation("pending-expired-recent", "PENDING", sixDaysAgo, sixDaysAgo),
      invitation("pending-active", "PENDING", future, eightDaysAgo),
    ]);
    await adminDb.consentRecord.update({
      where: { id: owner.consent.id },
      data: { acceptedAt: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) },
    });

    const result = await purgeExpiredLifecycleRecords(workerDb);

    expect(result).toMatchObject({ invitations: 4 });
    await expect(
      adminDb.invitation.findMany({
        where: {
          id: {
            in: [
              acceptedOld.id,
              revokedOld.id,
              expiredOld.id,
              pendingExpiredOld.id,
              acceptedRecent.id,
              pendingExpiredRecent.id,
              pendingActive.id,
            ],
          },
        },
        select: { id: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: acceptedRecent.id },
        { id: pendingExpiredRecent.id },
        { id: pendingActive.id },
      ]),
    );
    await expect(
      adminDb.consentRecord.findUnique({ where: { id: owner.consent.id } }),
    ).resolves.not.toBeNull();
  });

  it("starts the consent evidence period at account deletion", async () => {
    const expiredOwner = await fixture("expired-consent");
    const recentOwner = await fixture("recent-consent");
    await Promise.all([
      adminDb.user.update({
        where: { id: expiredOwner.user.id },
        data: {
          lifecycleState: "deleted",
          deletedAt: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000),
        },
      }),
      adminDb.user.update({
        where: { id: recentOwner.user.id },
        data: {
          lifecycleState: "deleted",
          deletedAt: new Date(Date.now() - 364 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    const result = await purgeExpiredLifecycleRecords(workerDb);

    expect(result).toMatchObject({ consent_records: 1 });
    await expect(
      adminDb.consentRecord.findUnique({ where: { id: expiredOwner.consent.id } }),
    ).resolves.toBeNull();
    await expect(
      adminDb.consentRecord.findUnique({ where: { id: recentOwner.consent.id } }),
    ).resolves.not.toBeNull();
  });
});
