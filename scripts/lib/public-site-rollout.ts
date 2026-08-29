const productionLegalRolloutStates = [
  "authorized_pending_deployment",
  "deployed_verified",
] as const;

export type ProductionLegalRolloutState = (typeof productionLegalRolloutStates)[number];

export function requireCoherentProductionLegalRollout(input: {
  readonly deploymentStatus: string;
  readonly policyRollout: string;
}): ProductionLegalRolloutState {
  if (
    input.deploymentStatus !== input.policyRollout ||
    !productionLegalRolloutStates.includes(input.deploymentStatus as ProductionLegalRolloutState)
  ) {
    throw new Error(
      `Production legal rollout is incoherent: legal_deployment=${input.deploymentStatus}, legal_policy_rollout=${input.policyRollout}`,
    );
  }

  return input.deploymentStatus as ProductionLegalRolloutState;
}
