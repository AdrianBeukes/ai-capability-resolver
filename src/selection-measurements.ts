import type { CandidateAdmissibilityResult } from "./candidate-admissibility.js";
import type { OperationalEvidenceAssessment } from "./operational-evidence.js";

/** Measurement families a later caller-defined selection policy may request. */
export type SelectionMeasurementFamily = "EXECUTION_SUCCESS" | "CANONICAL_SUCCESS" | "TRANSPORT_LATENCY";
export interface SelectionMeasurementProjectionRequest { readonly requiredMeasurements: readonly SelectionMeasurementFamily[]; }
export interface SelectionMeasurementProjectionInput { readonly admissibility: CandidateAdmissibilityResult; readonly operationalEvidence: OperationalEvidenceAssessment; readonly request: SelectionMeasurementProjectionRequest; }
export type SelectionMeasurementProjectionStatus = "ESTABLISHED" | "NOT_ESTABLISHED";
export type SelectionMeasurementUnavailableReason = "EVIDENCE_INSUFFICIENT" | "EXTERNAL_EVIDENCE_REQUIRED" | "EXECUTION_RATIO_UNAVAILABLE" | "CANONICAL_SUCCESS_RATIO_UNAVAILABLE" | "TRANSPORT_LATENCY_UNAVAILABLE";
export interface UnavailableSelectionMeasurement { readonly measurement: SelectionMeasurementFamily; readonly reasonCodes: readonly SelectionMeasurementUnavailableReason[]; }
export interface SelectionEvidenceContext {
  readonly executionMode: "external" | "simulated"; readonly observationCount: number; readonly asOf: string;
  readonly fromInclusive?: string; readonly toExclusive?: string; readonly oldestAgeMs?: number; readonly newestAgeMs?: number; readonly spanMs?: number;
  readonly contractState: "SINGLE_KNOWN" | "MIXED_KNOWN" | "UNKNOWN" | "NONE_KNOWN"; readonly contractFingerprint?: string;
  readonly evidenceSufficiency: "SUFFICIENT" | "INSUFFICIENT";
}
export interface SelectionMeasurementProjection {
  readonly status: SelectionMeasurementProjectionStatus; readonly identity: Readonly<{ capabilityId: string; providerId: string; resourceId?: string }>;
  readonly request: Readonly<SelectionMeasurementProjectionRequest>; readonly evidenceContext: Readonly<SelectionEvidenceContext>;
  readonly execution?: Readonly<{ attemptCount: number; successCount: number; failureCount: number; successRatio: number }>;
  readonly canonicalOutput?: Readonly<{ evaluationCount: number; successCount: number; failureCount: number; successRatio: number }>;
  readonly transportLatency?: Readonly<{ sampleCount: number; minimumMs: number; maximumMs: number; meanMs: number }>;
  readonly unavailableMeasurements: readonly UnavailableSelectionMeasurement[]; readonly reasonCodes: readonly string[];
  /** Compact upstream evidence metadata only; this intentionally contains no ledger observations. */
  readonly provenance: Readonly<{ operationalEvidenceReasonCodes: readonly string[]; missingEvidence: OperationalEvidenceAssessment["missingEvidence"]; evidenceReference: OperationalEvidenceAssessment["evidenceReference"] }>;
}

const order: readonly SelectionMeasurementFamily[] = ["EXECUTION_SUCCESS", "CANONICAL_SUCCESS", "TRANSPORT_LATENCY"];
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
function snapshot<T>(value: T): T { return freeze(structuredClone(value)); }
function sameIdentity(a: { capabilityId: string; providerId: string; resourceId?: string }, b: { capabilityId: string; providerId: string; resourceId?: string }): boolean {
  return a.capabilityId === b.capabilityId && a.providerId === b.providerId && !(a.resourceId !== undefined && b.resourceId !== undefined && a.resourceId !== b.resourceId);
}
function contractContext(e: OperationalEvidenceAssessment): Pick<SelectionEvidenceContext, "contractState" | "contractFingerprint"> {
  const s=e.evidenceSummary;
  if (s.mixedKnownContracts) return {contractState:"MIXED_KNOWN"};
  if (s.unknownContractObservationCount > 0) return {contractState:"UNKNOWN"};
  if (s.contractFingerprints.length === 1) return {contractState:"SINGLE_KNOWN",contractFingerprint:s.contractFingerprints[0]!};
  return {contractState:"NONE_KNOWN"};
}

/** Purely projects existing Phase 11B facts for an already ADMISSIBLE candidate; it neither accepts nor selects. */
export function projectSelectionMeasurements(input: SelectionMeasurementProjectionInput): SelectionMeasurementProjection {
  if (!input?.admissibility || !input.operationalEvidence || !input.request) throw new Error("admissibility, operationalEvidence, and request are required");
  if (input.admissibility.status !== "ADMISSIBLE") throw new Error("selection measurement projection requires an ADMISSIBLE candidate");
  const evidence=input.operationalEvidence, ref=evidence.evidenceReference;
  if (!sameIdentity(ref, ref.evidenceWindow) || evidence.evidenceSummary.executionMode !== ref.evidenceWindow.executionMode || evidence.requirementSnapshot.asOf !== ref.asOf) throw new Error("operational evidence assessment provenance is inconsistent");
  if (!sameIdentity(input.admissibility.identity, ref)) throw new Error("admissibility and operational evidence identities are inconsistent");
  if (!Array.isArray(input.request.requiredMeasurements) || input.request.requiredMeasurements.length===0) throw new Error("at least one required measurement is required");
  for (const m of input.request.requiredMeasurements) if (!order.includes(m)) throw new Error("unknown selection measurement family");
  const requested=order.filter(m=>input.request.requiredMeasurements.includes(m));
  const summary=evidence.evidenceSummary;
  const context: SelectionEvidenceContext={executionMode:summary.executionMode,observationCount:summary.totalObservations,asOf:ref.asOf,
    ...(ref.evidenceWindow.fromInclusive===undefined?{}:{fromInclusive:ref.evidenceWindow.fromInclusive}),...(ref.evidenceWindow.toExclusive===undefined?{}:{toExclusive:ref.evidenceWindow.toExclusive}),
    ...(summary.oldestObservationAgeMs===undefined?{}:{oldestAgeMs:summary.oldestObservationAgeMs}),...(summary.newestObservationAgeMs===undefined?{}:{newestAgeMs:summary.newestObservationAgeMs}),...(summary.evidenceSpanMs===undefined?{}:{spanMs:summary.evidenceSpanMs}),
    ...contractContext(evidence),evidenceSufficiency:evidence.status==="sufficient"?"SUFFICIENT":"INSUFFICIENT"};
  const base: SelectionMeasurementUnavailableReason[]=[];
  if (evidence.status !== "sufficient") base.push("EVIDENCE_INSUFFICIENT");
  if (summary.executionMode !== "external") base.push("EXTERNAL_EVIDENCE_REQUIRED");
  const unavailable: UnavailableSelectionMeasurement[]=[];
  const result: { execution?: { attemptCount: number; successCount: number; failureCount: number; successRatio: number }; canonicalOutput?: { evaluationCount: number; successCount: number; failureCount: number; successRatio: number }; transportLatency?: { sampleCount: number; minimumMs: number; maximumMs: number; meanMs: number } }={};
  for (const measurement of requested) {
    let reasons=[...base];
    if (measurement==="EXECUTION_SUCCESS") {
      if (summary.executionAttempts<=0 || summary.executionSuccessRatio===undefined) reasons.push("EXECUTION_RATIO_UNAVAILABLE");
      else result.execution={attemptCount:summary.executionAttempts,successCount:summary.executionSuccesses,failureCount:summary.executionFailures,successRatio:summary.executionSuccessRatio};
    } else if (measurement==="CANONICAL_SUCCESS") {
      if (summary.canonicalEvaluations<=0 || summary.canonicalSuccessRatio===undefined) reasons.push("CANONICAL_SUCCESS_RATIO_UNAVAILABLE");
      else result.canonicalOutput={evaluationCount:summary.canonicalEvaluations,successCount:summary.canonicalSuccesses,failureCount:summary.canonicalFailures,successRatio:summary.canonicalSuccessRatio};
    } else if (summary.transportLatencySamples<=0 || summary.transportLatency===undefined) reasons.push("TRANSPORT_LATENCY_UNAVAILABLE");
    else result.transportLatency={sampleCount:summary.transportLatencySamples,minimumMs:summary.transportLatency.min,maximumMs:summary.transportLatency.max,meanMs:summary.transportLatency.mean};
    if (reasons.length) unavailable.push({measurement,reasonCodes:[...new Set(reasons)]});
  }
  return snapshot({status:unavailable.length?"NOT_ESTABLISHED":"ESTABLISHED",identity:{...input.admissibility.identity},request:{requiredMeasurements:requested},evidenceContext:context,...result,unavailableMeasurements:unavailable,reasonCodes:[...new Set(unavailable.flatMap(x=>x.reasonCodes))],provenance:{operationalEvidenceReasonCodes:[...evidence.reasonCodes],missingEvidence:evidence.missingEvidence,evidenceReference:ref}} as SelectionMeasurementProjection);
}
