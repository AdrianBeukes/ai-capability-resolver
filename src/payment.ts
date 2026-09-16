/** Transport-independent payment contracts. Implementations may be simulated or real. */
export interface PaymentRequirement {
  protocol: "x402";
  scheme: "exact";
  amount: string;
  asset: "USDC";
  network: "base-sepolia";
  providerId: string;
  requestId: string;
  simulation: boolean;
}

export interface PaymentProof {
  protocol: "x402";
  providerId: string;
  requestId: string;
  authorization: string;
  simulation: true;
}

export interface PaymentVerification {
  valid: boolean;
  status: "simulated_settled" | "rejected";
  simulation: boolean;
}

export interface PaymentClient {
  pay(requirement: PaymentRequirement): Promise<PaymentProof>;
}

export interface PaymentVerifier {
  verify(requirement: PaymentRequirement, proof: PaymentProof): Promise<PaymentVerification>;
}

/** Deterministic test-only payment client. It has no wallet, keys, or network access. */
export class SimulatedPaymentClient implements PaymentClient {
  async pay(requirement: PaymentRequirement): Promise<PaymentProof> {
    return {
      protocol: requirement.protocol,
      providerId: requirement.providerId,
      requestId: requirement.requestId,
      authorization: `simulated-authorization:${requirement.providerId}:${requirement.requestId}:${requirement.amount}`,
      simulation: true
    };
  }
}

/** Deterministic counterpart for test providers; not an x402 cryptographic verifier. */
export class SimulatedPaymentVerifier implements PaymentVerifier {
  async verify(requirement: PaymentRequirement, proof: PaymentProof): Promise<PaymentVerification> {
    const expected = `simulated-authorization:${requirement.providerId}:${requirement.requestId}:${requirement.amount}`;
    const valid = proof.simulation === true && proof.protocol === requirement.protocol
      && proof.providerId === requirement.providerId && proof.requestId === requirement.requestId
      && proof.authorization === expected;
    return { valid, status: valid ? "simulated_settled" : "rejected", simulation: true };
  }
}
