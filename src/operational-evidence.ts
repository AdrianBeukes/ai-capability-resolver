import { type EvidenceMeasurements, type EvidenceWindow } from "./observation-ledger.js";

/** Caller-owned, protocol-neutral sufficiency criteria; no criterion is a quality threshold. */
export interface OperationalEvidenceRequirement {
  readonly asOf: string;
  readonly requireExternalMode?: boolean;
  readonly minimumExecutionAttempts?: number;
  readonly minimumExecutionSuccesses?: number;
  readonly minimumCanonicalEvaluations?: number;
  readonly minimumCanonicalSuccesses?: number;
  readonly minimumTransportLatencySamples?: number;
  readonly maximumNewestObservationAgeMs?: number;
  readonly maximumOldestObservationAgeMs?: number;
  readonly minimumEvidenceSpanMs?: number;
  readonly requireSingleKnownContractFingerprint?: boolean;
  readonly requireExecutionSuccessEvidence?: boolean;
  readonly requireCanonicalSuccessEvidence?: boolean;
}

export type OperationalEvidenceReasonCode =
  | "NO_OBSERVATIONS" | "EXTERNAL_MODE_REQUIRED" | "INSUFFICIENT_EXECUTION_ATTEMPTS"
  | "INSUFFICIENT_EXECUTION_SUCCESSES" | "INSUFFICIENT_CANONICAL_EVALUATIONS"
  | "INSUFFICIENT_CANONICAL_SUCCESSES" | "INSUFFICIENT_LATENCY_SAMPLES"
  | "EXECUTION_SUCCESS_EVIDENCE_MISSING" | "CANONICAL_SUCCESS_EVIDENCE_MISSING"
  | "NEWEST_OBSERVATION_TOO_OLD" | "OLDEST_OBSERVATION_TOO_OLD" | "EVIDENCE_SPAN_TOO_SHORT"
  | "MIXED_CONTRACTS" | "UNKNOWN_CONTRACT_EVIDENCE" | "NO_KNOWN_CONTRACT"
  | "FUTURE_DATED_OBSERVATION";

export type MissingOperationalEvidence =
  | { readonly kind: "observations"; readonly required: number; readonly observed: number; readonly missing: number }
  | { readonly kind: "execution_attempts" | "execution_successes" | "canonical_evaluations" | "canonical_successes" | "transport_latency_samples"; readonly required: number; readonly observed: number; readonly missing: number }
  | { readonly kind: "execution_success_evidence" | "canonical_success_evidence" | "external_mode" | "single_known_contract"; readonly required: true; readonly observed: boolean }
  | { readonly kind: "newest_observation_age" | "oldest_observation_age"; readonly maximumMs: number; readonly observedMs: number }
  | { readonly kind: "evidence_span"; readonly minimumMs: number; readonly observedMs: number }
  | { readonly kind: "future_dated_observation"; readonly asOf: string; readonly observationIds: readonly string[] };

export interface OperationalEvidenceAssessment {
  readonly status: "sufficient" | "insufficient";
  readonly reasonCodes: readonly OperationalEvidenceReasonCode[];
  readonly missingEvidence: readonly MissingOperationalEvidence[];
  readonly evidenceSummary: Readonly<{
    executionMode: EvidenceWindow["definition"]["executionMode"]; totalObservations: number;
    executionAttempts: number; executionSuccesses: number; executionFailures: number; executionSuccessRatio?: number;
    canonicalEvaluations: number; canonicalSuccesses: number; canonicalFailures: number; canonicalSuccessRatio?: number;
    transportLatencySamples: number; earliestObservedAt?: string; latestObservedAt?: string;
    transportLatency?: Readonly<{ count: number; min: number; max: number; mean: number }>;
    evidenceSpanMs?: number; newestObservationAgeMs?: number; oldestObservationAgeMs?: number;
    contractFingerprints: readonly string[]; unknownContractObservationCount: number; mixedKnownContracts: boolean;
  }>;
  readonly requirementSnapshot: Readonly<OperationalEvidenceRequirement>;
  /** Compact reproducible identity of the selected evidence; raw observations stay in the ledger. */
  readonly evidenceReference: Readonly<{ capabilityId: string; providerId: string; resourceId?: string; asOf: string; evidenceWindow: EvidenceWindow["definition"]; selectedObservationIds: readonly string[] }>;
}

const MAX_VALUE = 2_147_483_647;
const time = (value: string) => Date.parse(value);
function validateRequirement(requirement: OperationalEvidenceRequirement): void {
  if (!requirement || typeof requirement !== "object" || typeof requirement.asOf !== "string" || Number.isNaN(time(requirement.asOf))) throw new Error("asOf must be a valid instant");
  const counts: (keyof OperationalEvidenceRequirement)[] = ["minimumExecutionAttempts", "minimumExecutionSuccesses", "minimumCanonicalEvaluations", "minimumCanonicalSuccesses", "minimumTransportLatencySamples"];
  const durations: (keyof OperationalEvidenceRequirement)[] = ["maximumNewestObservationAgeMs", "maximumOldestObservationAgeMs", "minimumEvidenceSpanMs"];
  for (const key of counts) { const value = requirement[key] as number | undefined; if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > MAX_VALUE)) throw new Error(`${key} must be a bounded non-negative integer`); }
  for (const key of durations) { const value = requirement[key] as number | undefined; if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > MAX_VALUE)) throw new Error(`${key} must be a bounded non-negative finite number`); }
  for (const key of ["requireExternalMode", "requireSingleKnownContractFingerprint", "requireExecutionSuccessEvidence", "requireCanonicalSuccessEvidence"] as const) if (requirement[key] !== undefined && typeof requirement[key] !== "boolean") throw new Error(`${key} must be boolean`);
}

/** Purely assesses selected facts against explicit caller requirements, relative to requirement.asOf. */
export function assessOperationalEvidence(window: EvidenceWindow, measurements: EvidenceMeasurements, requirement: OperationalEvidenceRequirement): OperationalEvidenceAssessment {
  validateRequirement(requirement);
  const reasons: OperationalEvidenceReasonCode[] = [], missing: MissingOperationalEvidence[] = [];
  const asOfMs = time(requirement.asOf);
  const earliest = measurements.earliestObservedAt, latest = measurements.latestObservedAt;
  const futureIds = window.observations.filter(o => time(o.observedAt) > asOfMs).map(o => o.observationId).sort();
  const summary: OperationalEvidenceAssessment["evidenceSummary"] = {
    executionMode: window.definition.executionMode, totalObservations: measurements.totalObservations,
    executionAttempts: measurements.executionAttempts, executionSuccesses: measurements.executionSuccesses, executionFailures: measurements.executionFailures,
    ...(measurements.executionSuccessRatio === undefined ? {} : { executionSuccessRatio: measurements.executionSuccessRatio }),
    canonicalEvaluations: measurements.canonicalEvaluations, canonicalSuccesses: measurements.canonicalSuccesses, canonicalFailures: measurements.canonicalFailures,
    ...(measurements.canonicalSuccessRatio === undefined ? {} : { canonicalSuccessRatio: measurements.canonicalSuccessRatio }),
    transportLatencySamples: measurements.transportLatencySamples,
    ...(measurements.transportLatency === undefined ? {} : { transportLatency: { ...measurements.transportLatency } }),
    ...(earliest === undefined ? {} : { earliestObservedAt: earliest }), ...(latest === undefined ? {} : { latestObservedAt: latest }),
    ...(earliest === undefined || latest === undefined ? {} : { evidenceSpanMs: time(latest) - time(earliest) }),
    ...(latest === undefined || futureIds.length ? {} : { newestObservationAgeMs: asOfMs - time(latest) }),
    ...(earliest === undefined || futureIds.length ? {} : { oldestObservationAgeMs: asOfMs - time(earliest) }),
    contractFingerprints: [...window.contractFingerprints], unknownContractObservationCount: window.unknownContractObservations, mixedKnownContracts: window.mixedContracts,
  };
  const need = (kind: Extract<MissingOperationalEvidence, { required: number }> ["kind"], observed: number, required: number | undefined, reason: OperationalEvidenceReasonCode) => {
    if (required !== undefined && observed < required) { reasons.push(reason); missing.push({ kind, required, observed, missing: required - observed } as MissingOperationalEvidence); }
  };
  if (measurements.totalObservations === 0) { reasons.push("NO_OBSERVATIONS"); missing.push({ kind: "observations", required: 1, observed: 0, missing: 1 }); }
  if (requirement.requireExternalMode && window.definition.executionMode !== "external") { reasons.push("EXTERNAL_MODE_REQUIRED"); missing.push({ kind: "external_mode", required: true, observed: false }); }
  need("execution_attempts", measurements.executionAttempts, requirement.minimumExecutionAttempts, "INSUFFICIENT_EXECUTION_ATTEMPTS");
  need("execution_successes", measurements.executionSuccesses, requirement.minimumExecutionSuccesses, "INSUFFICIENT_EXECUTION_SUCCESSES");
  need("canonical_evaluations", measurements.canonicalEvaluations, requirement.minimumCanonicalEvaluations, "INSUFFICIENT_CANONICAL_EVALUATIONS");
  need("canonical_successes", measurements.canonicalSuccesses, requirement.minimumCanonicalSuccesses, "INSUFFICIENT_CANONICAL_SUCCESSES");
  need("transport_latency_samples", measurements.transportLatencySamples, requirement.minimumTransportLatencySamples, "INSUFFICIENT_LATENCY_SAMPLES");
  if (requirement.requireExecutionSuccessEvidence && measurements.executionSuccesses === 0) { reasons.push("EXECUTION_SUCCESS_EVIDENCE_MISSING"); missing.push({ kind: "execution_success_evidence", required: true, observed: false }); }
  if (requirement.requireCanonicalSuccessEvidence && measurements.canonicalSuccesses === 0) { reasons.push("CANONICAL_SUCCESS_EVIDENCE_MISSING"); missing.push({ kind: "canonical_success_evidence", required: true, observed: false }); }
  if (futureIds.length) { reasons.push("FUTURE_DATED_OBSERVATION"); missing.push({ kind: "future_dated_observation", asOf: requirement.asOf, observationIds: futureIds }); }
  if (!futureIds.length && summary.newestObservationAgeMs !== undefined && requirement.maximumNewestObservationAgeMs !== undefined && summary.newestObservationAgeMs > requirement.maximumNewestObservationAgeMs) { reasons.push("NEWEST_OBSERVATION_TOO_OLD"); missing.push({ kind: "newest_observation_age", maximumMs: requirement.maximumNewestObservationAgeMs, observedMs: summary.newestObservationAgeMs }); }
  if (!futureIds.length && summary.oldestObservationAgeMs !== undefined && requirement.maximumOldestObservationAgeMs !== undefined && summary.oldestObservationAgeMs > requirement.maximumOldestObservationAgeMs) { reasons.push("OLDEST_OBSERVATION_TOO_OLD"); missing.push({ kind: "oldest_observation_age", maximumMs: requirement.maximumOldestObservationAgeMs, observedMs: summary.oldestObservationAgeMs }); }
  if (summary.evidenceSpanMs !== undefined && requirement.minimumEvidenceSpanMs !== undefined && summary.evidenceSpanMs < requirement.minimumEvidenceSpanMs) { reasons.push("EVIDENCE_SPAN_TOO_SHORT"); missing.push({ kind: "evidence_span", minimumMs: requirement.minimumEvidenceSpanMs, observedMs: summary.evidenceSpanMs }); }
  if (requirement.requireSingleKnownContractFingerprint) {
    if (window.mixedContracts) reasons.push("MIXED_CONTRACTS");
    if (window.unknownContractObservations > 0) reasons.push("UNKNOWN_CONTRACT_EVIDENCE");
    if (window.contractFingerprints.length === 0) reasons.push("NO_KNOWN_CONTRACT");
    if (window.mixedContracts || window.unknownContractObservations > 0 || window.contractFingerprints.length === 0) missing.push({ kind: "single_known_contract", required: true, observed: false });
  }
  const evidenceReference = Object.freeze({ capabilityId: window.definition.capabilityId, providerId: window.definition.providerId, ...(window.definition.resourceId === undefined ? {} : { resourceId: window.definition.resourceId }), asOf: requirement.asOf, evidenceWindow: Object.freeze({ ...window.definition }), selectedObservationIds: Object.freeze([...window.selectedObservationIds]) });
  return { status: reasons.length ? "insufficient" : "sufficient", reasonCodes: reasons, missingEvidence: missing, evidenceSummary: summary, requirementSnapshot: { ...requirement }, evidenceReference };
}
