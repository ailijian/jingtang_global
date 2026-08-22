import { randomUUID } from "node:crypto";

import { youtubeOAuthScopes } from "@jingtang/application";
import {
  beginWorkspaceDataDeletion,
  beginYouTubeConnection,
  completeWorkspaceDataDeletion,
  completeYouTubeConnection,
  completeYouTubeDisconnect,
  createDatabaseClient,
  createPendingSourceAsset,
  createSession,
  createWorkspace,
  failWorkspaceDataDeletion,
  failYouTubeDisconnect,
  listExpiredYouTubeAuthorizations,
  listPendingYouTubeDisconnects,
  listUserWorkspaces,
  listYouTubeChannels,
  prepareYouTubeDisconnect,
  recordConsent,
  recordExpiredAuthorizedDataDeletion,
  refreshYouTubeAuthorizedData,
  upsertIdentityUser,
  withTenant,
} from "@jingtang/db";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for D6 integration tests");
const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const vault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

async function fixture(label: string) {
  const user = await upsertIdentityUser(db, {
    subject: `d6-${label}-${randomUUID()}`,
    email: `d6-${label}-${randomUUID()}@example.test`,
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
  return { user, workspace: { ...workspace, name: workspaceName }, consent };
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
    actorUserId: owner.user.id,
    externalAccountId: externalId,
    displayName: `${externalId} channel`,
    grantedScopes: youtubeOAuthScopes,
    tokenEnvelopeCiphertext: envelope,
    correlationId: randomUUID(),
  });
  return { channel, envelope };
}

afterAll(async () => Promise.all([db.$disconnect(), adminDb.$disconnect()]));

describe("D6 trust lifecycle", () => {
  it("fails closed during revocation, supports retry, and scrubs Authorized Data", async () => {
    const owner = await fixture("disconnect-owner");
    const other = await fixture("disconnect-other");
    const { channel, envelope } = await connectedChannel(owner, "UC_D6_DISCONNECT");

    await expect(
      prepareYouTubeDisconnect(db, {
        workspaceId: other.workspace.id,
        channelId: channel.id,
        actorUserId: other.user.id,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("channel_not_found");

    await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.update({
        where: { id: channel.id },
        data: {
          operationLeaseId: randomUUID(),
          operationLeaseUntil: new Date("2026-08-22T01:10:00.000Z"),
        },
      }),
    );
    const prepared = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      now: new Date("2026-08-22T01:00:00.000Z"),
    });
    expect(prepared.tokenEnvelopeCiphertext).toBe(envelope);
    expect(prepared.revocationDeferred).toBe(true);
    await expect(
      completeYouTubeDisconnect(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        actorUserId: owner.user.id,
        correlationId: randomUUID(),
        now: new Date("2026-08-22T01:00:00.000Z"),
      }),
    ).rejects.toThrow("channel_operations_in_flight");
    await expect(
      listPendingYouTubeDisconnects(
        adminDb,
        new Date("2026-08-22T01:00:00.000Z"),
        25,
        new Date("2026-08-22T01:00:00.000Z"),
      ),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ channelId: channel.id })]),
    );
    await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.update({
        where: { id: channel.id },
        data: { operationLeaseId: null, operationLeaseUntil: null },
      }),
    );
    const ready = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    expect(ready.revocationDeferred).toBe(false);
    await expect(listYouTubeChannels(db, owner.workspace.id)).resolves.toMatchObject([
      { state: "disconnecting", externalAccountId: "UC_D6_DISCONNECT" },
    ]);

    await failYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      failureCategory: "service_unavailable",
    });
    await expect(
      listPendingYouTubeDisconnects(adminDb, new Date("2026-08-22T00:59:59.999Z")),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ channelId: channel.id })]),
    );
    await expect(
      listPendingYouTubeDisconnects(adminDb, new Date("2026-08-22T01:00:00.000Z")),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channelId: channel.id, revokeAttemptCount: 1 }),
      ]),
    );
    const retry = await prepareYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    expect(retry.tokenEnvelopeCiphertext).toBe(envelope);
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await failYouTubeDisconnect(db, {
        workspaceId: owner.workspace.id,
        channelId: channel.id,
        correlationId: randomUUID(),
        failureCategory: "service_unavailable",
      });
    }
    await expect(
      listPendingYouTubeDisconnects(adminDb, new Date("2026-08-22T02:00:00.000Z")),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ channelId: channel.id })]),
    );

    await completeYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      now: new Date("2026-08-22T01:05:00.000Z"),
    });
    await completeYouTubeDisconnect(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
    });
    const persisted = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.findUniqueOrThrow({ where: { id: channel.id } }),
    );
    expect(persisted).toMatchObject({
      state: "DISCONNECTED",
      externalAccountId: null,
      displayName: null,
      tokenEnvelopeCiphertext: null,
      authorizedDataExpiresAt: null,
      revokeAttemptCount: 0,
    });
    const actions = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.auditEvent.findMany({
        where: { targetId: channel.id },
        select: { action: true, result: true },
        orderBy: { occurredAt: "asc" },
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { action: "channel.disconnect_started", result: "success" },
        { action: "channel.disconnect_failed", result: "failed" },
        { action: "channel.disconnected", result: "success" },
        { action: "data.retention_deleted", result: "success" },
      ]),
    );
  });

  it("uses a controllable clock for the 30-day refresh-or-delete boundary", async () => {
    const owner = await fixture("retention-owner");
    const { channel } = await connectedChannel(owner, "UC_D6_RETENTION");
    const deadline = new Date("2026-09-21T00:00:00.000Z");
    await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.update({
        where: { id: channel.id },
        data: { authorizedDataExpiresAt: deadline },
      }),
    );

    await expect(
      listExpiredYouTubeAuthorizations(adminDb, new Date("2026-09-20T23:59:59.999Z")),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ channelId: channel.id })]),
    );
    await expect(listExpiredYouTubeAuthorizations(adminDb, deadline)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ channelId: channel.id })]),
    );

    const refreshedAt = new Date("2026-09-21T00:00:00.000Z");
    await refreshYouTubeAuthorizedData(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      tokenEnvelopeCiphertext: await vault.seal({
        accessToken: "refreshed-access",
        refreshToken: "refreshed-refresh",
        expiresAt: "2026-09-21T01:00:00.000Z",
        grantedScopes: youtubeOAuthScopes,
      }),
      externalAccountId: "UC_D6_RETENTION",
      displayName: "Retention channel",
      now: refreshedAt,
      correlationId: randomUUID(),
    });
    const refreshed = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.findUniqueOrThrow({ where: { id: channel.id } }),
    );
    expect(refreshed.authorizedDataExpiresAt?.toISOString()).toBe("2026-10-21T00:00:00.000Z");

    await recordExpiredAuthorizedDataDeletion(db, {
      workspaceId: owner.workspace.id,
      channelId: channel.id,
      correlationId: randomUUID(),
      now: new Date("2026-10-21T00:00:00.000Z"),
    });
    await expect(listYouTubeChannels(db, owner.workspace.id)).resolves.toMatchObject([
      {
        state: "reauthorization_required",
        externalAccountId: null,
        displayName: null,
        grantedScopes: [],
      },
    ]);
  });

  it("requires exact confirmation and completes tenant-scoped Workspace deletion", async () => {
    const owner = await fixture("deletion-owner");
    const { channel } = await connectedChannel(owner, "UC_D6_DELETE");
    const assetId = randomUUID();
    const objectKey = `workspaces/${owner.workspace.id}/source-assets/${assetId}/delete.mp4`;
    await createPendingSourceAsset(db, {
      id: assetId,
      workspaceId: owner.workspace.id,
      objectKey,
      filename: "delete.mp4",
      mediaType: "video/mp4",
      byteSize: 7,
      sha256: "d".repeat(64),
      ownershipConfirmed: true,
      uploadedByUserId: owner.user.id,
    });

    await expect(
      beginWorkspaceDataDeletion(db, {
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        confirmedWorkspaceName: "wrong name",
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow("workspace_confirmation_mismatch");

    await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.update({
        where: { id: channel.id },
        data: {
          operationLeaseId: randomUUID(),
          operationLeaseUntil: new Date("2026-08-22T02:10:00.000Z"),
        },
      }),
    );
    const deletion = await beginWorkspaceDataDeletion(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      confirmedWorkspaceName: owner.workspace.name,
      correlationId: randomUUID(),
      now: new Date("2026-08-22T02:00:00.000Z"),
    });
    expect(deletion.objectKeys).toContain(objectKey);
    expect(deletion.channels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: channel.id })]),
    );
    expect(deletion.operationsInFlight).toBe(true);
    await expect(
      completeWorkspaceDataDeletion(db, {
        workspaceId: owner.workspace.id,
        requestId: deletion.requestId,
        actorUserId: owner.user.id,
        correlationId: randomUUID(),
        now: new Date("2026-08-22T02:00:00.000Z"),
      }),
    ).rejects.toThrow("workspace_operations_in_flight");

    await failWorkspaceDataDeletion(db, {
      workspaceId: owner.workspace.id,
      requestId: deletion.requestId,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      failureCategory: "service_unavailable",
    });
    await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.channel.update({
        where: { id: channel.id },
        data: { operationLeaseId: null, operationLeaseUntil: null },
      }),
    );
    await expect(listUserWorkspaces(db, owner.user.id)).resolves.toHaveLength(1);
    const retry = await beginWorkspaceDataDeletion(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      confirmedWorkspaceName: owner.workspace.name,
      correlationId: randomUUID(),
    });
    expect(retry.requestReference).toBe(deletion.requestReference);
    expect(retry.operationsInFlight).toBe(false);

    await completeWorkspaceDataDeletion(db, {
      workspaceId: owner.workspace.id,
      requestId: retry.requestId,
      actorUserId: owner.user.id,
      correlationId: randomUUID(),
      now: new Date("2026-08-22T02:10:00.000Z"),
    });
    await expect(listUserWorkspaces(db, owner.user.id)).resolves.toEqual([]);
    const ledger = await adminDb.dataDeletionRequest.findUniqueOrThrow({
      where: { id: retry.requestId },
    });
    expect(ledger).toMatchObject({
      requestReference: deletion.requestReference,
      state: "COMPLETED",
      requestedByUserId: null,
      failureCategory: null,
    });
    await expect(
      adminDb.membership.count({ where: { workspaceId: owner.workspace.id } }),
    ).resolves.toBe(0);
    const workspace = await adminDb.workspace.findUniqueOrThrow({
      where: { id: owner.workspace.id },
    });
    expect(workspace.lifecycleState).toBe("DELETED");
    await expect(
      adminDb.auditEvent.findMany({
        where: { workspaceId: owner.workspace.id },
        select: { action: true, actorUserId: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([{ action: "data.deletion_completed", actorUserId: null }]),
    );
  });
});
