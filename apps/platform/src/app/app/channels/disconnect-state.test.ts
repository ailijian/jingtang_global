import { describe, expect, it } from "vitest";

import { hasDisconnectFailure } from "./disconnect-state";

describe("hasDisconnectFailure", () => {
  it.each([
    null,
    undefined,
    "provider_revoked",
    "provider_revoke_failed_local_erased",
    "local_cleanup_deadline",
  ])("keeps polling while authorized-data cleanup converges for %s", (failureCategory) => {
    expect(hasDisconnectFailure(failureCategory)).toBe(false);
  });

  it.each(["service_unavailable", "tiktok_configuration_required", "token_envelope_invalid"])(
    "surfaces a real disconnect failure for %s",
    (failureCategory) => {
      expect(hasDisconnectFailure(failureCategory)).toBe(true);
    },
  );
});
