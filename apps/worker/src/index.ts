import { randomUUID } from "node:crypto";

import {
  isApplicationError,
  parseAppConfig,
  parseStoredYouTubeAuthorization,
  youtubeExecutionFailureDisposition,
} from "@jingtang/application";
import {
  acquireYouTubeChannelOperationLease,
  claimNextOutboxMessage,
  createDatabaseClient,
  completeYouTubeDisconnect,
  failYouTubeDisconnect,
  finishOutboxMessage,
  listExpiredYouTubeAuthorizations,
  listPendingYouTubeDisconnects,
  recordExpiredAuthorizedDataDeletion,
  refreshYouTubeAuthorizedData,
  readYouTubeExecutionWorkItem,
  releaseYouTubeChannelOperationLease,
  requireYouTubeReauthorization,
  recordYouTubeExecutionFailure,
  recordYouTubeExecutionPublished,
  recordYouTubeUploadAccepted,
  renewOutboxMessageClaim,
  renewYouTubeChannelOperationLease,
  resetYouTubeExecutionForRetry,
  updateChannelTokenEnvelope,
} from "@jingtang/db";
import {
  DeterministicYouTubeTestAdapter,
  GoogleYouTubeOAuthProvider,
  LocalEnvelopeTokenVault,
  S3AssetStorage,
} from "@jingtang/integrations";
import { safeLog } from "@jingtang/observability";

const config = parseAppConfig(process.env);
if (!config.DATABASE_ADMIN_URL) throw new Error("worker_database_admin_url_required");
if (
  !config.YOUTUBE_OAUTH_ENABLED ||
  !config.YOUTUBE_OAUTH_CLIENT_ID ||
  !config.YOUTUBE_OAUTH_CLIENT_SECRET ||
  config.OAUTH_TOKEN_VAULT_PROVIDER !== "local" ||
  !config.OAUTH_TOKEN_ENCRYPTION_KEY
) {
  throw new Error("worker_youtube_test_configuration_required");
}

const db = createDatabaseClient(config.DATABASE_URL);
const adminDb = createDatabaseClient(config.DATABASE_ADMIN_URL);
const googleProvider = new GoogleYouTubeOAuthProvider({
  clientId: config.YOUTUBE_OAUTH_CLIENT_ID,
  clientSecret: config.YOUTUBE_OAUTH_CLIENT_SECRET,
});
const provider =
  config.YOUTUBE_TEST_FAULT === "none"
    ? googleProvider
    : new DeterministicYouTubeTestAdapter(googleProvider, config.YOUTUBE_TEST_FAULT);
const vault = new LocalEnvelopeTokenVault(config.OAUTH_TOKEN_ENCRYPTION_KEY);
const assets = new S3AssetStorage({
  ...(config.OBJECT_STORAGE_ENDPOINT ? { endpoint: config.OBJECT_STORAGE_ENDPOINT } : {}),
  region: config.OBJECT_STORAGE_REGION,
  bucket: config.OBJECT_STORAGE_BUCKET,
  accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: config.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
  autoCreateBucket: config.OBJECT_STORAGE_AUTO_CREATE_BUCKET,
  serverSideEncryption: config.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION,
});

let stopping = false;
let lastRetentionRun = 0;

async function accessToken(work: Awaited<ReturnType<typeof readYouTubeExecutionWorkItem>>) {
  const stored = parseStoredYouTubeAuthorization(
    await vault.open<unknown>(work.tokenEnvelopeCiphertext),
  );
  if (new Date(stored.expiresAt).getTime() > Date.now() + 60_000) return stored.accessToken;
  const refreshed = await provider.refreshAuthorization(stored.refreshToken);
  const tokenEnvelopeCiphertext = await vault.seal({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? stored.refreshToken,
    expiresAt: refreshed.expiresAt.toISOString(),
    grantedScopes: [...refreshed.grantedScopes],
  });
  await updateChannelTokenEnvelope(db, {
    workspaceId: work.workspaceId,
    channelId: work.channelId,
    tokenEnvelopeCiphertext,
  });
  return refreshed.accessToken;
}

async function processNext(): Promise<boolean> {
  const message = await claimNextOutboxMessage(adminDb);
  if (!message) return false;
  const heartbeat = setInterval(() => {
    const renewals = [renewOutboxMessageClaim(adminDb, message.id)];
    if (work) {
      renewals.push(
        renewYouTubeChannelOperationLease(db, work.workspaceId, work.channelId, work.executionId),
      );
    }
    void Promise.all(renewals).catch(() => {
      safeLog("warn", "youtube_publish_lease_renewal_failed", {
        executionId: message.platformExecutionId,
      });
    });
  }, 30_000);
  let work: Awaited<ReturnType<typeof readYouTubeExecutionWorkItem>> | undefined;
  try {
    work = await readYouTubeExecutionWorkItem(db, message.workspaceId, message.platformExecutionId);
    const token = await accessToken(work);
    let videoId = work.providerId;
    if (!videoId) {
      const asset = await assets.open(work.objectKey);
      if (asset.contentLength !== undefined && asset.contentLength !== work.byteSize) {
        throw new Error("source_asset_size_mismatch");
      }
      const uploaded = await provider.uploadPrivateVideo({
        accessToken: token,
        title: work.title,
        description: work.description,
        madeForKids: work.madeForKids,
        mediaType: work.mediaType,
        byteSize: work.byteSize,
        body: asset.body,
      });
      videoId = uploaded.videoId;
      await recordYouTubeUploadAccepted(db, {
        workspaceId: message.workspaceId,
        executionId: work.executionId,
        providerId: uploaded.videoId,
        providerUrl: uploaded.videoUrl,
      });
    }
    const status = await provider.readVideoStatus(token, videoId);
    if (status.state === "published") {
      await recordYouTubeExecutionPublished(db, message.workspaceId, work.executionId);
      await finishOutboxMessage(adminDb, { id: message.id, outcome: "completed" });
      safeLog("info", "youtube_publish_completed", {
        workspaceId: message.workspaceId,
        executionId: work.executionId,
      });
      return true;
    }
    if (status.state === "failed") {
      const failureCategory = status.failureCategory ?? "provider_processing_failed";
      await recordYouTubeExecutionFailure(db, {
        workspaceId: message.workspaceId,
        executionId: work.executionId,
        failureCategory,
        needsAttention: false,
      });
      await finishOutboxMessage(adminDb, {
        id: message.id,
        outcome: "dead",
        failureCategory,
      });
      return true;
    }
    await finishOutboxMessage(adminDb, {
      id: message.id,
      outcome: "retry",
      retryAfterSeconds: 10,
    });
  } catch (error) {
    const failureCategory = isApplicationError(error)
      ? error.code
      : error instanceof Error && /^[a-z_]+$/u.test(error.message)
        ? error.message
        : "internal_error";
    const { needsAttention, terminal } = youtubeExecutionFailureDisposition(
      failureCategory,
      message.attempt,
    );
    safeLog("warn", "youtube_publish_attempt_failed", {
      workspaceId: message.workspaceId,
      executionId: message.platformExecutionId,
      failureCategory,
      terminal,
    });
    if (terminal) {
      if (needsAttention && work) {
        await requireYouTubeReauthorization(db, {
          workspaceId: message.workspaceId,
          channelId: work.channelId,
          executionId: message.platformExecutionId,
        });
      }
      await recordYouTubeExecutionFailure(db, {
        workspaceId: message.workspaceId,
        executionId: message.platformExecutionId,
        failureCategory,
        needsAttention,
      });
    } else {
      await resetYouTubeExecutionForRetry(db, message.workspaceId, message.platformExecutionId);
    }
    await finishOutboxMessage(adminDb, {
      id: message.id,
      outcome: terminal ? "dead" : "retry",
      failureCategory,
      retryAfterSeconds: 15,
    });
  } finally {
    clearInterval(heartbeat);
    if (work) {
      await releaseYouTubeChannelOperationLease(
        db,
        work.workspaceId,
        work.channelId,
        work.executionId,
      ).catch(() => {
        safeLog("warn", "youtube_channel_operation_lease_release_failed", {
          workspaceId: work?.workspaceId,
          executionId: work?.executionId,
        });
      });
    }
  }
  return true;
}

async function processAuthorizedDataRetention(now = new Date()): Promise<number> {
  const expired = await listExpiredYouTubeAuthorizations(adminDb, now);
  for (const channel of expired) {
    const correlationId = randomUUID();
    const leaseAcquired = await acquireYouTubeChannelOperationLease(
      db,
      channel.workspaceId,
      channel.channelId,
      correlationId,
      now,
    );
    if (!leaseAcquired) continue;
    try {
      const stored = parseStoredYouTubeAuthorization(
        await vault.open<unknown>(channel.tokenEnvelopeCiphertext),
      );
      const refreshed = await provider.refreshAuthorization(stored.refreshToken);
      const authorizedChannel = await provider.readAuthorizedChannel(refreshed.accessToken);
      const tokenEnvelopeCiphertext = await vault.seal({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? stored.refreshToken,
        expiresAt: refreshed.expiresAt.toISOString(),
        grantedScopes: [...refreshed.grantedScopes],
      });
      await refreshYouTubeAuthorizedData(db, {
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        tokenEnvelopeCiphertext,
        externalAccountId: authorizedChannel.id,
        displayName: authorizedChannel.displayName,
        now,
        correlationId,
      });
    } catch (error) {
      await recordExpiredAuthorizedDataDeletion(db, {
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        correlationId,
        now,
      });
      safeLog("warn", "youtube_authorized_data_expired", {
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        failureCategory: isApplicationError(error) ? error.code : "refresh_failed",
      });
    } finally {
      await releaseYouTubeChannelOperationLease(
        db,
        channel.workspaceId,
        channel.channelId,
        correlationId,
      ).catch(() => {
        safeLog("warn", "youtube_retention_lease_release_failed", {
          workspaceId: channel.workspaceId,
          channelId: channel.channelId,
        });
      });
    }
  }
  return expired.length;
}

async function processPendingYouTubeDisconnects(now = new Date()): Promise<number> {
  const retryBefore = new Date(now.getTime() - 60_000);
  const pending = await listPendingYouTubeDisconnects(adminDb, retryBefore, 25, now);
  for (const channel of pending) {
    const correlationId = randomUUID();
    try {
      const stored = parseStoredYouTubeAuthorization(
        await vault.open<unknown>(channel.tokenEnvelopeCiphertext),
      );
      await provider.revokeAuthorization(stored.refreshToken);
      await completeYouTubeDisconnect(db, {
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        correlationId,
        now,
      });
      safeLog("info", "youtube_disconnect_retry_completed", {
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        attempt: channel.revokeAttemptCount + 1,
      });
    } catch (error) {
      const failureCategory = isApplicationError(error)
        ? error.code
        : error instanceof Error && /^[a-z_]+$/u.test(error.message)
          ? error.message
          : "revoke_failed";
      await failYouTubeDisconnect(db, {
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        correlationId,
        failureCategory,
      });
      safeLog("warn", "youtube_disconnect_retry_failed", {
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        attempt: channel.revokeAttemptCount + 1,
        failureCategory,
      });
    }
  }
  return pending.length;
}

async function run(): Promise<void> {
  safeLog("info", "worker.youtube_publish_ready", { stage: "D6" });
  while (!stopping) {
    if (Date.now() - lastRetentionRun >= 60_000) {
      lastRetentionRun = Date.now();
      try {
        const now = new Date();
        await processPendingYouTubeDisconnects(now);
        await processAuthorizedDataRetention(now);
      } catch (error) {
        safeLog("error", "youtube_lifecycle_batch_failed", {
          failureCategory:
            error instanceof Error && /^[a-z_]+$/u.test(error.message)
              ? error.message
              : "internal_error",
        });
      }
    }
    const worked = await processNext();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    safeLog("info", "worker.shutdown", { reason: signal });
  });
}

if (process.env.NODE_ENV !== "test") {
  void run().catch((error: unknown) => {
    safeLog("error", "worker.fatal", {
      failureCategory:
        error instanceof Error && /^[a-z_]+$/u.test(error.message)
          ? error.message
          : "internal_error",
    });
    process.exitCode = 1;
  });
}
