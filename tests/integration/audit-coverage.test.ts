import { randomUUID } from "node:crypto";

import { youtubeOAuthScopes } from "@jingtang/application";
import {
  acceptInvitation,
  beginWorkspaceDataDeletion,
  beginYouTubeConnection,
  changeMemberRole,
  claimNextOutboxMessage,
  completeSourceAsset,
  completeWorkspaceDataDeletion,
  completeYouTubeConnection,
  completeYouTubeDisconnect,
  confirmContentPublishing,
  createContent,
  createDatabaseClient,
  createInvitation,
  createPendingSourceAsset,
  createSession,
  createWorkspace,
  decideContent,
  denyYouTubeConnection,
  failSourceAsset,
  failWorkspaceDataDeletion,
  failYouTubeDisconnect,
  finishLifecycleOperation,
  finishOutboxMessage,
  getMembershipRole,
  LifecycleOperationKind,
  LifecycleOperationState,
  listActivity,
  prepareYouTubeDisconnect,
  readExpiredYouTubeAuthorization,
  readYouTubeExecutionWorkItem,
  recordAuthorizationDenied,
  recordConsent,
  recordUserScopedAudit,
  recordYouTubeExecutionFailure,
  recordYouTubeExecutionPublished,
  recordYouTubeUploadAccepted,
  refreshYouTubeAuthorizedData,
  releaseYouTubeChannelOperationLease,
  removeMember,
  requireYouTubeReauthorization,
  selectWorkspace,
  submitContent,
  updateContentDraft,
  updateLocalePreference,
  upsertIdentityUser,
  withTenant,
} from "@jingtang/db";
import { auditActions } from "@jingtang/domain";
import { translate, type MessageKey } from "@jingtang/i18n";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for audit integration tests");
const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const workerDatabaseUrl = process.env.DATABASE_WORKER_URL;
if (!workerDatabaseUrl)
  throw new Error("DATABASE_WORKER_URL is required for audit integration tests");
const workerDb = createDatabaseClient(workerDatabaseUrl);
const vault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
const sessionSecret = "integration-secret-at-least-32-bytes";

async function forceLifecycleClaim(input: {
  readonly operationId?: string;
  readonly kind: LifecycleOperationKind;
  readonly workspaceId: string;
  readonly channelId?: string;
}) {
  const operationId =
    input.operationId ??
    (
      await adminDb.lifecycleOperation.create({
        data: {
          kind: input.kind,
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          dedupeKey: `audit:${input.kind}:${randomUUID()}`,
          requestReference: `AUD-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`,
          correlationId: randomUUID(),
          deadlineAt: new Date(Date.now() + 120_000),
          retentionExpiresAt: new Date(Date.now() + 86_400_000),
        },
        select: { id: true },
      })
    ).id;
  const workerId = `audit-worker-${randomUUID()}`;
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

async function claimExecution(executionId: string) {
  const workerId = `audit-publish-${randomUUID()}`;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const claimed = await claimNextOutboxMessage(workerDb, workerId);
    if (!claimed) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      continue;
    }
    if (claimed.platformExecutionId === executionId) return claimed;
    throw new Error(
      `audit publish ${executionId} found unexpected execution ${claimed.platformExecutionId}`,
    );
  }
  throw new Error(`audit publish ${executionId} was not claimed`);
}

async function identityFixture(label: string) {
  const email = `audit-${label}-${randomUUID()}@example.test`;
  const user = await upsertIdentityUser(db, {
    subject: `audit-${label}-${randomUUID()}`,
    email,
    name: label,
    locale: "en",
  });
  const consent = await recordConsent(db, {
    userId: user.id,
    termsVersion: "audit-terms-v1",
    privacyVersion: "audit-privacy-v1",
    dataPurposeVersion: "audit-purpose-v1",
    displayedLocale: "en",
  });
  const session = await createSession(db, { userId: user.id, secret: sessionSecret });
  const workspaceName = `${label} Workspace`;
  const workspace = await createWorkspace(db, {
    name: workspaceName,
    userId: user.id,
    sessionId: session.id,
    correlationId: randomUUID(),
  });
  return { user, email, consent, session, workspace: { ...workspace, name: workspaceName } };
}

const platformVersion = (accountReference: string, label: string) => ({
  platform: "youtube" as const,
  accountReference,
  accountDisplayName: "Audit YouTube channel",
  title: `${label} YouTube title`,
  description: `${label} description`,
  privacyStatus: "private" as const,
  madeForKids: false,
});

async function sourceAsset(
  owner: Awaited<ReturnType<typeof identityFixture>>,
  label: string,
  outcome: "complete" | "failed" = "complete",
) {
  const id = randomUUID();
  await createPendingSourceAsset(db, {
    id,
    workspaceId: owner.workspace.id,
    objectKey: `workspaces/${owner.workspace.id}/audit/${id}.mp4`,
    filename: `${label}.mp4`,
    mediaType: "video/mp4",
    byteSize: 3,
    sha256: "a".repeat(64),
    ownershipConfirmed: true,
    uploadedByUserId: owner.user.id,
  });
  if (outcome === "failed") {
    await failSourceAsset(db, {
      workspaceId: owner.workspace.id,
      assetId: id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      failureCategory: "controlled_upload_failure",
    });
  } else {
    await completeSourceAsset(db, {
      workspaceId: owner.workspace.id,
      assetId: id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
  }
  return id;
}

async function reviewedContent(
  owner: Awaited<ReturnType<typeof identityFixture>>,
  accountReference: string,
  label: string,
  result: "approved" | "rejected",
  edit = false,
) {
  const assetId = await sourceAsset(owner, label);
  const content = await createContent(db, {
    workspaceId: owner.workspace.id,
    actorUserId: owner.user.id,
    internalTitle: `${label} internal`,
    sourceAssetId: assetId,
    platformVersions: [platformVersion(accountReference, label)],
    correlationId: randomUUID(),
  });
  if (edit) {
    await updateContentDraft(db, {
      workspaceId: owner.workspace.id,
      contentId: content.id,
      actorUserId: owner.user.id,
      internalTitle: `${label} edited internal`,
      platformVersions: [platformVersion(accountReference, `${label} edited`)],
      correlationId: randomUUID(),
    });
  }
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
    result,
    ...(result === "rejected" ? { reason: "Controlled rejection" } : {}),
    correlationId: randomUUID(),
  });
  return { contentId: content.id, revisionId: submission.revisionId };
}

async function confirmPublishing(
  owner: Awaited<ReturnType<typeof identityFixture>>,
  content: Awaited<ReturnType<typeof reviewedContent>>,
  label: string,
) {
  return confirmContentPublishing(db, {
    workspaceId: owner.workspace.id,
    contentId: content.contentId,
    revisionId: content.revisionId,
    actorUserId: owner.user.id,
    consentVersion: "audit-purpose-v1",
    idempotencyKey: `audit-${label}-${randomUUID()}`,
    correlationId: randomUUID(),
  });
}

afterAll(async () =>
  Promise.all([db.$disconnect(), adminDb.$disconnect(), workerDb.$disconnect()]),
);

describe("AC-11 runtime Audit coverage", () => {
  it("durably captures immutable account events without tenant fan-out", async () => {
    const user = await upsertIdentityUser(db, {
      subject: `audit-pending-${randomUUID()}`,
      email: `audit-pending-${randomUUID()}@example.test`,
      name: "Pending Audit User",
      locale: "en",
    });
    const session = await createSession(db, { userId: user.id, secret: sessionSecret });
    const inputs = [
      { action: "identity.login" as const, targetType: "session" as const, targetId: session.id },
      { action: "locale.changed" as const, targetType: "user" as const, targetId: user.id },
      { action: "identity.logout" as const, targetType: "session" as const, targetId: session.id },
    ].map((input) => ({ ...input, correlationId: randomUUID() }));
    for (const input of inputs) {
      await recordUserScopedAudit(db, {
        userId: user.id,
        currentWorkspaceId: null,
        ...input,
        result: "success",
      });
    }
    await recordUserScopedAudit(db, {
      userId: user.id,
      currentWorkspaceId: null,
      ...inputs[0],
      result: "success",
    });

    const captured = await adminDb.accountAuditEvent.findMany({
      where: { correlationId: { in: inputs.map((input) => input.correlationId) } },
      orderBy: { occurredAt: "asc" },
    });
    expect(captured).toHaveLength(3);
    await expect(
      adminDb.accountAuditEvent.update({
        where: { id: captured[0].id },
        data: { result: "failure" },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(db.accountAuditEvent.findMany()).rejects.toThrow(/permission denied/u);

    const workspace = await createWorkspace(db, {
      name: "Pending Audit Workspace",
      userId: user.id,
      sessionId: session.id,
      correlationId: randomUUID(),
    });
    const replayed = await adminDb.auditEvent.findMany({
      where: { correlationId: { in: inputs.map((input) => input.correlationId) } },
    });
    expect(replayed).toHaveLength(0);
    expect(workspace.id).toBeTruthy();
    await expect(
      withTenant(
        db,
        workspace.id,
        (transaction) =>
          transaction.$executeRaw`SELECT pseudonymize_workspace_audit(${workspace.id}::uuid)`,
      ),
    ).rejects.toThrow("permission denied for function pseudonymize_workspace_audit");
  });

  it("keeps account audit global after the last Workspace membership is removed", async () => {
    const owner = await identityFixture("historical-scope-owner");
    const memberEmail = `historical-member-${randomUUID()}@example.test`;
    const member = await upsertIdentityUser(db, {
      subject: `historical-member-${randomUUID()}`,
      email: memberEmail,
      name: "Historical Scope Member",
      locale: "en",
    });
    const memberSession = await createSession(db, { userId: member.id, secret: sessionSecret });
    const invitation = await createInvitation(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      email: memberEmail,
      role: "viewer",
      correlationId: randomUUID(),
    });
    await acceptInvitation(db, {
      token: invitation.token,
      userId: member.id,
      email: memberEmail,
      sessionId: memberSession.id,
      correlationId: randomUUID(),
    });
    const membership = await adminDb.membership.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: owner.workspace.id, userId: member.id } },
    });
    await removeMember(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      membershipId: membership.id,
      correlationId: randomUUID(),
    });
    const correlationId = randomUUID();
    await recordUserScopedAudit(db, {
      userId: member.id,
      currentWorkspaceId: null,
      action: "identity.login",
      targetType: "session",
      targetId: memberSession.id,
      result: "success",
      correlationId,
    });
    const event = await adminDb.accountAuditEvent.findFirstOrThrow({ where: { correlationId } });
    expect(event.action).toBe("identity.login");
    await expect(adminDb.auditEvent.findMany({ where: { correlationId } })).resolves.toEqual([]);
  });

  it("executes every governed action and verifies fields, tenant isolation, and Activity", async () => {
    const owner = await identityFixture("coverage-owner");
    const secondWorkspace = await createWorkspace(db, {
      name: "Coverage Owner Second Workspace",
      userId: owner.user.id,
      sessionId: owner.session.id,
      correlationId: randomUUID(),
    });
    await adminDb.$transaction([
      adminDb.session.update({
        where: { id: owner.session.id },
        data: { currentWorkspaceId: null },
      }),
      adminDb.user.update({ where: { id: owner.user.id }, data: { lastWorkspaceId: null } }),
    ]);
    const accountAuditCorrelations: string[] = [];
    for (const action of ["identity.login", "identity.logout"] as const) {
      const correlationId = randomUUID();
      accountAuditCorrelations.push(correlationId);
      await recordUserScopedAudit(db, {
        userId: owner.user.id,
        currentWorkspaceId: null,
        action,
        targetType: "session",
        targetId: owner.session.id,
        result: "success",
        correlationId,
      });
    }
    await updateLocalePreference(db, owner.user.id, "zh-CN");
    const localeCorrelationId = randomUUID();
    accountAuditCorrelations.push(localeCorrelationId);
    await recordUserScopedAudit(db, {
      userId: owner.user.id,
      currentWorkspaceId: null,
      action: "locale.changed",
      targetType: "user",
      targetId: owner.user.id,
      result: "success",
      correlationId: localeCorrelationId,
      metadata: { locale: "zh-CN" },
    });
    for (const action of ["identity.login", "identity.logout", "locale.changed"] as const) {
      const accountEvents = await adminDb.accountAuditEvent.findMany({
        where: {
          action,
          correlationId: { in: accountAuditCorrelations },
        },
      });
      expect(accountEvents).toHaveLength(1);
    }
    await selectWorkspace(db, {
      workspaceId: owner.workspace.id,
      userId: owner.user.id,
      sessionId: owner.session.id,
      correlationId: randomUUID(),
    });

    const member = await identityFixture("coverage-member");
    const invitation = await createInvitation(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      email: member.email,
      role: "viewer",
      correlationId: randomUUID(),
    });
    await acceptInvitation(db, {
      token: invitation.token,
      userId: member.user.id,
      email: member.email,
      sessionId: member.session.id,
      correlationId: randomUUID(),
    });
    const membership = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.membership.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: owner.workspace.id, userId: member.user.id } },
        select: { id: true },
      }),
    );
    await changeMemberRole(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      membershipId: membership.id,
      role: "editor",
      correlationId: randomUUID(),
    });
    await removeMember(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      membershipId: membership.id,
      correlationId: randomUUID(),
    });

    const youtubeConsent = await recordConsent(db, {
      userId: owner.user.id,
      termsVersion: "audit-terms-v1",
      privacyVersion: "audit-privacy-v1",
      dataPurposeVersion: "audit-youtube-v1",
      displayedLocale: "zh-CN",
      acceptanceMethod: "youtube_connection_checkbox",
    });
    let channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: youtubeConsent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    await denyYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: youtubeConsent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      reason: "provider_denied",
    });
    channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: youtubeConsent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const primaryEnvelope = await vault.seal({
      accessToken: "audit-access-primary",
      refreshToken: "audit-refresh-primary",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: youtubeOAuthScopes,
    });
    await completeYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: youtubeConsent.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_AUDIT_PRIMARY",
      displayName: "Audit primary channel",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: primaryEnvelope.ciphertext,
      tokenCiphertextReference: primaryEnvelope.keyReference,
      correlationId: randomUUID(),
    });
    const refreshedEnvelope = await vault.seal({
      accessToken: "audit-access-refreshed",
      refreshToken: "audit-refresh-refreshed",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: youtubeOAuthScopes,
    });
    const retentionClaim = await forceLifecycleClaim({
      kind: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION,
      workspaceId: owner.workspace.id,
      channelId: channel.id,
    });
    const retentionOperation = await adminDb.lifecycleOperation.findUniqueOrThrow({
      where: { id: retentionClaim.operationId },
      select: { deadlineAt: true },
    });
    await adminDb.channel.update({
      where: { id: channel.id },
      data: { authorizedDataExpiresAt: retentionOperation.deadlineAt },
    });
    const retentionMaterial = await readExpiredYouTubeAuthorization(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      expectedAuthorizedDataExpiresAt: retentionOperation.deadlineAt,
      lifecycleClaim: retentionClaim,
    });
    await refreshYouTubeAuthorizedData(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      tokenEnvelopeCiphertext: refreshedEnvelope.ciphertext,
      tokenCiphertextReference: refreshedEnvelope.keyReference,
      externalAccountId: "UC_AUDIT_PRIMARY",
      expectedTokenCiphertextReference: retentionMaterial.tokenCiphertextReference,
      expectedAuthorizedDataExpiresAt: retentionOperation.deadlineAt,
      channelOperationGeneration: retentionMaterial.channelOperationGeneration,
      displayName: "Audit primary channel",
      now: new Date(),
      correlationId: randomUUID(),
      lifecycleClaim: retentionClaim,
    });

    await sourceAsset(owner, "failed-source", "failed");
    const publishedContent = await reviewedContent(
      owner,
      "UC_AUDIT_PRIMARY",
      "published-content",
      "approved",
      true,
    );
    const rejectedContent = await reviewedContent(
      owner,
      "UC_AUDIT_PRIMARY",
      "rejected-content",
      "rejected",
    );
    expect(rejectedContent.contentId).toBeTruthy();
    const successful = await confirmPublishing(owner, publishedContent, "success");
    const claimedSuccess = await claimExecution(successful.executionId);
    const successWork = await readYouTubeExecutionWorkItem(
      db,
      owner.workspace.id,
      successful.executionId,
    );
    await recordYouTubeUploadAccepted(db, {
      workspaceId: owner.workspace.id,
      executionId: successful.executionId,
      providerId: "audit-video-success",
      providerUrl: "https://www.youtube.com/watch?v=audit-video-success",
      channelId: successWork.channelId,
      leaseGeneration: successWork.leaseGeneration,
    });
    await recordYouTubeExecutionPublished(db, {
      workspaceId: owner.workspace.id,
      executionId: successful.executionId,
      channelId: successWork.channelId,
      leaseGeneration: successWork.leaseGeneration,
    });
    await releaseYouTubeChannelOperationLease(
      db,
      owner.workspace.id,
      successWork.channelId,
      successful.executionId,
      successWork.leaseGeneration,
    );
    await finishOutboxMessage(workerDb, {
      id: claimedSuccess.id,
      outcome: "completed",
      claimOwner: claimedSuccess.claimOwner,
      claimGeneration: claimedSuccess.claimGeneration,
    });

    const failedContent = await reviewedContent(
      owner,
      "UC_AUDIT_PRIMARY",
      "failed-content",
      "approved",
    );
    const failed = await confirmPublishing(owner, failedContent, "failure");
    const claimedFailure = await claimExecution(failed.executionId);
    const failureWork = await readYouTubeExecutionWorkItem(
      db,
      owner.workspace.id,
      failed.executionId,
    );
    await recordYouTubeExecutionFailure(db, {
      workspaceId: owner.workspace.id,
      executionId: failed.executionId,
      failureCategory: "controlled_provider_failure",
      needsAttention: false,
      channelId: failureWork.channelId,
      leaseGeneration: failureWork.leaseGeneration,
    });
    await requireYouTubeReauthorization(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      executionId: failed.executionId,
      leaseGeneration: failureWork.leaseGeneration,
    });
    await releaseYouTubeChannelOperationLease(
      db,
      owner.workspace.id,
      failureWork.channelId,
      failed.executionId,
      failureWork.leaseGeneration,
    );
    await finishOutboxMessage(workerDb, {
      id: claimedFailure.id,
      outcome: "dead",
      failureCategory: "controlled_provider_failure",
      claimOwner: claimedFailure.claimOwner,
      claimGeneration: claimedFailure.claimGeneration,
    });
    await expect(
      adminDb.outboxMessage.findUniqueOrThrow({ where: { id: claimedFailure.id } }),
    ).resolves.toMatchObject({ state: "DEAD", completedAt: expect.any(Date) });

    channel = await beginYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: youtubeConsent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const reconnectedEnvelope = await vault.seal({
      accessToken: "audit-access-reconnected",
      refreshToken: "audit-refresh-reconnected",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: youtubeOAuthScopes,
    });
    await completeYouTubeConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: youtubeConsent.id,
      actorUserId: owner.user.id,
      externalAccountId: "UC_AUDIT_RECONNECTED",
      displayName: "Audit reconnected channel",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: reconnectedEnvelope.ciphertext,
      tokenCiphertextReference: reconnectedEnvelope.keyReference,
      correlationId: randomUUID(),
    });
    const cancelledContent = await reviewedContent(
      owner,
      "UC_AUDIT_RECONNECTED",
      "cancelled-content",
      "approved",
    );
    await confirmPublishing(owner, cancelledContent, "cancelled");
    const disconnectCorrelationId = randomUUID();
    const disconnect = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: disconnectCorrelationId,
    });
    if (!disconnect.operationId) throw new Error("disconnect lifecycle operation missing");
    const disconnectClaim = await forceLifecycleClaim({
      operationId: disconnect.operationId,
      kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
      workspaceId: owner.workspace.id,
      channelId: channel.id,
    });
    await failYouTubeDisconnect(workerDb, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      failureCategory: "controlled_revoke_failure",
      lifecycleClaim: disconnectClaim,
    });
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        lifecycleClaim: disconnectClaim,
      }),
    ).resolves.toBe(false);
    const retirements = await adminDb.lifecycleOperation.findMany({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        state: { not: LifecycleOperationState.COMPLETED },
      },
    });
    expect(retirements.length).toBeGreaterThan(0);
    for (const retirement of retirements) {
      const outcome = retirement.outcome;
      if (!outcome || Array.isArray(outcome) || typeof outcome !== "object") {
        throw new Error("token retirement outcome missing");
      }
      const keyReference = outcome.key_reference;
      if (typeof keyReference !== "string") {
        throw new Error("token retirement key reference missing");
      }
      const retirementClaim = await forceLifecycleClaim({
        operationId: retirement.id,
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        workspaceId: owner.workspace.id,
        channelId: channel.id,
      });
      await vault.destroy(keyReference);
      await finishLifecycleOperation(workerDb, {
        ...retirementClaim,
        state: LifecycleOperationState.COMPLETED,
      });
    }
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: disconnectCorrelationId,
        lifecycleClaim: disconnectClaim,
      }),
    ).resolves.toBe(true);

    await recordAuthorizationDenied(db, {
      workspaceId: owner.workspace.id,
      userId: owner.user.id,
      permission: "content.publish",
      reason: "controlled_denial",
      correlationId: randomUUID(),
    });

    const deletionOwner = await identityFixture("coverage-deletion");
    const deletion = await beginWorkspaceDataDeletion(db, {
      workspaceId: deletionOwner.workspace.id,
      actorUserId: deletionOwner.user.id,
      confirmedWorkspaceName: deletionOwner.workspace.name,
      correlationId: randomUUID(),
    });
    const deletionOperation = await adminDb.dataDeletionRequest.findUniqueOrThrow({
      where: { id: deletion.requestId },
      select: { lifecycleOperationId: true },
    });
    if (!deletionOperation.lifecycleOperationId) {
      throw new Error("workspace deletion lifecycle operation missing");
    }
    const deletionClaim = await forceLifecycleClaim({
      operationId: deletionOperation.lifecycleOperationId,
      kind: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
      workspaceId: deletionOwner.workspace.id,
    });
    await failWorkspaceDataDeletion(workerDb, {
      workspaceId: deletionOwner.workspace.id,
      requestId: deletion.requestId,
      actorUserId: deletionOwner.user.id,
      correlationId: randomUUID(),
      failureCategory: "controlled_deletion_failure",
      lifecycleClaim: deletionClaim,
    });
    await completeWorkspaceDataDeletion(workerDb, {
      workspaceId: deletionOwner.workspace.id,
      requestId: deletion.requestId,
      actorUserId: deletionOwner.user.id,
      correlationId: randomUUID(),
      pendingObjectKeys: [],
      lifecycleClaim: deletionClaim,
    });

    const workspaceIds = [
      owner.workspace.id,
      secondWorkspace.id,
      member.workspace.id,
      deletionOwner.workspace.id,
    ];
    const events = await adminDb.auditEvent.findMany({
      where: { workspaceId: { in: workspaceIds } },
      orderBy: { occurredAt: "asc" },
    });
    const actions = new Set(events.map((event) => event.action));
    const accountActions = new Set(["identity.login", "identity.logout", "locale.changed"]);
    for (const action of auditActions.filter((entry) => !accountActions.has(entry))) {
      expect(actions.has(action), `Runtime workflow did not emit ${action}`).toBe(true);
      const event = events.find((entry) => entry.action === action);
      expect(event).toBeDefined();
      expect(event?.workspaceId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(event?.action).toBe(action);
      expect(event?.targetType).toBeTruthy();
      expect(event?.targetId).toBeTruthy();
      expect(["success", "denied", "failed"]).toContain(event?.result);
      expect(event?.correlationId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(event?.occurredAt).toBeInstanceOf(Date);
      expect(event?.recordedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(event?.metadata)).not.toMatch(
        /access-token|refresh-token|token-envelope/u,
      );
    }

    const activity = await listActivity(db, owner.workspace.id, 200);
    expect(activity.some((entry) => entry.action === "platform.published")).toBe(true);
    expect(activity.some((entry) => entry.action === "channel.disconnected")).toBe(true);
    for (const action of auditActions) {
      const key = `activity.action.${action}` as MessageKey;
      expect(translate("en", key)).not.toBe(key);
      expect(translate("zh-CN", key)).not.toBe(key);
    }

    await expect(
      withTenant(db, owner.workspace.id, (transaction) =>
        transaction.auditEvent.findMany({ where: { workspaceId: deletionOwner.workspace.id } }),
      ),
    ).resolves.toEqual([]);
    await expect(
      getMembershipRole(db, owner.workspace.id, deletionOwner.user.id),
    ).resolves.toBeUndefined();
  }, 15_000);
});
