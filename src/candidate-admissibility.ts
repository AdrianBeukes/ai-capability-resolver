/**
 * Phase 12A: pure composition of already-derived qualification and
 * transaction-authorization decisions. No evidence or policy is recalculated.
 */
import type { CapabilityQualificationResult } from "./capability-qualification.js";
import type { TransactionAuthorizationResult } from "./transaction-authorization.js";

export type CandidateAdmissibilityStatus = "NOT_ESTABLISHED" | "NOT_ADMISSIBLE" | "ADMISSIBLE";
export type AdmissibilityGate = "IDENTITY" | "CAPABILITY_QUALIFICATION" | "TRANSACTION_AUTHORIZATION";
export type AdmissibilityGateStatus = "ESTABLISHED_PASS" | "ESTABLISHED_FAIL" | "NOT_ESTABLISHED";
export type CandidateAdmissibilityReasonCode = "INCONSISTENT_CANDIDATE_IDENTITY" | "QUALIFICATION_NOT_ESTABLISHED" | "QUALIFICATION_FAILED" | "AUTHORIZATION_NOT_ESTABLISHED" | "AUTHORIZATION_FAILED" | "ADMISSIBLE";

export interface CandidateAdmissibilityInput {
  readonly qualification: CapabilityQualificationResult;
  readonly authorization: TransactionAuthorizationResult;
}
export interface CandidateIdentity {
  readonly capabilityId: string;
  readonly providerId: string;
  readonly resourceId?: string;
}
export interface AdmissibilityGateAssessment {
  readonly gate: AdmissibilityGate;
  readonly status: AdmissibilityGateStatus;
  readonly upstreamStatus?: string;
  readonly reasonCode: CandidateAdmissibilityReasonCode;
}
export interface CandidateAdmissibilityResult {
  readonly status: CandidateAdmissibilityStatus;
  readonly identity: Readonly<CandidateIdentity>;
  readonly gates: readonly AdmissibilityGateAssessment[];
  readonly missingGates: readonly AdmissibilityGate[];
  readonly failedGates: readonly AdmissibilityGate[];
  readonly provenance: Readonly<{ qualification: CapabilityQualificationResult; authorization: TransactionAuthorizationResult }>;
}

const gateOrder: readonly AdmissibilityGate[] = ["IDENTITY", "CAPABILITY_QUALIFICATION", "TRANSACTION_AUTHORIZATION"];
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
function snap<T>(value: T): T { return freeze(structuredClone(value)); }
function identitiesMatch(q: CapabilityQualificationResult, a: TransactionAuthorizationResult): boolean {
  return q.capabilityId === a.capabilityId && q.providerId === a.providerId && !(q.resourceId !== undefined && a.resourceId !== undefined && q.resourceId !== a.resourceId);
}
function identity(q: CapabilityQualificationResult, a: TransactionAuthorizationResult): CandidateIdentity {
  return { capabilityId:q.capabilityId, providerId:q.providerId, ...(q.resourceId === undefined ? (a.resourceId === undefined ? {} : { resourceId:a.resourceId }) : { resourceId:q.resourceId }) };
}
function gate(gate: AdmissibilityGate, status: AdmissibilityGateStatus, reasonCode: CandidateAdmissibilityReasonCode, upstreamStatus?: string): AdmissibilityGateAssessment {
  return freeze({ gate, status, ...(upstreamStatus === undefined ? {} : { upstreamStatus }), reasonCode });
}

/** Missing establishment takes precedence over established failure, preserving both gate collections. */
export function assessCandidateAdmissibility(input: CandidateAdmissibilityInput): CandidateAdmissibilityResult {
  if (!input?.qualification || !input?.authorization) throw new Error("qualification and authorization are required");
  const q = input.qualification, a = input.authorization;
  if (!q.capabilityId || !q.providerId || !a.capabilityId || !a.providerId) throw new Error("upstream candidate identity is required");
  const coherent = identitiesMatch(q, a);
  const gates: AdmissibilityGateAssessment[] = [
    coherent ? gate("IDENTITY", "ESTABLISHED_PASS", "ADMISSIBLE") : gate("IDENTITY", "NOT_ESTABLISHED", "INCONSISTENT_CANDIDATE_IDENTITY"),
    q.status === "QUALIFIED" ? gate("CAPABILITY_QUALIFICATION", "ESTABLISHED_PASS", "ADMISSIBLE", q.status) : q.status === "NOT_QUALIFIED" ? gate("CAPABILITY_QUALIFICATION", "ESTABLISHED_FAIL", "QUALIFICATION_FAILED", q.status) : gate("CAPABILITY_QUALIFICATION", "NOT_ESTABLISHED", "QUALIFICATION_NOT_ESTABLISHED", q.status),
    a.status === "AUTHORIZED" ? gate("TRANSACTION_AUTHORIZATION", "ESTABLISHED_PASS", "ADMISSIBLE", a.status) : a.status === "NOT_AUTHORIZED" ? gate("TRANSACTION_AUTHORIZATION", "ESTABLISHED_FAIL", "AUTHORIZATION_FAILED", a.status) : gate("TRANSACTION_AUTHORIZATION", "NOT_ESTABLISHED", "AUTHORIZATION_NOT_ESTABLISHED", a.status)
  ];
  const ordered = gateOrder.map(x => gates.find(y => y.gate === x)!);
  const missingGates = ordered.filter(x => x.status === "NOT_ESTABLISHED").map(x => x.gate);
  const failedGates = ordered.filter(x => x.status === "ESTABLISHED_FAIL").map(x => x.gate);
  const status: CandidateAdmissibilityStatus = missingGates.length ? "NOT_ESTABLISHED" : failedGates.length ? "NOT_ADMISSIBLE" : "ADMISSIBLE";
  return freeze({ status, identity:freeze(identity(q,a)), gates:freeze(ordered), missingGates:freeze(missingGates), failedGates:freeze(failedGates), provenance:freeze({qualification:snap(q),authorization:snap(a)}) });
}
