/** Transport-independent payment contracts. Implementations may be simulated or real. */
import type { PaymentPayload, PaymentRequirements } from "./x402.js";
export type PaymentRequirement = PaymentRequirements;
export type PaymentProof = PaymentPayload;

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
      x402Version: 2, accepted: requirement,
      payload: { simulation: { authorization: `SIMULATED_AUTHORIZATION:${requirement.amount}`, simulation: true } },
      extensions: {}
    };
  }
}

/** Deterministic counterpart for test providers; not an x402 cryptographic verifier. */
export class SimulatedPaymentVerifier implements PaymentVerifier {
  async verify(requirement: PaymentRequirement, proof: PaymentProof): Promise<PaymentVerification> {
    const valid = proof.x402Version === 2 && proof.accepted.amount === requirement.amount
      && (proof.payload.simulation as Record<string, unknown> | undefined)?.authorization === `SIMULATED_AUTHORIZATION:${requirement.amount}`;
    return { valid, status: valid ? "simulated_settled" : "rejected", simulation: true };
  }
}
