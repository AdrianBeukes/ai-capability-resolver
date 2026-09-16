/** Test-only verifier. It checks a deterministic marker and never contacts a chain or wallet. */
export function verifySimulatedPayment(requirement: Record<string, unknown>, proof: unknown): boolean {
  if (typeof proof !== "object" || proof === null) return false;
  const candidate = proof as Record<string, unknown>;
  const accepted = candidate.accepted as Record<string, unknown> | undefined;
  const payload = candidate.payload as Record<string, unknown> | undefined;
  const simulation = payload?.simulation as Record<string, unknown> | undefined;
  return candidate.x402Version === 2 && ["scheme", "network", "amount", "asset", "payTo"].every((key) => accepted?.[key] === requirement[key])
    && simulation?.simulation === true && simulation.authorization === `SIMULATED_AUTHORIZATION:${requirement.amount}`;
}
