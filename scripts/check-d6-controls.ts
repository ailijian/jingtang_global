import { readFile } from "node:fs/promises";

async function read(path: string): Promise<string> {
  return readFile(path, "utf8");
}

const [
  security,
  operations,
  architecture,
  domain,
  lifecycle,
  lifecycleControl,
  publishing,
  schema,
  worker,
  youtubeProvider,
  assetStorage,
  auditIntegration,
  auditImplementation,
  english,
  chinese,
  deletionHardening,
  controlPlaneMigration,
  asyncStatusAndDeadlineMigration,
  disconnectRetryMigration,
  lifecycleClosureMigration,
  migrationHistoryClosure,
  atomicLifecycleClosure,
  finalReviewClosure,
  retentionDependencyScheduling,
  restoreDrill,
  disconnectRoute,
  workspaceDeletionRoute,
  accountDeletionRoute,
  environmentExample,
  applicationConfig,
] = await Promise.all([
  read("docs/security-and-data/README.md"),
  read("docs/OPERATIONS.md"),
  read("docs/architecture/README.md"),
  read("packages/domain/src/types.ts"),
  read("packages/db/src/lifecycle-repository.ts"),
  read("packages/db/src/lifecycle-control-repository.ts"),
  read("packages/db/src/publishing-repository.ts"),
  read("packages/db/prisma/schema.prisma"),
  read("apps/worker/src/index.ts"),
  read("packages/integrations/src/google-youtube-oauth.ts"),
  read("packages/integrations/src/s3-asset-storage.ts"),
  read("tests/integration/audit-coverage.test.ts"),
  Promise.all(
    [
      "apps/platform/src/app/api/v1/auth/login/route.ts",
      "apps/platform/src/app/api/v1/auth/logout/route.ts",
      "apps/platform/src/app/api/v1/locale/route.ts",
      "apps/platform/src/server/auth.ts",
      "packages/db/src/repository.ts",
      "packages/db/src/content-repository.ts",
      "packages/db/src/publishing-repository.ts",
      "packages/db/src/lifecycle-repository.ts",
      "packages/db/src/lifecycle-control-repository.ts",
    ].map(read),
  ).then((values) => values.join("\n")),
  read("packages/i18n/src/catalogs/en.ts"),
  read("packages/i18n/src/catalogs/zh-CN.ts"),
  read("packages/db/prisma/migrations/20260822000400_d6_deletion_ledger_hardening/migration.sql"),
  read("packages/db/prisma/migrations/20260823000500_d6_lifecycle_control_plane/migration.sql"),
  read(
    "packages/db/prisma/migrations/20260823000700_d6_async_status_and_db_deadlines/migration.sql",
  ),
  read("packages/db/prisma/migrations/20260823000800_d6_disconnect_retry_wakeup/migration.sql"),
  read("packages/db/prisma/migrations/20260823000900_d6_lifecycle_closure/migration.sql"),
  read("packages/db/prisma/migrations/20260823001200_d6_migration_history_closure/migration.sql"),
  read("packages/db/prisma/migrations/20260823001300_d6_atomic_lifecycle_closure/migration.sql"),
  read("packages/db/prisma/migrations/20260823001700_d6_final_review_closure/migration.sql"),
  read(
    "packages/db/prisma/migrations/20260824001800_d6_retention_dependency_scheduling/migration.sql",
  ),
  read("scripts/test-backup-restore.ts"),
  read("apps/platform/src/app/api/v1/channels/youtube/disconnect/route.ts"),
  read("apps/platform/src/app/api/v1/data-deletion/route.ts"),
  read("apps/platform/src/app/api/v1/account-deletion/route.ts"),
  read(".env.example"),
  read("packages/application/src/config.ts"),
]);

const failures: string[] = [];

function requireMarkers(name: string, source: string, markers: readonly string[]): void {
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${name} missing ${marker}`);
  }
}

for (const [name, value] of [
  ["security/data authority", security],
  ["operations authority", operations],
  ["architecture authority", architecture],
] as const) {
  if (/\bTBD\b/u.test(value)) failures.push(`${name} contains an unresolved TBD`);
}

const tenantAuditCoverage = [
  "member.invited",
  "member.role_changed",
  "channel.connected",
  "channel.reauthorization_required",
  "channel.disconnected",
  "content.created",
  "content.edited",
  "content.submitted",
  "content.approved",
  "content.rejected",
  "publishing.confirmed",
  "platform.publish_cancelled",
  "platform.published",
  "platform.publish_failed",
  "data.deletion_completed",
] as const;
for (const action of tenantAuditCoverage) {
  if (!domain.includes(`"${action}"`)) failures.push(`tenant audit vocabulary missing ${action}`);
  if (!auditImplementation.includes(`"${action}"`))
    failures.push(`tenant audit emission missing ${action}`);
}
requireMarkers("runtime audit integration evidence", auditIntegration, [
  "auditActions",
  "accountActions",
  "Runtime workflow did not emit",
]);
requireMarkers("global account audit control", controlPlaneMigration, [
  'CREATE TABLE "account_audit_events"',
  "record_account_audit_event",
  "account.deletion_requested",
  "account.deletion_completed",
  'CREATE TRIGGER "account_audit_events_append_only"',
]);
if (auditImplementation.includes("assign_pending_identity_audit_events")) {
  failures.push(
    "identity audit is still assigned to a tenant instead of the global account ledger",
  );
}
requireMarkers("Owner lifecycle invariant", auditImplementation, [
  "countEligibleOwners",
  'user: { lifecycleState: "active" }',
]);

requireMarkers("audit schema", schema, [
  "occurredAt",
  "workspaceId",
  "actorUserId",
  "action",
  "targetType",
  "targetId",
  "result",
  "correlationId",
  "metadata",
  "model AccountAuditEvent",
]);
requireMarkers("Node ESM-runnable generated database client", schema, [
  'moduleFormat        = "esm"',
  'importFileExtension = "js"',
]);
requireMarkers("request-side lifecycle repository", lifecycle, [
  "prepareYouTubeDisconnect",
  "beginWorkspaceDataDeletion",
  "LifecycleClaimGuard",
  "assertLifecycleClaim",
  "completeYouTubeDisconnect",
  "completeWorkspaceDataDeletion",
  "recordExpiredAuthorizedDataDeletion",
]);
requireMarkers("lifecycle control repository", lifecycleControl, [
  "claimLifecycleOperation",
  "renewLifecycleOperationClaim",
  "recordLifecycleStep",
  "finishLifecycleOperation",
  "enqueueDueLifecycleOperations",
  "purgeExpiredLifecycleRecords",
  "requestAccountDeletion",
  "completeAccountDeletion",
]);
requireMarkers("lifecycle control-plane migration", controlPlaneMigration, [
  "FOR UPDATE SKIP LOCKED",
  "claim_generation = lifecycle_operations.claim_generation + 1",
  "claimed_until > CURRENT_TIMESTAMP",
  "record_lifecycle_step",
  "complete_account_deletion",
  "pg_advisory_xact_lock",
  "enqueue_due_lifecycle_operations",
  "purge_expired_lifecycle_records",
  "TO jingtang_worker",
  'REVOKE ALL ON "account_audit_events" FROM jingtang_app',
  "REVOKE EXECUTE ON FUNCTION pseudonymize_workspace_audit(UUID) FROM jingtang_app",
]);
requireMarkers(
  "database-time lifecycle deadline and durable status",
  asyncStatusAndDeadlineMigration,
  [
    "lifecycle_operation_deadline_exceeded",
    "CURRENT_TIMESTAMP",
    "read_workspace_data_deletion_status",
    "TO jingtang_worker",
    "TO jingtang_app",
  ],
);
requireMarkers("explicit disconnect retry wake-up", disconnectRetryMigration, [
  "retry_channel_disconnect",
  "next_attempt_at = CURRENT_TIMESTAMP",
  "failure_category = NULL",
  "revoke_failure_category = NULL",
  "TO jingtang_app",
]);
requireMarkers("D6 lifecycle closure migration", lifecycleClosureMigration, [
  "token_key_retirement",
  "requester_reference",
  "data_deletion_requester_reference_guard",
  "request.requester_reference",
  "lifecycle_operations.outcome",
]);
requireMarkers("D6 migration-history closure", migrationHistoryClosure, [
  "DROP FUNCTION IF EXISTS public.pseudonymize_workspace_audit(UUID, TEXT[], BOOLEAN)",
  "REVOKE ALL ON FUNCTION public.pseudonymize_workspace_audit(UUID) FROM PUBLIC",
  "GRANT EXECUTE ON FUNCTION public.pseudonymize_workspace_audit(UUID) TO jingtang_worker",
]);
requireMarkers("D6 atomic lifecycle closure", atomicLifecycleClosure, [
  "prepare_account_identity_deletion",
  "account deletion requires owner transfer or workspace deletion",
  "DELETE FROM public.memberships",
  "TO jingtang_worker",
  "DROP FUNCTION read_account_deletion_material",
]);
requireMarkers("D6 final review closure", finalReviewClosure, [
  "local:v1:%",
  "legacy_local_v1_envelope_retired",
  "reauthorization_required",
  "token_envelope_ciphertext = NULL",
  "operation_generation = operation_generation + 1",
]);
requireMarkers("D6 retention dependency scheduling", retentionDependencyScheduling, [
  "deadline_at > CURRENT_TIMESTAMP",
  "CURRENT_TIMESTAMP + (retry_after_seconds * INTERVAL '1 second')",
  "TO jingtang_worker",
]);
requireMarkers("Authorized Data retirement finalizer", lifecycle, [
  "completeAuthorizedDataRetention",
  "delete_expired_authorization",
  "tokenKeyRetirementPending",
]);
requireMarkers("atomic publishing failure closure", publishing, [
  "recordYouTubeExecutionFailureAndCompleteOutbox",
  "recordClaimedYouTubeExecutionFailureAndCompleteOutbox",
  "execution_terminal",
]);
if (
  (controlPlaneMigration.match(
    /pg_advisory_xact_lock\(hashtextextended\(owned_workspace_id::TEXT, 0\)\)/gu,
  )?.length ?? 0) < 2
) {
  failures.push(
    "account deletion request and completion do not both serialize on the Owner invariant lock",
  );
}

for (const [routeName, route, requestMarker] of [
  ["YouTube disconnect route", disconnectRoute, "prepareYouTubeDisconnect"],
  ["Workspace deletion route", workspaceDeletionRoute, "beginWorkspaceDataDeletion"],
  ["account deletion route", accountDeletionRoute, "requestAccountDeletion"],
] as const) {
  if (!route.includes(requestMarker)) failures.push(`${routeName} does not persist a request`);
  if (/\b(?:complete|resume|fail)(?:YouTube|Workspace|Account)/u.test(route)) {
    failures.push(`${routeName} performs worker-side lifecycle effects in the BFF`);
  }
}

requireMarkers("unified lifecycle worker", worker, [
  "processLifecycleOperation",
  'runLoop("lifecycle_control"',
  "runResilientPollingLoop",
  "Promise.all([",
  "claimGeneration: operation.claimGeneration",
  "deadline_exceeded",
  "state: LifecycleOperationState.RETRY",
  "lifecycleOperationDeadlineExceeded",
  "deadlineExceededNow",
  "TOKEN_KEY_RETIREMENT",
  '"destroy_token_key"',
  "recordClaimedYouTubeExecutionFailure",
  "authorized_data_refresh_superseded",
  "releaseAuthorizedDataRetentionLease",
  'throw new Error("object_deletion_failed")',
  'throw new Error("channel_operations_in_flight")',
  'throw new Error("workspace_operations_in_flight")',
]);
if (worker.includes("Date.now() >= operation.deadlineAt")) {
  failures.push("lifecycle compliance decisions still depend on worker-local wall time");
}
if (
  worker.includes(
    "Date.now() >= operation.deadlineAt.getTime()\n        ? LifecycleOperationState.DEAD",
  )
) {
  failures.push("lifecycle SLA expiry still abandons compliance work as DEAD");
}

requireMarkers("publishing claim and fence", publishing, [
  "claimNextOutboxMessage",
  "FOR UPDATE SKIP LOCKED",
  '"claim_generation" = "claim_generation" + 1',
  "claimOwner",
  "claimGeneration",
  "operation_generation",
  "operation_lease_generation",
  "publish_fence_lost",
  "recordYouTubeExecutionPublishedAndCompleteOutbox",
  '"claim_until" > CURRENT_TIMESTAMP',
]);
requireMarkers("atomic publish acknowledgement", worker, [
  "recordYouTubeExecutionPublishedAndCompleteOutbox",
  "outboxMessageId: message.id",
  "claimGeneration: message.claimGeneration",
]);
requireMarkers("database-clock lifecycle boundaries", lifecycle, [
  "readLifecycleClock",
  "CURRENT_TIMESTAMP + INTERVAL '7 days'",
  '"operation_lease_until" > CURRENT_TIMESTAMP',
]);
requireMarkers(
  "runtime database role split",
  `${environmentExample}\n${applicationConfig}\n${worker}`,
  ["DATABASE_URL", "DATABASE_WORKER_URL", "worker_database_url_required"],
);
requireMarkers(
  "shared local envelope-key store",
  `${environmentExample}\n${applicationConfig}\n${worker}`,
  ["LOCAL_TOKEN_KEY_STORE_PATH", "OAUTH_TOKEN_VAULT_PROVIDER"],
);

requireMarkers("deletion-ledger hardening", deletionHardening, [
  'REVOKE DELETE ON "data_deletion_requests" FROM jingtang_app',
  "protect_data_deletion_request",
  "completed data deletion requests are immutable",
  "restore_delete_workspace_immutable_history",
  "restore_pseudonymize_workspace_audit",
]);
requireMarkers("point-in-time restore drill", restoreDrill, [
  "d6-restore.dump",
  "d6-deletion-ledger.sql",
  "restore_delete_workspace_immutable_history",
  "restore_pseudonymize_workspace_audit",
]);

if (!youtubeProvider.includes("AbortSignal.timeout")) {
  failures.push("Google provider requests do not enforce an explicit timeout");
}
if (youtubeProvider.includes("if (response.status === 400) return")) {
  failures.push("Google revocation treats an unclassified HTTP 400 as success");
}
requireMarkers("object storage timeout control", assetStorage, [
  "#withTimeout",
  "AbortController",
  "requestTimeoutMs",
]);

for (const [name, catalog] of [
  ["English", english],
  ["Simplified Chinese", chinese],
] as const) {
  for (const key of [
    "channel.disconnect.effectThirdParty",
    "channel.result.disconnectFailed",
    "dataSettings.workspace.effectThirdParty",
    "dataSettings.result.completed",
  ]) {
    if (!catalog.includes(`"${key}"`)) failures.push(`${name} catalog missing ${key}`);
  }
}

if (failures.length) throw new Error(`D6 control checks failed:\n${failures.join("\n")}`);
process.stdout.write(
  "D6 control evidence: request-only BFF routes, one durable lifecycle control plane, DB-time leases and generation fences, app/worker role separation, global account audit, publishing fences, post-recovery deletion replay, provider/storage timeouts, and bilingual destructive semantics are present. Runtime behavior is verified by the integration and operations suites.\n",
);
