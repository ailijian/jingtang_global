import { randomUUID } from "node:crypto";

import {
  authorizationMaterialFailureRequiresLocalErasure,
  authorizedDataRefreshFailureRequiresDeletion,
  facebookExecutionFailureDisposition,
  isApplicationError,
  parseAppConfig,
  parseStoredYouTubeAuthorization,
  parseStoredFacebookAuthorization,
  persistSealedTokenEnvelope,
  runResilientPollingLoop,
  shouldResetYouTubeExecutionForRetry,
  youtubeExecutionFailureDisposition,
} from "@jingtang/application";
import {
  accountAuthorizedDataDeletionPending,
  claimQueuedOutboxMessage,
  claimExpiredSourceAssetUploadCleanup,
  claimLifecycleOperation,
  claimNextOutboxMessage,
  completeAuthorizedDataRetention,
  completeSourceAssetUploadCleanup,
  completeAccountDeletion,
  completeWorkspaceDataDeletion,
  completeYouTubeDisconnect,
  createDatabaseClient,
  enqueueDueLifecycleOperations,
  failWorkspaceDataDeletion,
  failYouTubeDisconnect,
  finishLifecycleOperation,
  finishOutboxMessage,
  LifecycleOperationKind,
  LifecycleOperationState,
  LifecycleStepState,
  lifecycleOperationDeadlineExceeded,
  listAccountAuthorizedChannelsForDeletion,
  purgeExpiredLifecycleRecords,
  prepareAccountIdentityDeletion,
  prepareYouTubeDisconnect,
  readExpiredYouTubeAuthorization,
  readFacebookExecutionWorkItem,
  readWorkspaceDataDeletionMaterial,
  readYouTubeDisconnectMaterial,
  readYouTubeExecutionWorkItem,
  recordClaimedYouTubeExecutionFailureAndCompleteOutbox,
  recordExpiredAuthorizedDataDeletion,
  recordLifecycleStep,
  recordYouTubeExecutionFailureAndCompleteOutbox,
  recordYouTubeExecutionPublishedAndCompleteOutbox,
  recordYouTubeUploadAccepted,
  refreshYouTubeAuthorizedData,
  releaseAuthorizedDataRetentionLease,
  releaseYouTubeChannelOperationLease,
  renewLifecycleOperationClaim,
  renewOutboxMessageClaim,
  renewYouTubeChannelOperationLease,
  resetYouTubeExecutionForRetry,
  resumeWorkspaceDataDeletion,
  updateChannelTokenEnvelope,
  type ClaimedLifecycleOperation,
  type ClaimedOutboxMessage,
  type LifecycleClaimGuard,
} from "@jingtang/db";
import {
  CognitoIdentityProvider,
  createTencentCiamIdentityDeletionProvider,
  createObjectStorageCredentials,
  createTokenEnvelopeVault,
  DeterministicYouTubeTestAdapter,
  GoogleYouTubeOAuthProvider,
  MetaFacebookOAuthProvider,
  loadRuntimeSecretBundle,
  loadRuntimeSecretFiles,
  MockIdentityProvider,
  RabbitCommandConsumer,
  S3AssetStorage,
} from "@jingtang/integrations";
import { safeLog } from "@jingtang/observability";

loadRuntimeSecretFiles(process.env, "worker");
await loadRuntimeSecretBundle(process.env, "worker");
const config = parseAppConfig(process.env);
if (!config.DATABASE_WORKER_URL) throw new Error("worker_database_url_required");
if (
  !config.YOUTUBE_OAUTH_ENABLED ||
  !config.YOUTUBE_OAUTH_CLIENT_ID ||
  !config.YOUTUBE_OAUTH_CLIENT_SECRET
) {
  throw new Error("worker_youtube_configuration_required");
}

const workerId = `youtube-worker:${process.pid}:${randomUUID()}`;
const db = createDatabaseClient(config.DATABASE_WORKER_URL);
const googleProvider = new GoogleYouTubeOAuthProvider({
  clientId: config.YOUTUBE_OAUTH_CLIENT_ID,
  clientSecret: config.YOUTUBE_OAUTH_CLIENT_SECRET,
});
const provider =
  config.YOUTUBE_TEST_FAULT === "none"
    ? googleProvider
    : new DeterministicYouTubeTestAdapter(googleProvider, config.YOUTUBE_TEST_FAULT);
const facebookProvider = config.FACEBOOK_OAUTH_ENABLED
  ? new MetaFacebookOAuthProvider({
      appId: config.FACEBOOK_APP_ID ?? "",
      appSecret: config.FACEBOOK_APP_SECRET ?? "",
      loginConfigurationId: config.FACEBOOK_LOGIN_CONFIGURATION_ID ?? "",
      graphApiVersion: config.FACEBOOK_GRAPH_API_VERSION,
    })
  : undefined;
const vault = createTokenEnvelopeVault(config);
const identity =
  config.IDENTITY_PROVIDER === "ciam"
    ? createTencentCiamIdentityDeletionProvider(config)
    : config.IDENTITY_PROVIDER === "cognito"
      ? new CognitoIdentityProvider(
          config.COGNITO_REGION,
          config.COGNITO_USER_POOL_ID ?? "",
          config.COGNITO_CLIENT_ID ?? "",
        )
      : new MockIdentityProvider({
          ...(config.APP_ENV === "local" || config.APP_ENV === "review"
            ? { storagePath: config.LOCAL_IDENTITY_STORE_PATH ?? "../../.local/mock-identity.json" }
            : {}),
          selfServiceEnabled: config.APP_ENV !== "review",
        });
const assets = new S3AssetStorage({
  ...(config.OBJECT_STORAGE_ENDPOINT ? { endpoint: config.OBJECT_STORAGE_ENDPOINT } : {}),
  region: config.OBJECT_STORAGE_REGION,
  bucket: config.OBJECT_STORAGE_BUCKET,
  credentials: createObjectStorageCredentials(config),
  forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
  autoCreateBucket: config.OBJECT_STORAGE_AUTO_CREATE_BUCKET,
  serverSideEncryption: config.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION
    ? config.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION_MODE === "aes256"
      ? "AES256"
      : "bucket_default"
    : false,
  requestTimeoutMs: config.OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
});

let stopping = false;
const lifecycleIntervalMs = 5_000;
const sourceAssetUploadCleanupIntervalMs = 30_000;
const sourceAssetUploadExpirationMs = 20 * 60_000;

function failureCategory(error: unknown, fallback = "internal_error"): string {
  return isApplicationError(error)
    ? error.code
    : error instanceof Error && /^[a-z_]+$/u.test(error.message)
      ? error.message
      : fallback;
}

async function deadlineExceededNow(
  operation: ClaimedLifecycleOperation,
  previouslyExceeded = false,
): Promise<boolean> {
  return previouslyExceeded || lifecycleOperationDeadlineExceeded(db, claimGuard(operation));
}

async function accessToken(
  work: Awaited<ReturnType<typeof readYouTubeExecutionWorkItem>>,
): Promise<string> {
  const stored = parseStoredYouTubeAuthorization(
    await vault.open<unknown>(work.tokenEnvelopeCiphertext, work.tokenCiphertextReference),
  );
  const expired = new Date(stored.expiresAt).getTime() <= Date.now() + 60_000;
  const refreshed = expired ? await provider.refreshAuthorization(stored.refreshToken) : null;
  const authorization = refreshed
    ? {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? stored.refreshToken,
        expiresAt: refreshed.expiresAt.toISOString(),
        grantedScopes: [...refreshed.grantedScopes],
      }
    : stored;
  if (!expired && work.tokenCiphertextReference) return stored.accessToken;
  const envelope = await vault.seal(authorization);
  try {
    await updateChannelTokenEnvelope(db, {
      workspaceId: work.workspaceId,
      channelId: work.channelId,
      executionId: work.executionId,
      leaseGeneration: work.leaseGeneration,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      expectedTokenCiphertextReference: work.tokenCiphertextReference,
    });
  } catch (error) {
    await vault.destroy(envelope.keyReference);
    throw error;
  }
  return authorization.accessToken;
}

async function facebookAuthorization(
  work: Awaited<ReturnType<typeof readFacebookExecutionWorkItem>>,
): Promise<ReturnType<typeof parseStoredFacebookAuthorization>> {
  if (!facebookProvider) throw new Error("facebook_configuration_required");
  const stored = parseStoredFacebookAuthorization(
    await vault.open<unknown>(work.tokenEnvelopeCiphertext, work.tokenCiphertextReference),
  );
  const refreshed = await facebookProvider.refreshAuthorization(stored.userAccessToken);
  const [user, pages] = await Promise.all([
    facebookProvider.readAuthorizedUser(refreshed.userAccessToken),
    facebookProvider.readManagedPages(refreshed.userAccessToken),
  ]);
  const page = pages.find((entry) => entry.id === stored.pageId);
  if (user.id !== stored.metaUserId || !page) {
    throw new Error("authorized_channel_identity_mismatch");
  }
  const authorization = {
    userAccessToken: refreshed.userAccessToken,
    pageAccessToken: page.accessToken,
    expiresAt: refreshed.expiresAt.toISOString(),
    grantedScopes: [...refreshed.grantedScopes],
    metaUserId: user.id,
    pageId: page.id,
  };
  const envelope = await vault.seal(authorization);
  try {
    await updateChannelTokenEnvelope(db, {
      workspaceId: work.workspaceId,
      channelId: work.channelId,
      executionId: work.executionId,
      leaseGeneration: work.leaseGeneration,
      tokenEnvelopeCiphertext: envelope.ciphertext,
      tokenCiphertextReference: envelope.keyReference,
      expectedTokenCiphertextReference: work.tokenCiphertextReference,
    });
  } catch (error) {
    await vault.destroy(envelope.keyReference);
    throw error;
  }
  return authorization;
}

async function processClaimedPublish(message: ClaimedOutboxMessage): Promise<"ack" | "retry"> {
  const platform =
    message.topic === "platform.facebook.publish.v1" ? ("facebook" as const) : ("youtube" as const);
  let work: Awaited<ReturnType<typeof readYouTubeExecutionWorkItem>> | undefined;
  let providerReferencePersisted = false;
  let leaseLost = false;
  const abortController = new AbortController();
  const heartbeat = setInterval(() => {
    void (async () => {
      const outboxRenewed = await renewOutboxMessageClaim(db, {
        id: message.id,
        claimOwner: message.claimOwner,
        claimGeneration: message.claimGeneration,
      });
      const channelRenewed = work
        ? await renewYouTubeChannelOperationLease(
            db,
            work.workspaceId,
            work.channelId,
            work.executionId,
            work.leaseGeneration,
          )
        : true;
      if (!outboxRenewed || !channelRenewed) {
        leaseLost = true;
        abortController.abort(new Error("publish_lease_lost"));
      }
    })().catch(() => {
      leaseLost = true;
      abortController.abort(new Error("publish_lease_renewal_failed"));
    });
  }, 30_000);
  try {
    work =
      platform === "facebook"
        ? await readFacebookExecutionWorkItem(db, message.workspaceId, message.platformExecutionId)
        : await readYouTubeExecutionWorkItem(db, message.workspaceId, message.platformExecutionId);
    providerReferencePersisted = Boolean(work.providerId);
    const token =
      platform === "youtube" ? await accessToken(work) : await facebookAuthorization(work);
    let videoId = work.providerId;
    if (!videoId) {
      const asset = await assets.open(work.objectKey);
      if (asset.contentLength !== undefined && asset.contentLength !== work.byteSize) {
        throw new Error("source_asset_size_mismatch");
      }
      const uploaded =
        platform === "facebook"
          ? await (() => {
              if (!facebookProvider) throw new Error("facebook_configuration_required");
              if (work.mediaType !== "video/mp4") throw new Error("facebook_mp4_required");
              if (typeof token === "string") throw new Error("token_envelope_invalid");
              return facebookProvider.uploadPageVideo({
                userAccessToken: token.userAccessToken,
                pageAccessToken: token.pageAccessToken,
                pageId: token.pageId,
                title: work.title,
                description: work.description,
                mediaType: "video/mp4",
                byteSize: work.byteSize,
                sha256: work.sha256,
                body: asset.body,
                signal: abortController.signal,
              });
            })()
          : await provider.uploadPrivateVideo({
              accessToken: token as string,
              title: work.title,
              description: work.description,
              madeForKids: work.madeForKids,
              mediaType: work.mediaType,
              byteSize: work.byteSize,
              body: asset.body,
              signal: abortController.signal,
            });
      videoId = uploaded.videoId;
      await recordYouTubeUploadAccepted(db, {
        workspaceId: message.workspaceId,
        executionId: work.executionId,
        channelId: work.channelId,
        leaseGeneration: work.leaseGeneration,
        providerId: uploaded.videoId,
        providerUrl: uploaded.videoUrl,
        platform,
      });
      providerReferencePersisted = true;
    }
    if (!videoId) throw new Error("provider_reference_missing");
    const status =
      platform === "facebook"
        ? await (() => {
            if (!facebookProvider) throw new Error("facebook_configuration_required");
            if (typeof token === "string") throw new Error("token_envelope_invalid");
            return facebookProvider.readVideoStatus({
              pageAccessToken: token.pageAccessToken,
              videoId,
              signal: abortController.signal,
            });
          })()
        : await provider.readVideoStatus(token as string, videoId, abortController.signal);
    if (status.state === "published") {
      await recordYouTubeExecutionPublishedAndCompleteOutbox(db, {
        workspaceId: message.workspaceId,
        executionId: work.executionId,
        channelId: work.channelId,
        leaseGeneration: work.leaseGeneration,
        outboxMessageId: message.id,
        claimOwner: message.claimOwner,
        claimGeneration: message.claimGeneration,
        platform,
      });
      return "ack";
    }
    if (status.state === "failed") {
      const category = status.failureCategory ?? "provider_processing_failed";
      await recordYouTubeExecutionFailureAndCompleteOutbox(db, {
        workspaceId: message.workspaceId,
        executionId: work.executionId,
        channelId: work.channelId,
        leaseGeneration: work.leaseGeneration,
        failureCategory: category,
        needsAttention: false,
        requireReauthorization: false,
        outboxMessageId: message.id,
        claimOwner: message.claimOwner,
        claimGeneration: message.claimGeneration,
        platform,
      });
      return "ack";
    }
    await finishOutboxMessage(db, {
      id: message.id,
      outcome: "retry",
      retryAfterSeconds: 10,
      claimOwner: message.claimOwner,
      claimGeneration: message.claimGeneration,
    });
    // The durable outbox now owns retry timing. Acknowledge this broker copy so
    // RabbitMQ does not hot-requeue it in parallel with the scheduled retry.
    return "ack";
  } catch (error) {
    const category = leaseLost ? "publish_lease_lost" : failureCategory(error);
    if (leaseLost || category === "publish_fence_lost" || category === "outbox_claim_lost") {
      safeLog("warn", "youtube_publish_stale_worker_fenced", {
        workspaceId: message.workspaceId,
        executionId: message.platformExecutionId,
        failureCategory: category,
      });
      return "retry";
    }
    const disposition =
      platform === "facebook"
        ? facebookExecutionFailureDisposition(category, message.attempt)
        : youtubeExecutionFailureDisposition(category, message.attempt);
    const requireReauthorization = [
      "authentication_failed",
      "permission_denied",
      "channel_reauthorization_required",
      "authorized_channel_identity_mismatch",
      "token_envelope_invalid",
    ].includes(category);
    if (disposition.terminal) {
      if (work) {
        await recordYouTubeExecutionFailureAndCompleteOutbox(db, {
          workspaceId: message.workspaceId,
          executionId: message.platformExecutionId,
          channelId: work.channelId,
          leaseGeneration: work.leaseGeneration,
          failureCategory: category,
          needsAttention: disposition.needsAttention,
          requireReauthorization,
          outboxMessageId: message.id,
          claimOwner: message.claimOwner,
          claimGeneration: message.claimGeneration,
          platform,
        });
      } else {
        await recordClaimedYouTubeExecutionFailureAndCompleteOutbox(db, {
          workspaceId: message.workspaceId,
          executionId: message.platformExecutionId,
          outboxMessageId: message.id,
          claimOwner: message.claimOwner,
          claimGeneration: message.claimGeneration,
          failureCategory: category,
          needsAttention: disposition.needsAttention,
          platform,
        });
      }
      return "ack";
    }
    if (
      work &&
      shouldResetYouTubeExecutionForRetry({
        executionState: work.state,
        providerReferencePersisted,
      })
    ) {
      await resetYouTubeExecutionForRetry(db, {
        workspaceId: message.workspaceId,
        executionId: message.platformExecutionId,
        channelId: work.channelId,
        leaseGeneration: work.leaseGeneration,
      });
    }
    await finishOutboxMessage(db, {
      id: message.id,
      outcome: "retry",
      failureCategory: category,
      retryAfterSeconds: 15,
      claimOwner: message.claimOwner,
      claimGeneration: message.claimGeneration,
    });
  } finally {
    clearInterval(heartbeat);
    if (work) {
      await releaseYouTubeChannelOperationLease(
        db,
        work.workspaceId,
        work.channelId,
        work.executionId,
        work.leaseGeneration,
      ).catch(() => undefined);
    }
  }
  return "ack";
}

async function processNextLocalPublish(): Promise<boolean> {
  const message = await claimNextOutboxMessage(db, workerId);
  if (!message) return false;
  await processClaimedPublish(message);
  return true;
}

function claimGuard(operation: ClaimedLifecycleOperation): LifecycleClaimGuard {
  return {
    operationId: operation.id,
    workerId,
    claimGeneration: operation.claimGeneration,
  };
}

async function lifecycleStep<T>(
  operation: ClaimedLifecycleOperation,
  name: string,
  ordinal: number,
  task: () => Promise<T>,
  outcome: (value: T) => Record<string, string | number | boolean | null> = () => ({}),
): Promise<T> {
  const started = await recordLifecycleStep(db, {
    operationId: operation.id,
    workerId,
    claimGeneration: operation.claimGeneration,
    name,
    ordinal,
    state: LifecycleStepState.RUNNING,
  });
  if (!started) throw new Error("lifecycle_claim_lost");
  try {
    const value = await task();
    const completed = await recordLifecycleStep(db, {
      operationId: operation.id,
      workerId,
      claimGeneration: operation.claimGeneration,
      name,
      ordinal,
      state: LifecycleStepState.COMPLETED,
      outcome: outcome(value),
    });
    if (!completed) throw new Error("lifecycle_claim_lost");
    return value;
  } catch (error) {
    await recordLifecycleStep(db, {
      operationId: operation.id,
      workerId,
      claimGeneration: operation.claimGeneration,
      name,
      ordinal,
      state: LifecycleStepState.FAILED,
      failureCategory: failureCategory(error),
    }).catch(() => undefined);
    throw error;
  }
}

async function processChannelDisconnect(
  operation: ClaimedLifecycleOperation,
  deadlineExceeded: boolean,
): Promise<boolean> {
  if (!operation.workspaceId || !operation.channelId) throw new Error("lifecycle_scope_invalid");
  const material = await lifecycleStep(operation, "load_authorization", 10, () =>
    readYouTubeDisconnectMaterial(db, {
      workspaceId: operation.workspaceId!,
      channelId: operation.channelId!,
      lifecycleClaim: claimGuard(operation),
    }),
  );
  if (material.operationsInFlight) throw new Error("channel_operations_in_flight");
  let revocationOutcome:
    "provider_revoked" | "provider_revoke_failed_local_erased" | "local_cleanup_deadline" =
    "provider_revoked";
  await lifecycleStep(operation, "provider_revoke", 20, async () => {
    if (!material.tokenEnvelopeCiphertext) return false;
    let stored:
      | ReturnType<typeof parseStoredYouTubeAuthorization>
      | ReturnType<typeof parseStoredFacebookAuthorization>;
    try {
      const opened = await vault.open<unknown>(
        material.tokenEnvelopeCiphertext,
        material.tokenCiphertextReference,
      );
      stored =
        material.platform === "facebook"
          ? parseStoredFacebookAuthorization(opened)
          : parseStoredYouTubeAuthorization(opened);
    } catch (error) {
      const category = failureCategory(error, "token_envelope_invalid");
      const effectiveDeadlineExceeded = await deadlineExceededNow(operation, deadlineExceeded);
      if (!authorizationMaterialFailureRequiresLocalErasure(category, effectiveDeadlineExceeded)) {
        throw error;
      }
      revocationOutcome = effectiveDeadlineExceeded
        ? "local_cleanup_deadline"
        : "provider_revoke_failed_local_erased";
      return false;
    }
    try {
      if (material.platform === "facebook") {
        if (!facebookProvider) throw new Error("facebook_configuration_required");
        if (!("userAccessToken" in stored)) throw new Error("token_envelope_invalid");
        await facebookProvider.revokeAuthorization(stored.userAccessToken);
      } else {
        if (!("refreshToken" in stored)) throw new Error("token_envelope_invalid");
        await provider.revokeAuthorization(stored.refreshToken);
      }
    } catch (error) {
      if (!(await deadlineExceededNow(operation, deadlineExceeded))) throw error;
      revocationOutcome = "local_cleanup_deadline";
    }
    return revocationOutcome === "provider_revoked";
  });
  return lifecycleStep(operation, "local_authorized_data_delete", 30, () =>
    completeYouTubeDisconnect(db, {
      workspaceId: operation.workspaceId!,
      channelId: operation.channelId!,
      ...(operation.actorUserId ? { actorUserId: operation.actorUserId } : {}),
      correlationId: operation.correlationId,
      deadlineAt: operation.deadlineAt,
      revocationOutcome,
      platform: material.platform,
      lifecycleClaim: claimGuard(operation),
    }),
  );
}

async function processWorkspaceDeletion(
  operation: ClaimedLifecycleOperation,
  deadlineExceeded: boolean,
): Promise<boolean> {
  if (!operation.workspaceId) throw new Error("lifecycle_scope_invalid");
  const material = await lifecycleStep(operation, "load_deletion_material", 10, () =>
    readWorkspaceDataDeletionMaterial(db, {
      workspaceId: operation.workspaceId!,
      lifecycleOperationId: operation.id,
      lifecycleClaim: claimGuard(operation),
    }),
  );
  await resumeWorkspaceDataDeletion(db, {
    workspaceId: operation.workspaceId,
    requestId: material.requestId,
    lifecycleClaim: claimGuard(operation),
  });
  if (material.operationsInFlight) throw new Error("workspace_operations_in_flight");
  let effectiveDeadlineExceeded = deadlineExceeded;
  let revocationOutcome:
    "provider_revoked" | "provider_revoke_failed_local_erased" | "local_cleanup_deadline" =
    "provider_revoked";
  await lifecycleStep(
    operation,
    "provider_revoke",
    20,
    async () => {
      let revoked = 0;
      let unavailable = 0;
      for (const channel of material.channels) {
        if (!channel.tokenEnvelopeCiphertext) continue;
        let stored:
          | ReturnType<typeof parseStoredYouTubeAuthorization>
          | ReturnType<typeof parseStoredFacebookAuthorization>;
        try {
          const opened = await vault.open<unknown>(
            channel.tokenEnvelopeCiphertext,
            channel.tokenCiphertextReference,
          );
          stored =
            channel.platform === "facebook"
              ? parseStoredFacebookAuthorization(opened)
              : parseStoredYouTubeAuthorization(opened);
        } catch (error) {
          const category = failureCategory(error, "token_envelope_invalid");
          effectiveDeadlineExceeded = await deadlineExceededNow(
            operation,
            effectiveDeadlineExceeded,
          );
          if (
            !authorizationMaterialFailureRequiresLocalErasure(category, effectiveDeadlineExceeded)
          ) {
            throw error;
          }
          revocationOutcome = effectiveDeadlineExceeded
            ? "local_cleanup_deadline"
            : "provider_revoke_failed_local_erased";
          continue;
        }
        try {
          if (channel.platform === "facebook") {
            if (!facebookProvider) throw new Error("facebook_configuration_required");
            if (!("userAccessToken" in stored)) throw new Error("token_envelope_invalid");
            await facebookProvider.revokeAuthorization(stored.userAccessToken);
          } else {
            if (!("refreshToken" in stored)) throw new Error("token_envelope_invalid");
            await provider.revokeAuthorization(stored.refreshToken);
          }
          revoked += 1;
        } catch (error) {
          unavailable += 1;
          effectiveDeadlineExceeded = await deadlineExceededNow(
            operation,
            effectiveDeadlineExceeded,
          );
          if (!effectiveDeadlineExceeded) throw error;
          revocationOutcome = "local_cleanup_deadline";
        }
      }
      return { revoked, unavailable };
    },
    ({ revoked, unavailable }) => ({
      provider_revoked_count: revoked,
      provider_unavailable_count: unavailable,
      revocation_outcome: revocationOutcome,
    }),
  );
  const pendingObjectKeys = await lifecycleStep(
    operation,
    "object_delete",
    30,
    async () => {
      const pending: string[] = [];
      for (const objectKey of material.objectKeys) {
        await assets.delete(objectKey).catch(() => pending.push(objectKey));
      }
      return pending;
    },
    (pending) => ({ pending_object_count: pending.length }),
  );
  if (pendingObjectKeys.length > 0) {
    effectiveDeadlineExceeded = await deadlineExceededNow(operation, effectiveDeadlineExceeded);
    if (!effectiveDeadlineExceeded) throw new Error("object_deletion_failed");
  }
  return lifecycleStep(
    operation,
    "database_pseudonymize_and_delete",
    40,
    () =>
      completeWorkspaceDataDeletion(db, {
        workspaceId: operation.workspaceId!,
        requestId: material.requestId,
        actorUserId: material.actorUserId,
        correlationId: operation.correlationId,
        deadlineAt: operation.deadlineAt,
        revocationOutcome,
        pendingObjectKeys,
        lifecycleClaim: claimGuard(operation),
      }),
    (completed) => ({ completed, pending_object_count: pendingObjectKeys.length }),
  );
}

async function processAuthorizedDataRetention(
  operation: ClaimedLifecycleOperation,
): Promise<boolean> {
  if (!operation.workspaceId || !operation.channelId) throw new Error("lifecycle_scope_invalid");
  const material = await lifecycleStep(operation, "load_authorization", 10, () =>
    readExpiredYouTubeAuthorization(db, {
      workspaceId: operation.workspaceId!,
      channelId: operation.channelId!,
      expectedAuthorizedDataExpiresAt: operation.deadlineAt,
      lifecycleClaim: claimGuard(operation),
    }),
  );
  const deleteExpiredAuthorization = async (
    failureCategory: string,
    deadlineExceeded: boolean,
  ): Promise<void> => {
    await recordExpiredAuthorizedDataDeletion(db, {
      workspaceId: operation.workspaceId!,
      channelId: operation.channelId!,
      correlationId: operation.correlationId,
      expectedTokenCiphertextReference: material.tokenCiphertextReference,
      channelOperationGeneration: material.channelOperationGeneration,
      lifecycleClaim: claimGuard(operation),
    });
    safeLog("warn", "youtube_authorized_data_deleted_after_refresh_failure", {
      workspaceId: operation.workspaceId,
      channelId: operation.channelId,
      failureCategory,
      deadlineExceeded,
    });
  };
  try {
    const deadlineExceeded = await lifecycleOperationDeadlineExceeded(db, claimGuard(operation));
    if (deadlineExceeded) {
      await deleteExpiredAuthorization("authorized_data_refresh_deadline_exceeded", true);
    } else {
      await lifecycleStep(operation, "refresh_exact_channel", 20, async () => {
        const opened = await vault.open<unknown>(
          material.tokenEnvelopeCiphertext,
          material.tokenCiphertextReference,
        );
        const refreshedAuthorization =
          material.platform === "facebook"
            ? await (async () => {
                if (!facebookProvider) throw new Error("facebook_configuration_required");
                const stored = parseStoredFacebookAuthorization(opened);
                const refreshed = await facebookProvider.refreshAuthorization(
                  stored.userAccessToken,
                );
                const user = await facebookProvider.readAuthorizedUser(refreshed.userAccessToken);
                if (user.id !== stored.metaUserId) {
                  throw new Error("authorized_channel_identity_mismatch");
                }
                const pages = await facebookProvider.readManagedPages(refreshed.userAccessToken);
                const page = pages.find((entry) => entry.id === material.externalAccountId);
                if (!page) throw new Error("authorized_channel_identity_mismatch");
                return {
                  envelope: {
                    userAccessToken: refreshed.userAccessToken,
                    pageAccessToken: page.accessToken,
                    expiresAt: refreshed.expiresAt.toISOString(),
                    grantedScopes: [...refreshed.grantedScopes],
                    metaUserId: user.id,
                    pageId: page.id,
                  },
                  displayName: page.displayName,
                };
              })()
            : await (async () => {
                const stored = parseStoredYouTubeAuthorization(opened);
                const refreshed = await provider.refreshAuthorization(stored.refreshToken);
                const channel = await provider.readAuthorizedChannel(refreshed.accessToken);
                if (channel.id !== material.externalAccountId) {
                  throw new Error("authorized_channel_identity_mismatch");
                }
                return {
                  envelope: {
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken ?? stored.refreshToken,
                    expiresAt: refreshed.expiresAt.toISOString(),
                    grantedScopes: [...refreshed.grantedScopes],
                  },
                  displayName: channel.displayName,
                };
              })();
        await persistSealedTokenEnvelope(vault, refreshedAuthorization.envelope, async (envelope) =>
          refreshYouTubeAuthorizedData(db, {
            workspaceId: operation.workspaceId!,
            channelId: operation.channelId!,
            tokenEnvelopeCiphertext: envelope.ciphertext,
            tokenCiphertextReference: envelope.keyReference,
            externalAccountId: material.externalAccountId,
            expectedTokenCiphertextReference: material.tokenCiphertextReference,
            expectedAuthorizedDataExpiresAt: operation.deadlineAt,
            channelOperationGeneration: material.channelOperationGeneration,
            displayName: refreshedAuthorization.displayName,
            platform: material.platform,
            correlationId: operation.correlationId,
            lifecycleClaim: claimGuard(operation),
          }),
        );
      });
    }
  } catch (error) {
    const category = failureCategory(error, "refresh_failed");
    const deadlineExceeded =
      category === "authorized_data_refresh_deadline_exceeded" ||
      (await lifecycleOperationDeadlineExceeded(db, claimGuard(operation)));
    if (!authorizedDataRefreshFailureRequiresDeletion(category, deadlineExceeded)) throw error;
    await deleteExpiredAuthorization(category, deadlineExceeded);
  } finally {
    await releaseAuthorizedDataRetentionLease(db, {
      workspaceId: operation.workspaceId,
      channelId: operation.channelId,
      operationId: operation.id,
      operationGeneration: material.channelOperationGeneration,
    }).catch(() => undefined);
  }
  return completeAuthorizedDataRetention(db, {
    workspaceId: operation.workspaceId,
    channelId: operation.channelId,
    correlationId: operation.correlationId,
    lifecycleClaim: claimGuard(operation),
  });
}

function tokenKeyReference(operation: ClaimedLifecycleOperation): string {
  if (
    operation.outcome !== null &&
    !Array.isArray(operation.outcome) &&
    typeof operation.outcome === "object"
  ) {
    const value = operation.outcome.key_reference;
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new Error("token_key_retirement_material_invalid");
}

async function processAccountDeletion(operation: ClaimedLifecycleOperation): Promise<void> {
  if (!operation.subjectUserId) throw new Error("lifecycle_scope_invalid");
  await lifecycleStep(
    operation,
    "request_authorized_data_cleanup",
    10,
    async () => {
      const channels = await listAccountAuthorizedChannelsForDeletion(db, claimGuard(operation));
      for (const channel of channels) {
        await prepareYouTubeDisconnect(db, {
          workspaceId: channel.workspaceId,
          channelId: channel.channelId,
          actorUserId: channel.userId,
          correlationId: operation.correlationId,
          deadlineAt: operation.deadlineAt,
        });
      }
      return channels.length;
    },
    (channelCount) => ({ channel_count: channelCount }),
  );
  await lifecycleStep(operation, "await_authorized_data_cleanup", 20, async () => {
    if (await accountAuthorizedDataDeletionPending(db, claimGuard(operation))) {
      throw new Error("account_authorized_data_cleanup_pending");
    }
    return true;
  });
  const material = await lifecycleStep(operation, "authorize_identity_deletion", 30, () =>
    prepareAccountIdentityDeletion(db, {
      operationId: operation.id,
      workerId,
      claimGeneration: operation.claimGeneration,
    }),
  );
  await lifecycleStep(operation, "delete_identity_account", 40, () =>
    identity.deleteAccount({ email: material.email, subject: material.identitySubject }),
  );
  const completed = await lifecycleStep(operation, "pseudonymize_local_account", 50, () =>
    completeAccountDeletion(db, {
      operationId: operation.id,
      workerId,
      claimGeneration: operation.claimGeneration,
    }),
  );
  if (!completed) throw new Error("account_owner_transfer_required");
}

async function processLifecycleOperation(): Promise<boolean> {
  await enqueueDueLifecycleOperations(db);
  const operation = await claimLifecycleOperation(db, workerId);
  if (!operation) return false;
  let claimLost = false;
  const heartbeat = setInterval(() => {
    void renewLifecycleOperationClaim(db, {
      operationId: operation.id,
      workerId,
      claimGeneration: operation.claimGeneration,
    })
      .then((renewed) => {
        if (!renewed) claimLost = true;
      })
      .catch(() => {
        claimLost = true;
      });
  }, 30_000);
  let deadlineExceeded = false;
  try {
    deadlineExceeded = await lifecycleOperationDeadlineExceeded(db, claimGuard(operation));
    let completed = true;
    switch (operation.kind) {
      case LifecycleOperationKind.CHANNEL_DISCONNECT:
        completed = await processChannelDisconnect(operation, deadlineExceeded);
        break;
      case LifecycleOperationKind.WORKSPACE_DATA_DELETION:
        completed = await processWorkspaceDeletion(operation, deadlineExceeded);
        break;
      case LifecycleOperationKind.AUTHORIZED_DATA_RETENTION:
        completed = await processAuthorizedDataRetention(operation);
        break;
      case LifecycleOperationKind.RETENTION_PURGE:
        await lifecycleStep(operation, "purge_due_records", 10, () =>
          purgeExpiredLifecycleRecords(db),
        );
        break;
      case LifecycleOperationKind.ACCOUNT_DELETION:
        await processAccountDeletion(operation);
        break;
      case LifecycleOperationKind.TOKEN_KEY_RETIREMENT:
        await lifecycleStep(operation, "destroy_token_key", 10, () =>
          vault.destroy(tokenKeyReference(operation)),
        );
        break;
    }
    deadlineExceeded = await deadlineExceededNow(operation, deadlineExceeded);
    if (claimLost) throw new Error("lifecycle_claim_lost");
    const finished = await finishLifecycleOperation(db, {
      operationId: operation.id,
      workerId,
      claimGeneration: operation.claimGeneration,
      state: completed ? LifecycleOperationState.COMPLETED : LifecycleOperationState.RETRY,
      outcome: { request_reference: operation.requestReference, completed },
      ...(completed ? {} : { failureCategory: "lifecycle_cleanup_pending", retryAfterSeconds: 60 }),
    });
    if (!finished) throw new Error("lifecycle_claim_lost");
  } catch (error) {
    const category = claimLost ? "lifecycle_claim_lost" : failureCategory(error);
    if (category === "lifecycle_claim_lost") {
      safeLog("warn", "lifecycle_stale_worker_fenced", {
        operationId: operation.id,
        requestReference: operation.requestReference,
      });
      return true;
    }
    if (
      operation.kind === LifecycleOperationKind.AUTHORIZED_DATA_RETENTION &&
      category === "authorized_data_refresh_superseded"
    ) {
      if (!operation.workspaceId || !operation.channelId) {
        throw new Error("lifecycle_scope_invalid");
      }
      const completed = await completeAuthorizedDataRetention(db, {
        workspaceId: operation.workspaceId,
        channelId: operation.channelId,
        correlationId: operation.correlationId,
        lifecycleClaim: claimGuard(operation),
      });
      const finished = await finishLifecycleOperation(db, {
        operationId: operation.id,
        workerId,
        claimGeneration: operation.claimGeneration,
        state: completed ? LifecycleOperationState.COMPLETED : LifecycleOperationState.RETRY,
        outcome: {
          request_reference: operation.requestReference,
          skipped: completed,
          reason: category,
          completed,
        },
        ...(completed
          ? {}
          : { failureCategory: "lifecycle_cleanup_pending", retryAfterSeconds: 60 }),
      });
      if (!finished) throw new Error("lifecycle_claim_lost");
      return true;
    }
    if (
      operation.kind === LifecycleOperationKind.CHANNEL_DISCONNECT &&
      operation.workspaceId &&
      operation.channelId
    ) {
      await failYouTubeDisconnect(db, {
        workspaceId: operation.workspaceId,
        channelId: operation.channelId,
        ...(operation.actorUserId ? { actorUserId: operation.actorUserId } : {}),
        correlationId: operation.correlationId,
        failureCategory: category,
        lifecycleClaim: claimGuard(operation),
      }).catch(() => undefined);
    }
    if (
      operation.kind === LifecycleOperationKind.WORKSPACE_DATA_DELETION &&
      operation.workspaceId
    ) {
      const material = await readWorkspaceDataDeletionMaterial(db, {
        workspaceId: operation.workspaceId,
        lifecycleOperationId: operation.id,
        lifecycleClaim: claimGuard(operation),
      }).catch(() => undefined);
      if (material) {
        await failWorkspaceDataDeletion(db, {
          workspaceId: operation.workspaceId,
          requestId: material.requestId,
          actorUserId: material.actorUserId,
          correlationId: operation.correlationId,
          failureCategory: category,
          lifecycleClaim: claimGuard(operation),
        }).catch(() => undefined);
      }
    }
    await finishLifecycleOperation(db, {
      operationId: operation.id,
      workerId,
      claimGeneration: operation.claimGeneration,
      // A lifecycle deadline is an operational SLA, never authority to abandon
      // revocation, deletion, pseudonymization, or retention work. Keep the
      // durable operation claimable until the compliance action completes.
      state: LifecycleOperationState.RETRY,
      failureCategory: category,
      retryAfterSeconds: Math.min(900, 15 * 2 ** Math.min(operation.attempt, 6)),
      outcome: {
        request_reference: operation.requestReference,
        deadline_exceeded: deadlineExceeded,
      },
    }).catch(() => undefined);
    safeLog("warn", "lifecycle_operation_failed", {
      operationId: operation.id,
      kind: operation.kind,
      requestReference: operation.requestReference,
      failureCategory: category,
    });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

async function cleanupExpiredSourceAssetUploads(): Promise<boolean> {
  const expiredUploads = await claimExpiredSourceAssetUploadCleanup(db, {
    uploadCutoff: new Date(Date.now() - sourceAssetUploadExpirationMs),
  });
  if (expiredUploads.length === 0) return false;

  for (const upload of expiredUploads) {
    try {
      await assets.delete(upload.objectKey);
      const completed = await completeSourceAssetUploadCleanup(db, upload.assetId);
      safeLog("info", "source_asset.expired_upload_cleanup", {
        workspaceId: upload.workspaceId,
        assetId: upload.assetId,
        completed,
      });
    } catch (error) {
      safeLog("warn", "source_asset.expired_upload_cleanup_failed", {
        workspaceId: upload.workspaceId,
        assetId: upload.assetId,
        failureCategory: failureCategory(error, "object_storage_delete_failed"),
      });
    }
  }
  return true;
}

async function waitWhileRunning(durationMs: number): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (!stopping && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, deadline - Date.now())));
  }
}

async function runLoop(
  name: string,
  operation: () => Promise<boolean>,
  idleMs: number,
): Promise<void> {
  await runResilientPollingLoop({
    shouldStop: () => stopping,
    operation,
    waitWhenIdle: () => waitWhileRunning(idleMs),
    waitAfterFailure: () => waitWhileRunning(idleMs),
    onError: (error) => {
      safeLog("error", "worker_loop_iteration_failed", {
        task: name,
        failureCategory: failureCategory(error),
      });
    },
  });
}

async function run(): Promise<void> {
  safeLog("info", "worker.lifecycle_control_plane_ready", {
    stage: "D7",
    workerId,
    asyncTransport: config.ASYNC_TRANSPORT,
  });
  if (config.ASYNC_TRANSPORT === "local") {
    await Promise.all([
      runLoop("youtube_publish", processNextLocalPublish, 1_000),
      runLoop("lifecycle_control", processLifecycleOperation, lifecycleIntervalMs),
      runLoop(
        "source_asset_upload_cleanup",
        cleanupExpiredSourceAssetUploads,
        sourceAssetUploadCleanupIntervalMs,
      ),
    ]);
    return;
  }
  if (!config.TDMQ_AMQP_URL) throw new Error("worker_tdmq_configuration_required");
  const consumer = new RabbitCommandConsumer({
    url: config.TDMQ_AMQP_URL,
    exchange: config.TDMQ_EXCHANGE,
    queue: config.TDMQ_QUEUE,
    deadLetterExchange: config.TDMQ_DEAD_LETTER_EXCHANGE,
    deadLetterQueue: config.TDMQ_DEAD_LETTER_QUEUE,
  });
  try {
    await consumer.start(
      async (command) => {
        const claimed = await claimQueuedOutboxMessage(db, {
          id: command.outboxMessageId,
          workspaceId: command.workspaceId,
          platformExecutionId: command.platformExecutionId,
          workerId,
        });
        if (claimed.kind === "busy") return "retry";
        if (claimed.kind !== "claimed") return "ack";
        return processClaimedPublish(claimed.message);
      },
      () => {
        if (stopping) return;
        stopping = true;
        process.exitCode = 1;
        safeLog("error", "worker.tdmq_connection_closed", {
          failureCategory: "tdmq_connection_closed",
        });
      },
    );
    await Promise.all([
      runLoop("lifecycle_control", processLifecycleOperation, lifecycleIntervalMs),
      runLoop(
        "source_asset_upload_cleanup",
        cleanupExpiredSourceAssetUploads,
        sourceAssetUploadCleanupIntervalMs,
      ),
    ]);
  } finally {
    await consumer.close();
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    safeLog("info", "worker.shutdown", { reason: signal });
  });
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    stopping = true;
    safeLog("error", "worker.fatal", { failureCategory: failureCategory(error) });
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

if (process.env.NODE_ENV !== "test") {
  void main();
}
