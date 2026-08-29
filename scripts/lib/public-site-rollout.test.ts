import { describe, expect, it } from "vitest";

import { requireCoherentProductionLegalRollout } from "./public-site-rollout.js";

describe("requireCoherentProductionLegalRollout", () => {
  it.each(["authorized_pending_deployment", "deployed_verified"] as const)(
    "accepts the coherent %s stage",
    (state) => {
      expect(
        requireCoherentProductionLegalRollout({
          deploymentStatus: state,
          policyRollout: state,
        }),
      ).toBe(state);
    },
  );

  it("rejects the pre-authorization pending state", () => {
    expect(() =>
      requireCoherentProductionLegalRollout({
        deploymentStatus: "approved_pending_production_change_authorization",
        policyRollout: "pending_production_change_authorization",
      }),
    ).toThrow("Production legal rollout is incoherent");
  });

  it("rejects a partially recorded deployment", () => {
    expect(() =>
      requireCoherentProductionLegalRollout({
        deploymentStatus: "deployed_verified",
        policyRollout: "authorized_pending_deployment",
      }),
    ).toThrow("Production legal rollout is incoherent");
  });

  it("rejects unknown matching states", () => {
    expect(() =>
      requireCoherentProductionLegalRollout({
        deploymentStatus: "unknown",
        policyRollout: "unknown",
      }),
    ).toThrow("Production legal rollout is incoherent");
  });
});
