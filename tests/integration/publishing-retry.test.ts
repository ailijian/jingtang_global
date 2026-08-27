import { randomUUID } from "node:crypto";

import { youtubeOAuthScopes } from "@jingtang/application";
import {
  beginYouTubeConnection,
  completeSourceAsset,
  completeYouTubeConnection,
  confirmContentPublishing,
  createContent,
  createDatabaseClient,
  createPendingSourceAsset,
  createSession,
  createWorkspace,
  decideContent,
  getContentDetail,
  recordConsent,
  submitContent,
  upsertIdentityUser,
} from "@jingtang/db";
import { LocalEnvelopeTokenVault } from "@jingtang/integrations";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for publishing retry tests");
const db = createDatabaseClient(databaseUrl);
const adminDb = createDatabaseClient(process.env.DATABASE_ADMIN_URL ?? databaseUrl);
const vault = new LocalEnvelopeTokenVault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

afterAll(async () => Promise.all([db.$disconnect(), adminDb.$disconnect()]));

describe("safe publishing retry", () => {
  it("creates a new immutable execution only after a terminal pre-provider failure", async () => {
    const user = await upsertIdentityUser(db, {
      subject: `retry-${randomUUID()}`,
      email: `retry-${randomUUID()}@example.test`,
      name: "Publishing Retry Owner",
      locale: "en",
    });
    const session = await createSession(db, {
      userId: user.id,
      secret: "integration-secret-at-least-32-bytes",
    });
    const workspace = await createWorkspace(db, {
      name: "Publishing Retry Workspace",
      userId: user.id,
      sessionId: session.id,
      correlationId: randomUUID(),
    });
    const consent = await recordConsent(db, {
      userId: user.id,
      termsVersion: "retry-terms-v1",
      privacyVersion: "retry-privacy-v1",
      dataPurposeVersion: "retry-youtube-purpose-v1",
      displayedLocale: "en",
      acceptanceMethod: "youtube_connection_checkbox",
    });
    const channel = await beginYouTubeConnection(db, {
      workspaceId: workspace.id,
      consentRecordId: consent.id,
      actorUserId: user.id,
      correlationId: randomUUID(),
    });
    const envelope = await vault.seal({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grantedScopes: youtubeOAuthScopes,
    });
    await completeYouTubeConnection(db, {
      workspaceId: workspace.id,
      channelId: channel.id,
      consentRecordId: consent.id,
      actorUserId: user.id,
      externalAccountId: "UC_SAFE_RETRY",
      displayName: "Safe retry channel",
      grantedScopes: youtubeOAuthScopes,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      correlationId: randomUUID(),
    });

    const assetId = randomUUID();
    await createPendingSourceAsset(db, {
      id: assetId,
      workspaceId: workspace.id,
      objectKey: `workspaces/${workspace.id}/source-assets/${assetId}/video.mp4`,
      filename: "retry.mp4",
      mediaType: "video/mp4",
      byteSize: 3,
      sha256: "b".repeat(64),
      ownershipConfirmed: true,
      uploadedByUserId: user.id,
    });
    await completeSourceAsset(db, {
      workspaceId: workspace.id,
      assetId,
      actorUserId: user.id,
      correlationId: randomUUID(),
    });
    const content = await createContent(db, {
      workspaceId: workspace.id,
      actorUserId: user.id,
      internalTitle: "Safe retry fixture",
      sourceAssetId: assetId,
      platformVersions: [
        {
          platform: "youtube",
          accountReference: "UC_SAFE_RETRY",
          accountDisplayName: "Safe retry channel",
          title: "Safe retry title",
          description: "Safe retry description",
          privacyStatus: "private",
          madeForKids: false,
        },
      ],
      correlationId: randomUUID(),
    });
    const submission = await submitContent(db, {
      workspaceId: workspace.id,
      contentId: content.id,
      actorUserId: user.id,
      correlationId: randomUUID(),
    });
    await decideContent(db, {
      workspaceId: workspace.id,
      contentId: content.id,
      revisionId: submission.revisionId,
      actorUserId: user.id,
      result: "approved",
      correlationId: randomUUID(),
    });

    const firstKey = randomUUID();
    const first = await confirmContentPublishing(db, {
      workspaceId: workspace.id,
      contentId: content.id,
      revisionId: submission.revisionId,
      actorUserId: user.id,
      consentVersion: "retry-youtube-purpose-v1",
      idempotencyKey: firstKey,
      correlationId: randomUUID(),
    });
    await adminDb.$transaction([
      adminDb.platformExecution.update({
        where: { id: first.executionId },
        data: { state: "FAILED", failureCategory: "service_unavailable" },
      }),
      adminDb.outboxMessage.update({
        where: { platformExecutionId: first.executionId },
        data: { state: "DEAD", failureCategory: "service_unavailable", completedAt: new Date() },
      }),
    ]);

    await expect(getContentDetail(db, workspace.id, content.id)).resolves.toMatchObject({
      publishing: {
        executions: [
          {
            id: first.executionId,
            state: "failed",
            providerId: null,
            retryable: true,
          },
        ],
      },
    });
    await expect(
      confirmContentPublishing(db, {
        workspaceId: workspace.id,
        contentId: content.id,
        revisionId: submission.revisionId,
        actorUserId: user.id,
        consentVersion: "retry-youtube-purpose-v1",
        idempotencyKey: firstKey,
        correlationId: randomUUID(),
      }),
    ).resolves.toEqual(first);

    const retried = await confirmContentPublishing(db, {
      workspaceId: workspace.id,
      contentId: content.id,
      revisionId: submission.revisionId,
      actorUserId: user.id,
      consentVersion: "retry-youtube-purpose-v1",
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    expect(retried.executionId).not.toBe(first.executionId);
    await expect(
      confirmContentPublishing(db, {
        workspaceId: workspace.id,
        contentId: content.id,
        revisionId: submission.revisionId,
        actorUserId: user.id,
        consentVersion: "retry-youtube-purpose-v1",
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      }),
    ).resolves.toEqual(retried);

    await adminDb.$transaction([
      adminDb.platformExecution.update({
        where: { id: retried.executionId },
        data: {
          state: "FAILED",
          failureCategory: "provider_processing_failed",
          providerId: "provider-post-id",
        },
      }),
      adminDb.outboxMessage.update({
        where: { platformExecutionId: retried.executionId },
        data: {
          state: "DEAD",
          failureCategory: "provider_processing_failed",
          completedAt: new Date(),
        },
      }),
    ]);
    await expect(
      confirmContentPublishing(db, {
        workspaceId: workspace.id,
        contentId: content.id,
        revisionId: submission.revisionId,
        actorUserId: user.id,
        consentVersion: "retry-youtube-purpose-v1",
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      }),
    ).resolves.toEqual(retried);
    await expect(
      adminDb.publishingIntent.count({ where: { workspaceId: workspace.id } }),
    ).resolves.toBe(2);
  });
});
