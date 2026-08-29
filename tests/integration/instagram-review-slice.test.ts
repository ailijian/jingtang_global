import { randomUUID } from "node:crypto";

import {
  instagramCallbackReplayDigest,
  instagramOAuthScopes,
  instagramOAuthStateDigest,
  instagramReelSettings,
  instagramSubjectCorrelationHash,
} from "@jingtang/application";
import {
  beginInstagramConnection,
  claimInstagramContainerCreate,
  claimInstagramMediaPublish,
  claimInstagramOAuthCallback,
  completeInstagramConnection,
  completeSourceAsset,
  confirmContentPublishing,
  confirmInstagramProviderRemoval,
  createContent,
  createDatabaseClient,
  createPendingSourceAsset,
  createSession,
  createWorkspace,
  decideContent,
  listInstagramChannels,
  prepareYouTubeDisconnect,
  readInstagramExecutionCheckpoint,
  readInstagramExecutionWorkItem,
  recordConsent,
  recordInstagramContainerCreateAmbiguous,
  recordInstagramContainerCreated,
  recordInstagramContainerCreateReconciledAbsent,
  recordInstagramMediaPublishAmbiguous,
  recordInstagramMediaPublishReconciledAbsent,
  releaseYouTubeChannelOperationLease,
  submitContent,
  upsertIdentityUser,
  withTenant,
} from "@jingtang/db";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const workerDatabaseUrl = process.env.DATABASE_WORKER_URL;
if (!databaseUrl || !workerDatabaseUrl) {
  throw new Error(
    "DATABASE_URL and DATABASE_WORKER_URL are required for Instagram integration tests",
  );
}

const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const workerDb = createDatabaseClient(workerDatabaseUrl);
const vault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
const callbackSecret = "instagram-integration-callback-secret-at-least-32-bytes";

async function fixture(label: string) {
  const user = await upsertIdentityUser(db, {
    subject: `instagram-${label}-${randomUUID()}`,
    email: `instagram-${label}-${randomUUID()}@example.test`,
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
    termsVersion: "2026-08-28-r4.5",
    privacyVersion: "2026-08-28-r4.5",
    dataPurposeVersion: "instagram-business-publishing-v1",
    displayedLocale: "en",
    acceptanceMethod: "instagram_connection_checkbox",
  });
  return { user, workspace, consent };
}

async function approvedInstagramContent(input: {
  readonly owner: Awaited<ReturnType<typeof fixture>>;
  readonly accountReference: string;
  readonly caption: string;
}) {
  const assetId = randomUUID();
  await createPendingSourceAsset(db, {
    id: assetId,
    workspaceId: input.owner.workspace.id,
    objectKey: `workspaces/${input.owner.workspace.id}/source-assets/${assetId}/reel.mp4`,
    filename: "approved-reel.mp4",
    mediaType: "video/mp4",
    byteSize: 128,
    durationSeconds: 8,
    sha256: "a".repeat(64),
    ownershipConfirmed: true,
    uploadedByUserId: input.owner.user.id,
  });
  await completeSourceAsset(db, {
    workspaceId: input.owner.workspace.id,
    assetId,
    actorUserId: input.owner.user.id,
    correlationId: randomUUID(),
  });
  const content = await createContent(db, {
    workspaceId: input.owner.workspace.id,
    actorUserId: input.owner.user.id,
    internalTitle: "Approved Instagram Reel",
    sourceAssetId: assetId,
    platformVersions: [
      {
        platform: "instagram",
        accountReference: input.accountReference,
        accountDisplayName: "jingtang_controlled",
        title: input.caption,
        description: "",
        privacyStatus: "unselected",
        madeForKids: false,
      },
    ],
    correlationId: randomUUID(),
  });
  const submission = await submitContent(db, {
    workspaceId: input.owner.workspace.id,
    contentId: content.id,
    actorUserId: input.owner.user.id,
    correlationId: randomUUID(),
  });
  await decideContent(db, {
    workspaceId: input.owner.workspace.id,
    contentId: content.id,
    revisionId: submission.revisionId,
    actorUserId: input.owner.user.id,
    result: "approved",
    correlationId: randomUUID(),
  });
  return { contentId: content.id, revisionId: submission.revisionId };
}

afterAll(async () =>
  Promise.all([db.$disconnect(), adminDb.$disconnect(), workerDb.$disconnect()]),
);

describe("R4.5 Instagram provider-independent persistence boundary", () => {
  it("rejects incomplete or expanded Instagram grants before persisting authorization", async () => {
    const owner = await fixture("scope-rejection");
    const channel = await beginInstagramConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      oauthStateDigest: instagramOAuthStateDigest("scope-rejection-state"),
    });
    const envelope = await vault.seal({
      accessToken: "scope-rejection-token",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: instagramOAuthScopes,
      userId: "scope-rejection-user-id",
    });
    const baseInput = {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      externalAccountId: "scope-rejection-user-id",
      displayName: "scope_rejection",
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      callbackSubjectCorrelationHash: instagramSubjectCorrelationHash(
        callbackSecret,
        "scope-rejection-subject",
      ),
      correlationId: randomUUID(),
    };
    await expect(
      completeInstagramConnection(db, {
        ...baseInput,
        grantedScopes: [instagramOAuthScopes[0]],
      }),
    ).rejects.toThrow("instagram_granted_scopes_invalid");
    await expect(
      completeInstagramConnection(db, {
        ...baseInput,
        grantedScopes: [...instagramOAuthScopes, "instagram_business_manage_comments"],
      }),
    ).rejects.toThrow("instagram_granted_scopes_invalid");
    await expect(listInstagramChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        id: channel.id,
        state: "connecting",
        externalAccountId: null,
        grantedScopes: [],
      },
    ]);
  });

  it("isolates the controlled account, persists the exact Reel intent, fences duplicates, and reconciles unknown writes", async () => {
    const owner = await fixture("owner");
    const other = await fixture("other");
    const oauthState = "instagram-integration-oauth-state";
    const channel = await beginInstagramConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      oauthStateDigest: instagramOAuthStateDigest(oauthState),
    });
    await expect(
      claimInstagramOAuthCallback(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        consentRecordId: owner.consent.id,
        oauthStateDigest: instagramOAuthStateDigest(oauthState),
      }),
    ).resolves.toBe(true);
    await expect(
      claimInstagramOAuthCallback(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        consentRecordId: owner.consent.id,
        oauthStateDigest: instagramOAuthStateDigest(oauthState),
      }),
    ).resolves.toBe(false);

    const accountReference = "instagram-controlled-user-id";
    const callbackSubject = "controlled-instagram-authorization-subject";
    const subjectCorrelationHash = instagramSubjectCorrelationHash(callbackSecret, callbackSubject);
    const envelope = await vault.seal({
      accessToken: "controlled-instagram-token",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: instagramOAuthScopes,
      userId: accountReference,
    });
    await completeInstagramConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      externalAccountId: accountReference,
      displayName: "jingtang_controlled",
      grantedScopes: instagramOAuthScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      callbackSubjectCorrelationHash: subjectCorrelationHash,
      correlationId: randomUUID(),
    });

    await expect(listInstagramChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        id: channel.id,
        platform: "instagram",
        state: "connected",
        externalAccountId: accountReference,
        displayName: "jingtang_controlled",
        grantedScopes: instagramOAuthScopes,
        providerRemovalState: "not_applicable",
      },
    ]);
    await expect(listInstagramChannels(db, other.workspace.id)).resolves.toEqual([]);
    await expect(
      withTenant(db, other.workspace.id, (transaction) =>
        transaction.instagramCallbackCorrelation.count({ where: { channelId: channel.id } }),
      ),
    ).resolves.toBe(0);

    const approved = await approvedInstagramContent({
      owner,
      accountReference,
      caption: "User-confirmed controlled Reel caption",
    });
    await expect(
      confirmContentPublishing(db, {
        workspaceId: owner.workspace.id,
        contentId: approved.contentId,
        revisionId: approved.revisionId,
        actorUserId: owner.user.id,
        consentVersion: "instagram-business-publishing-v1",
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        instagramSettings: { ...instagramReelSettings, shareToFeed: true as false },
      }),
    ).rejects.toThrow("instagram_reel_publish_settings_invalid");

    const confirmed = await confirmContentPublishing(db, {
      workspaceId: owner.workspace.id,
      contentId: approved.contentId,
      revisionId: approved.revisionId,
      actorUserId: owner.user.id,
      consentVersion: "instagram-business-publishing-v1",
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      instagramSettings: instagramReelSettings,
    });
    const storedIntent = await adminDb.publishingIntent.findUniqueOrThrow({
      where: { id: confirmed.intentId },
      include: { executions: { include: { outboxMessage: true } } },
    });
    expect(storedIntent.mode).toBe("IMMEDIATE");
    expect(storedIntent.payloadSnapshot).toMatchObject({
      versions: [
        {
          platform: "instagram",
          title: "User-confirmed controlled Reel caption",
          description: "",
          privacy_status: "unselected",
          instagram_settings: {
            mediaType: "REELS",
            shareToFeed: false,
            publishMode: "IMMEDIATE",
          },
        },
      ],
    });
    expect(storedIntent.executions[0]?.outboxMessage?.topic).toBe("platform.instagram.publish.v1");
    await expect(
      adminDb.platformExecution.update({
        where: { id: confirmed.executionId },
        data: { providerResourceId: "uncheckpointed-container" },
      }),
    ).rejects.toThrow();

    const work = await readInstagramExecutionWorkItem(
      workerDb,
      owner.workspace.id,
      confirmed.executionId,
    );
    const fence = {
      workspaceId: owner.workspace.id,
      executionId: confirmed.executionId,
      channelId: work.channelId,
      leaseGeneration: work.leaseGeneration,
    };
    await claimInstagramContainerCreate(workerDb, fence);
    await expect(claimInstagramContainerCreate(workerDb, fence)).rejects.toThrow(
      "instagram_container_create_claim_rejected",
    );
    await adminDb.channel.update({
      where: { id: channel.id },
      data: { operationGeneration: { increment: 1 } },
    });
    await expect(
      recordInstagramContainerCreateAmbiguous(workerDb, {
        ...fence,
        failureCategory: "stale_worker_result",
      }),
    ).rejects.toThrow("publish_fence_lost");
    const refencedWork = await readInstagramExecutionWorkItem(
      workerDb,
      owner.workspace.id,
      confirmed.executionId,
    );
    const refenced = {
      ...fence,
      leaseGeneration: refencedWork.leaseGeneration,
    };
    await recordInstagramContainerCreateAmbiguous(workerDb, {
      ...refenced,
      failureCategory: "provider_response_unknown",
    });
    await expect(
      readInstagramExecutionCheckpoint(db, owner.workspace.id, confirmed.executionId),
    ).resolves.toMatchObject({
      state: "NEEDS_ATTENTION",
      createState: "AMBIGUOUS",
      publishState: "NOT_STARTED",
      containerId: null,
      mediaId: null,
    });
    await recordInstagramContainerCreateReconciledAbsent(workerDb, {
      ...refenced,
      failureCategory: "provider_container_absent",
    });
    await releaseYouTubeChannelOperationLease(
      workerDb,
      owner.workspace.id,
      channel.id,
      confirmed.executionId,
      refenced.leaseGeneration,
    );

    const publishApproved = await approvedInstagramContent({
      owner,
      accountReference,
      caption: "Second isolated checkpoint fixture",
    });
    const publishConfirmed = await confirmContentPublishing(db, {
      workspaceId: owner.workspace.id,
      contentId: publishApproved.contentId,
      revisionId: publishApproved.revisionId,
      actorUserId: owner.user.id,
      consentVersion: "instagram-business-publishing-v1",
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      instagramSettings: instagramReelSettings,
    });
    const publishWork = await readInstagramExecutionWorkItem(
      workerDb,
      owner.workspace.id,
      publishConfirmed.executionId,
    );
    const publishFence = {
      workspaceId: owner.workspace.id,
      executionId: publishConfirmed.executionId,
      channelId: publishWork.channelId,
      leaseGeneration: publishWork.leaseGeneration,
    };
    await claimInstagramContainerCreate(workerDb, publishFence);
    await recordInstagramContainerCreated(workerDb, {
      ...publishFence,
      containerId: "controlled-container-id",
    });
    await claimInstagramMediaPublish(workerDb, publishFence);
    await expect(claimInstagramMediaPublish(workerDb, publishFence)).rejects.toThrow(
      "instagram_media_publish_claim_rejected",
    );
    await recordInstagramMediaPublishAmbiguous(workerDb, {
      ...publishFence,
      failureCategory: "provider_response_unknown",
    });
    await expect(
      readInstagramExecutionCheckpoint(db, owner.workspace.id, publishConfirmed.executionId),
    ).resolves.toMatchObject({
      state: "NEEDS_ATTENTION",
      createState: "SUCCEEDED",
      publishState: "AMBIGUOUS",
      containerId: "controlled-container-id",
      mediaId: null,
    });
    await recordInstagramMediaPublishReconciledAbsent(workerDb, {
      ...publishFence,
      failureCategory: "provider_media_absent",
    });
    await releaseYouTubeChannelOperationLease(
      workerDb,
      owner.workspace.id,
      channel.id,
      publishConfirmed.executionId,
      publishFence.leaseGeneration,
    );
  });

  it("disconnects locally before provider confirmation and accepts only verified callback correlation once", async () => {
    const owner = await fixture("disconnect-owner");
    const channel = await beginInstagramConnection(db, {
      workspaceId: owner.workspace.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      oauthStateDigest: instagramOAuthStateDigest("disconnect-state"),
    });
    const accountReference = "instagram-disconnect-user-id";
    const callbackSubject = "disconnect-authorization-subject";
    const subjectCorrelationHash = instagramSubjectCorrelationHash(callbackSecret, callbackSubject);
    const envelope = await vault.seal({
      accessToken: "disconnect-instagram-token",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: instagramOAuthScopes,
      userId: accountReference,
    });
    await completeInstagramConnection(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      consentRecordId: owner.consent.id,
      actorUserId: owner.user.id,
      externalAccountId: accountReference,
      displayName: "disconnect_controlled",
      grantedScopes: instagramOAuthScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      callbackSubjectCorrelationHash: subjectCorrelationHash,
      correlationId: randomUUID(),
    });

    const local = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      platform: "instagram",
    });
    expect(local).toMatchObject({
      channelId: channel.id,
      operationId: null,
      tokenEnvelopeCiphertext: null,
      tokenKeyReference: envelope.keyReference,
      alreadyDisconnected: false,
      revocationDeferred: false,
    });
    await vault.destroy(envelope.keyReference);
    await expect(listInstagramChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        id: channel.id,
        state: "disconnected",
        externalAccountId: null,
        displayName: null,
        grantedScopes: [],
        providerRemovalState: "pending_user_action",
      },
    ]);

    const dataDeletionReplay = instagramCallbackReplayDigest(
      callbackSecret,
      "data-deletion-replay-key",
    );
    await expect(
      confirmInstagramProviderRemoval(db, {
        workspaceId: owner.workspace.id,
        subjectCorrelationHash,
        replayDigest: dataDeletionReplay,
        callbackKind: "data_deletion",
        correlationId: randomUUID(),
      }),
    ).resolves.toMatchObject({ outcome: "recorded", channelId: channel.id });
    await expect(
      confirmInstagramProviderRemoval(db, {
        workspaceId: owner.workspace.id,
        subjectCorrelationHash,
        replayDigest: dataDeletionReplay,
        callbackKind: "data_deletion",
        correlationId: randomUUID(),
      }),
    ).resolves.toMatchObject({ outcome: "replayed", channelId: channel.id });
    await expect(listInstagramChannels(db, owner.workspace.id)).resolves.toMatchObject([
      { providerRemovalState: "pending_user_action" },
    ]);

    const deauthorizationReplay = instagramCallbackReplayDigest(
      callbackSecret,
      "deauthorization-replay-key",
    );
    await expect(
      confirmInstagramProviderRemoval(db, {
        workspaceId: owner.workspace.id,
        subjectCorrelationHash,
        replayDigest: deauthorizationReplay,
        callbackKind: "deauthorization",
        correlationId: randomUUID(),
      }),
    ).resolves.toMatchObject({ outcome: "confirmed", channelId: channel.id });
    await expect(
      confirmInstagramProviderRemoval(db, {
        workspaceId: owner.workspace.id,
        subjectCorrelationHash,
        replayDigest: deauthorizationReplay,
        callbackKind: "deauthorization",
        correlationId: randomUUID(),
      }),
    ).resolves.toMatchObject({ outcome: "replayed", channelId: channel.id });
    await expect(listInstagramChannels(db, owner.workspace.id)).resolves.toMatchObject([
      { providerRemovalState: "confirmed" },
    ]);

    const auditJson = JSON.stringify(
      await adminDb.auditEvent.findMany({ where: { workspaceId: owner.workspace.id } }),
    );
    expect(auditJson).not.toContain("disconnect-instagram-token");
    expect(auditJson).not.toContain(accountReference);
    expect(auditJson).not.toContain("disconnect_controlled");
  });
});
