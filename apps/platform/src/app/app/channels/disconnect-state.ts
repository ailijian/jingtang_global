const disconnectProgressOutcomes = new Set([
  "provider_revoked",
  "provider_revoke_failed_local_erased",
  "local_cleanup_deadline",
]);

export function hasDisconnectFailure(failureCategory: string | null | undefined): boolean {
  return Boolean(failureCategory && !disconnectProgressOutcomes.has(failureCategory));
}
