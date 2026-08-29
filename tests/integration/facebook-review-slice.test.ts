import { createHash, randomUUID } from "node:crypto";

import { facebookOAuthScopes, facebookOAuthStateDigest } from "@jingtang/application";
import {
  beginFacebookConnection,
  acquireYouTubeChannelOperationLease,
  completeFacebookConnection,
  completeYouTubeDisconnect,
  claimFacebookOAuthCallback,
  completeSourceAsset,
  confirmContentPublishing,
  createContent,
  createDatabaseClient,
  createFacebookConnectionCandidate,
  createPendingSourceAsset,
  createSession,
  createWorkspace,
  decideContent,
  listFacebookChannels,
  finishLifecycleOperation,
  LifecycleOperationKind,
  LifecycleOperationState,
  readFacebookConnectionCandidate,
  readFacebookExecutionWorkItem,
  readProviderDataDeletionStatus,
  recordConsent,
  requestFacebookAuthorizedDataDeletion,
  requireYouTubeReauthorization,
  submitContent,
  upsertIdentityUser,
  withTenant,
  type LifecycleClaimGuard,
} from "@jingtang/db";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Facebook integration tests");
const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const workerDb = createDatabaseClient(process.env.DATABASE_WORKER_URL ?? databaseUrl);
const vault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

async function fixture(label: string) {
  const user = await upsertIdentityUser(db, {
    subject: `r3-${label}-${randomUUID()}`,
    email: `r3-${label}-${randomUUID()}@example.test`,
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
    termsVersion: "2026-08-26",
    privacyVersion: "2026-08-26",
    dataPurposeVersion: "facebook-page-publishing-v1",
    displayedLocale: "en",
    acceptanceMethod: "facebook_connection_checkbox",
  });
  return { user, workspace, consent };
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

afterAll(async () =>
  Promise.all([db.$disconnect(), adminDb.$disconnect(), workerDb.$disconnect()]),
);

describe("R3 Facebook review slice persistence boundary", () => {
  it("can retire an invalid Facebook authorization without rolling back audit cleanup", async () => {
    const owner = await fixture("facebook-reauthorization");
    const channel = await adminDb.channel.create({
      data: {
        workspaceId: owner.workspace.id,
        platform: "facebook",
        externalAccountId: "reauthorization-page",
        displayName: "Reauthorization Page",
        state: "CONNECTED",
        grantedScopes: facebookOAuthScopes,
        consentRecordId: owner.consent.id,
        tokenCiphertextReference: "test-key-reference",
        tokenEnvelopeCiphertext: "test-envelope",
        authorizationSubjectReference: "meta-user-id",
        authorizedAt: new Date(),
        refreshedAt: new Date(),
        authorizedDataExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const executionId = randomUUID();
    const leaseGeneration = await acquireYouTubeChannelOperationLease(
      workerDb,
      owner.workspace.id,
      channel.id,
      executionId,
    );
    expect(leaseGeneration).not.toBeNull();

    await expect(
      requireYouTubeReauthorization(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        executionId,
        leaseGeneration: leaseGeneration ?? 0n,
        platform: "facebook",
      }),
    ).resolves.toBeUndefined();
    await expect(
      adminDb.channel.findUniqueOrThrow({ where: { id: channel.id } }),
    ).resolves.toMatchObject({
      state: "REAUTHORIZATION_REQUIRED",
      externalAccountId: null,
      displayName: null,
      tokenCiphertextReference: null,
      tokenEnvelopeCiphertext: null,
    });
  });

  it("isolates Page candidates, persists only the selected Page, publishes through the Facebook topic, and deny-first deletes", async () => {
    const owner = await fixture("facebook-owner");
    const other = await fixture("facebook-other");
    const channel = await beginFacebookConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      oauthStateDigest: facebookOAuthStateDigest("integration-oauth-state"),
    });
    await expect(
      claimFacebookOAuthCallback(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        consentRecordId: owner.consent.id,
        oauthStateDigest: facebookOAuthStateDigest("integration-oauth-state"),
      }),
    ).resolves.toBe(true);
    await expect(
      claimFacebookOAuthCallback(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        consentRecordId: owner.consent.id,
        oauthStateDigest: facebookOAuthStateDigest("integration-oauth-state"),
      }),
    ).resolves.toBe(false);
    const candidateEnvelope = await vault.seal({
      userAccessToken: "meta-user-token",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      pages: [
        {
          id: "company-page",
          displayName: "JINGTANG",
          accessToken: "selected-page-token",
          tasks: ["CREATE_CONTENT"],
        },
        {
          id: "other-page",
          displayName: "Other Page",
          accessToken: "unselected-page-token",
          tasks: ["CREATE_CONTENT"],
        },
      ],
    });
    await createFacebookConnectionCandidate(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      consentRecordId: owner.consent.id,
      metaUserId: "meta-user-id",
      metaUserDisplayName: "Company administrator",
      grantedScopes: facebookOAuthScopes,
      pageOptions: [
        { id: "company-page", displayName: "JINGTANG" },
        { id: "other-page", displayName: "Other Page" },
      ],
      tokenEnvelopeCiphertext: candidateEnvelope.ciphertext,
      tokenCiphertextReference: candidateEnvelope.keyReference,
      expiresAt: new Date(Date.now() + 600_000),
    });

    await expect(
      readFacebookConnectionCandidate(db, other.workspace.id, other.user.id),
    ).resolves.toBeNull();
    const candidate = await readFacebookConnectionCandidate(db, owner.workspace.id, owner.user.id);
    expect(candidate?.pages).toEqual([
      { id: "company-page", displayName: "JINGTANG" },
      { id: "other-page", displayName: "Other Page" },
    ]);

    const selectedEnvelope = await vault.seal({
      userAccessToken: "meta-user-token",
      pageAccessToken: "selected-page-token",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: facebookOAuthScopes,
      metaUserId: "meta-user-id",
      pageId: "company-page",
    });
    await expect(
      completeFacebookConnection(db, {
        workspaceId: owner.workspace.id,
        candidateId: candidate?.id ?? randomUUID(),
        channelId: channel.id,
        consentRecordId: owner.consent.id,
        actorUserId: owner.user.id,
        metaUserId: "meta-user-id",
        pageId: "unreturned-page",
        pageDisplayName: "Attacker target",
        grantedScopes: facebookOAuthScopes,
        tokenEnvelopeCiphertext: selectedEnvelope.ciphertext,
        tokenCiphertextReference: selectedEnvelope.keyReference,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("facebook_page_selection_not_authorized");

    const completion = await completeFacebookConnection(db, {
      workspaceId: owner.workspace.id,
      candidateId: candidate?.id ?? randomUUID(),
      channelId: channel.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      metaUserId: "meta-user-id",
      pageId: "company-page",
      pageDisplayName: "JINGTANG",
      grantedScopes: facebookOAuthScopes,
      tokenEnvelopeCiphertext: selectedEnvelope.ciphertext,
      tokenCiphertextReference: selectedEnvelope.keyReference,
      correlationId: randomUUID(),
    });
    expect(completion.retiredKeyReference).toBe(candidateEnvelope.keyReference);
    await vault.destroy(completion.retiredKeyReference);
    const candidateRetirement = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        channelId: channel.id,
        state: { not: LifecycleOperationState.COMPLETED },
      },
      orderBy: { requestedAt: "desc" },
    });
    const candidateRetirementGuard = await forceClaim(
      candidateRetirement.id,
      `facebook-candidate-retirement-${randomUUID()}`,
    );
    await expect(
      finishLifecycleOperation(workerDb, {
        ...candidateRetirementGuard,
        state: LifecycleOperationState.COMPLETED,
      }),
    ).resolves.toBe(true);
    await expect(listFacebookChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        id: channel.id,
        platform: "facebook",
        state: "connected",
        externalAccountId: "company-page",
        displayName: "JINGTANG",
        grantedScopes: facebookOAuthScopes,
      },
    ]);

    const bytes = new TextEncoder().encode("R3 authorized company demonstration MP4");
    const assetId = randomUUID();
    await createPendingSourceAsset(db, {
      id: assetId,
      workspaceId: owner.workspace.id,
      objectKey: `workspaces/${owner.workspace.id}/source-assets/${assetId}/r3-demo.mp4`,
      filename: "r3-demo.mp4",
      mediaType: "video/mp4",
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
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
      internalTitle: "R3 company Page demonstration",
      sourceAssetId: assetId,
      platformVersions: [
        {
          platform: "facebook",
          accountReference: "company-page",
          accountDisplayName: "JINGTANG",
          title: "JINGTANG product demonstration",
          description: "Authorized R3 review evidence.",
          privacyStatus: "public",
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
    const publishing = await confirmContentPublishing(db, {
      workspaceId: owner.workspace.id,
      contentId: content.id,
      revisionId: submission.revisionId,
      actorUserId: owner.user.id,
      consentVersion: "facebook-page-publish-confirmation-v1",
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    await expect(
      readFacebookExecutionWorkItem(db, owner.workspace.id, publishing.executionId),
    ).resolves.toMatchObject({
      platform: "facebook",
      channelId: channel.id,
      mediaType: "video/mp4",
      title: "JINGTANG product demonstration",
    });
    const outbox = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.outboxMessage.findFirstOrThrow({
        where: { platformExecutionId: publishing.executionId },
        select: { topic: true },
      }),
    );
    expect(outbox.topic).toBe("platform.facebook.publish.v1");

    const deletion = await requestFacebookAuthorizedDataDeletion(db, "meta-user-id");
    expect(deletion.state).toBe("pending");
    await expect(listFacebookChannels(db, owner.workspace.id)).resolves.toMatchObject([
      { id: channel.id, state: "disconnecting" },
    ]);
    await expect(readProviderDataDeletionStatus(db, deletion.confirmationCode)).resolves.toBe(
      "pending",
    );
    await adminDb.channel.update({
      where: { id: channel.id },
      data: {
        operationLeaseId: null,
        operationLeaseUntil: null,
        operationLeaseGeneration: null,
      },
    });

    const disconnectOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        kind: LifecycleOperationKind.CHANNEL_DISCONNECT,
        channelId: channel.id,
      },
      orderBy: { requestedAt: "desc" },
    });
    const disconnectGuard = await forceClaim(
      disconnectOperation.id,
      `facebook-disconnect-${randomUUID()}`,
    );
    await expect(
      completeYouTubeDisconnect(workerDb, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: disconnectOperation.correlationId,
        revocationOutcome: "provider_revoked",
        lifecycleClaim: disconnectGuard,
        platform: "facebook",
      }),
    ).resolves.toBe(false);

    const retirementOperation = await adminDb.lifecycleOperation.findFirstOrThrow({
      where: {
        kind: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
        channelId: channel.id,
        correlationId: disconnectOperation.correlationId,
      },
    });
    const retirementGuard = await forceClaim(
      retirementOperation.id,
      `facebook-token-retirement-${randomUUID()}`,
    );
    await vault.destroy(selectedEnvelope.keyReference);
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
        correlationId: disconnectOperation.correlationId,
        revocationOutcome: "provider_revoked",
        lifecycleClaim: disconnectGuard,
        platform: "facebook",
      }),
    ).resolves.toBe(true);
    await expect(
      finishLifecycleOperation(workerDb, {
        ...disconnectGuard,
        state: LifecycleOperationState.COMPLETED,
      }),
    ).resolves.toBe(true);
    await expect(
      adminDb.providerDataDeletionRequest.findUniqueOrThrow({
        where: { confirmationCode: deletion.confirmationCode },
      }),
    ).resolves.toMatchObject({ state: "completed", completedAt: expect.any(Date) });
    await expect(readProviderDataDeletionStatus(db, deletion.confirmationCode)).resolves.toBe(
      "completed",
    );
  });
});
