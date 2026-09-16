export interface SimulatedPaymentRequirement {
  protocol: "x402"; scheme: "exact"; amount: string; asset: "USDC"; network: "base-sepolia";
  providerId: string; requestId: string; simulation: true;
}

export interface SimulatedPaymentProof {
  protocol: "x402"; providerId: string; requestId: string; authorization: string; simulation: true;
}

/** Test-only verifier. It checks a deterministic marker and never contacts a chain or wallet. */
export function verifySimulatedPayment(requirement: SimulatedPaymentRequirement, proof: unknown): boolean {
  if (typeof proof !== "object" || proof === null) return false;
  const candidate = proof as Record<string, unknown>;
  return candidate.protocol === requirement.protocol && candidate.providerId === requirement.providerId
    && candidate.requestId === requirement.requestId && candidate.simulation === true
    && candidate.authorization === `simulated-authorization:${requirement.providerId}:${requirement.requestId}:${requirement.amount}`;
}
