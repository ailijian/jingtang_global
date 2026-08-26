import { createHash } from "node:crypto";

import {
  LifecycleOperationKind,
  LifecycleOperationState,
  LifecycleStepState,
  type Prisma,
  type PrismaClient,
} from "./generated/client.js";

const lifecycleKindFromDatabase: Readonly<Record<string, LifecycleOperationKind>> = {
  channel_disconnect: LifecycleOperationKind.CHANNEL_DISCONNECT,
  workspace_data_deletion: LifecycleOperationKind.WORKSPACE_DATA_DELETION,
  account_deletion: LifecycleOperationKind.ACCOUNT_DELETION,
  authorized_data_retention: LifecycleOperationKind.AUTHORIZED_DATA_RETENTION,
  retention_purge: LifecycleOperationKind.RETENTION_PURGE,
  token_key_retirement: LifecycleOperationKind.TOKEN_KEY_RETIREMENT,
};

const lifecycleOperationStateDatabaseValue: Readonly<Record<LifecycleOperationState, string>> = {
  [LifecycleOperationState.PENDING]: "pending",
  [LifecycleOperationState.CLAIMED]: "claimed",
  [LifecycleOperationState.RETRY]: "retry",
  [LifecycleOperationState.COMPLETED]: "completed",
  [LifecycleOperationState.DEAD]: "dead",
};

const lifecycleStepStateDatabaseValue: Readonly<Record<LifecycleStepState, string>> = {
  [LifecycleStepState.PENDING]: "pending",
  [LifecycleStepState.RUNNING]: "running",
  [LifecycleStepState.COMPLETED]: "completed",
  [LifecycleStepState.FAILED]: "failed",
  [LifecycleStepState.SKIPPED]: "skipped",
};

export interface ClaimedLifecycleOperation {
  readonly id: string;
  readonly kind: LifecycleOperationKind;
  readonly workspaceId: string | null;
  readonly channelId: string | null;
  readonly subjectUserId: string | null;
  readonly actorUserId: string | null;
  readonly requestReference: string;
  readonly correlationId: string;
  readonly requestedAt: Date;
  readonly deadlineAt: Date;
  readonly claimGeneration: bigint;
  readonly attempt: number;
  readonly outcome: Prisma.JsonValue;
}

export async function claimLifecycleOperation(
  workerClient: PrismaClient,
  workerId: string,
  leaseSeconds = 120,
): Promise<ClaimedLifecycleOperation | null> {
  const rows = await workerClient.$queryRaw<
    {
      id: string;
      kind: string;
      workspace_id: string | null;
      channel_id: string | null;
      subject_user_id: string | null;
      actor_user_id: string | null;
      request_reference: string;
      correlation_id: string;
      requested_at: Date;
      deadline_at: Date;
      claim_generation: bigint;
      attempt: number;
      outcome: Prisma.JsonValue;
    }[]
  >`SELECT * FROM claim_lifecycle_operation(${workerId}, ${leaseSeconds})`;
  const row = rows[0];
  const kind = row ? lifecycleKindFromDatabase[row.kind] : undefined;
  if (row && !kind) throw new Error(`unsupported_lifecycle_operation_kind:${row.kind}`);
  return row
    ? {
        id: row.id,
        kind: kind!,
        workspaceId: row.workspace_id,
        channelId: row.channel_id,
        subjectUserId: row.subject_user_id,
        actorUserId: row.actor_user_id,
        requestReference: row.request_reference,
        correlationId: row.correlation_id,
        requestedAt: row.requested_at,
        deadlineAt: row.deadline_at,
        claimGeneration: row.claim_generation,
        attempt: row.attempt,
        outcome: row.outcome,
      }
    : null;
}

export async function enqueueDueLifecycleOperations(workerClient: PrismaClient): Promise<number> {
  const rows = await workerClient.$queryRaw<{ count: number }[]>`
    SELECT enqueue_due_lifecycle_operations() AS count
  `;
  return rows[0]?.count ?? 0;
}

export async function requestFacebookAuthorizedDataDeletion(
  client: PrismaClient,
  subjectReference: string,
): Promise<{ readonly confirmationCode: string; readonly state: "pending" | "completed" }> {
  const subjectHash = createHash("sha256")
    .update(`facebook:${subjectReference}`, "utf8")
    .digest("hex");
  const rows = await client.$queryRaw<
    { confirmation_code: string; deletion_state: string }[]
  >`SELECT * FROM request_facebook_authorized_data_deletion(${subjectReference}, ${subjectHash})`;
  const row = rows[0];
  if (!row || (row.deletion_state !== "pending" && row.deletion_state !== "completed")) {
    throw new Error("provider_deletion_request_failed");
  }
  return { confirmationCode: row.confirmation_code, state: row.deletion_state };
}

export async function readProviderDataDeletionStatus(
  client: PrismaClient,
  confirmationCode: string,
): Promise<"pending" | "completed" | null> {
  const rows = await client.$queryRaw<{ state: string | null }[]>`
    SELECT read_provider_data_deletion_status(${confirmationCode}) AS state
  `;
  const state = rows[0]?.state;
  return state === "pending" || state === "completed" ? state : null;
}

export async function purgeExpiredLifecycleRecords(
  workerClient: PrismaClient,
): Promise<Prisma.JsonValue> {
  const rows = await workerClient.$queryRaw<{ result: Prisma.JsonValue }[]>`
    SELECT purge_expired_lifecycle_records() AS result
  `;
  return rows[0]?.result ?? {};
}

export interface ExpiredSourceAssetUploadCleanup {
  readonly assetId: string;
  readonly workspaceId: string;
  readonly objectKey: string;
}

export async function claimExpiredSourceAssetUploadCleanup(
  workerClient: PrismaClient,
  input: {
    readonly batchSize?: number;
    readonly uploadCutoff: Date;
  },
): Promise<readonly ExpiredSourceAssetUploadCleanup[]> {
  const rows = await workerClient.$queryRaw<
    {
      asset_id: string;
      workspace_id: string;
      object_key: string;
    }[]
  >`
    SELECT * FROM claim_expired_source_asset_upload_cleanup(
      ${input.batchSize ?? 20},
      ${input.uploadCutoff}::timestamptz
    )
  `;
  return rows.map((row) => ({
    assetId: row.asset_id,
    workspaceId: row.workspace_id,
    objectKey: row.object_key,
  }));
}

export async function completeSourceAssetUploadCleanup(
  workerClient: PrismaClient,
  assetId: string,
): Promise<boolean> {
  const rows = await workerClient.$queryRaw<{ completed: boolean }[]>`
    SELECT complete_source_asset_upload_cleanup(${assetId}::uuid) AS completed
  `;
  return rows[0]?.completed ?? false;
}

export async function renewLifecycleOperationClaim(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
    readonly leaseSeconds?: number;
  },
): Promise<boolean> {
  const rows = await workerClient.$queryRaw<{ renewed: boolean }[]>`
    SELECT renew_lifecycle_operation_claim(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration},
      ${input.leaseSeconds ?? 120}
    ) AS renewed
  `;
  return rows[0]?.renewed ?? false;
}

export async function lifecycleOperationDeadlineExceeded(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
  },
): Promise<boolean> {
  const rows = await workerClient.$queryRaw<{ exceeded: boolean }[]>`
    SELECT lifecycle_operation_deadline_exceeded(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration}
    ) AS exceeded
  `;
  return rows[0]?.exceeded ?? false;
}

export async function recordLifecycleStep(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
    readonly name: string;
    readonly ordinal: number;
    readonly state: LifecycleStepState;
    readonly outcome?: Prisma.InputJsonValue;
    readonly failureCategory?: string;
  },
): Promise<boolean> {
  const outcome = input.outcome ?? {};
  const state = lifecycleStepStateDatabaseValue[input.state];
  const rows = await workerClient.$queryRaw<{ recorded: boolean }[]>`
    SELECT record_lifecycle_step(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration},
      ${input.name},
      ${input.ordinal},
      ${state}::lifecycle_step_state,
      ${JSON.stringify(outcome)}::jsonb,
      ${input.failureCategory ?? null}
    ) AS recorded
  `;
  return rows[0]?.recorded ?? false;
}

export async function finishLifecycleOperation(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
    readonly state:
      | typeof LifecycleOperationState.COMPLETED
      | typeof LifecycleOperationState.RETRY
      | typeof LifecycleOperationState.DEAD;
    readonly outcome?: Prisma.InputJsonValue;
    readonly failureCategory?: string;
    readonly retryAfterSeconds?: number;
  },
): Promise<boolean> {
  const outcome = input.outcome ?? {};
  const state = lifecycleOperationStateDatabaseValue[input.state];
  const rows = await workerClient.$queryRaw<{ finished: boolean }[]>`
    SELECT finish_lifecycle_operation(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration},
      ${state}::lifecycle_operation_state,
      ${JSON.stringify(outcome)}::jsonb,
      ${input.failureCategory ?? null},
      ${input.retryAfterSeconds ?? 60}
    ) AS finished
  `;
  return rows[0]?.finished ?? false;
}

export async function requestAccountDeletion(
  client: PrismaClient,
  input: {
    readonly userId: string;
    readonly confirmedEmail: string;
    readonly correlationId: string;
  },
): Promise<{ readonly operationId: string; readonly requestReference: string }> {
  const rows = await client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${input.userId}, true)`;
    return transaction.$queryRaw<{ operation_id: string; request_reference: string }[]>`
      SELECT * FROM request_account_deletion(
        ${input.userId}::uuid,
        ${input.confirmedEmail},
        ${input.correlationId}::uuid
      )
    `;
  });
  const row = rows[0];
  if (!row) throw new Error("account_deletion_request_failed");
  return { operationId: row.operation_id, requestReference: row.request_reference };
}

export async function prepareAccountIdentityDeletion(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
  },
): Promise<{ readonly userId: string; readonly email: string; readonly identitySubject: string }> {
  const rows = await workerClient.$queryRaw<
    { user_id: string; email: string; identity_subject: string }[]
  >`
    SELECT * FROM prepare_account_identity_deletion(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("account_deletion_material_unavailable");
  return { userId: row.user_id, email: row.email, identitySubject: row.identity_subject };
}

export async function listAccountAuthorizedChannelsForDeletion(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
  },
): Promise<
  readonly {
    readonly userId: string;
    readonly workspaceId: string;
    readonly channelId: string;
  }[]
> {
  const rows = await workerClient.$queryRaw<
    { user_id: string; workspace_id: string; channel_id: string }[]
  >`
    SELECT * FROM list_account_authorized_channels_for_deletion(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration}
    )
  `;
  return rows.map((row) => ({
    userId: row.user_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
  }));
}

export async function accountAuthorizedDataDeletionPending(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
  },
): Promise<boolean> {
  const rows = await workerClient.$queryRaw<{ pending: boolean }[]>`
    SELECT account_authorized_data_deletion_pending(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration}
    ) AS pending
  `;
  return rows[0]?.pending ?? true;
}

export async function completeAccountDeletion(
  workerClient: PrismaClient,
  input: {
    readonly operationId: string;
    readonly workerId: string;
    readonly claimGeneration: bigint;
  },
): Promise<boolean> {
  const rows = await workerClient.$queryRaw<{ completed: boolean }[]>`
    SELECT complete_account_deletion(
      ${input.operationId}::uuid,
      ${input.workerId},
      ${input.claimGeneration}
    ) AS completed
  `;
  return rows[0]?.completed ?? false;
}

export { LifecycleOperationKind, LifecycleOperationState, LifecycleStepState };
