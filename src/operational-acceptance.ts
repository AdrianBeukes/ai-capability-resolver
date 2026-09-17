import type { OperationalEvidenceAssessment } from "./operational-evidence.js";

/** Caller-owned performance requirements. They are neither ratings nor routing policy. */
export interface OperationalAcceptanceCriteria {
  readonly minimumExecutionSuccessRatio?: number;
  readonly minimumCanonicalSuccessRatio?: number;
  readonly maximumMeanTransportLatencyMs?: number;
  readonly maximumMaxTransportLatencyMs?: number;
}

export type OperationalAcceptanceStatus = "NOT_EVALUATED" | "ACCEPTED" | "REJECTED";
export type OperationalAcceptanceReasonCode =
  | "EVIDENCE_INSUFFICIENT" | "NO_ACCEPTANCE_CRITERIA"
  | "EXECUTION_SUCCESS_RATIO_BELOW_MINIMUM" | "CANONICAL_SUCCESS_RATIO_BELOW_MINIMUM"
  | "MEAN_TRANSPORT_LATENCY_ABOVE_MAXIMUM" | "MAX_TRANSPORT_LATENCY_ABOVE_MAXIMUM"
  | "EXECUTION_SUCCESS_RATIO_UNAVAILABLE" | "CANONICAL_SUCCESS_RATIO_UNAVAILABLE" | "TRANSPORT_LATENCY_UNAVAILABLE";
export type OperationalAcceptanceCriterion = "execution_success_ratio" | "canonical_success_ratio" | "mean_transport_latency" | "max_transport_latency";
export interface CriterionAssessment {
  readonly criterion: OperationalAcceptanceCriterion;
  readonly status: "passed" | "failed" | "unavailable";
  readonly observed?: number;
  readonly required: number;
  readonly comparator: "gte" | "lte";
  readonly reasonCode?: OperationalAcceptanceReasonCode;
}
export interface OperationalAcceptanceAssessment {
  readonly status: OperationalAcceptanceStatus;
  readonly reasonCodes: readonly OperationalAcceptanceReasonCode[];
  readonly criteriaSnapshot: Readonly<OperationalAcceptanceCriteria>;
  readonly criterionResults: readonly CriterionAssessment[];
  readonly evidenceReference: OperationalEvidenceAssessment["evidenceReference"];
}

const MAX_VALUE = 2_147_483_647;
const ordered = [
  ["minimumExecutionSuccessRatio", "execution_success_ratio", "gte", "EXECUTION_SUCCESS_RATIO_BELOW_MINIMUM", "EXECUTION_SUCCESS_RATIO_UNAVAILABLE"],
  ["minimumCanonicalSuccessRatio", "canonical_success_ratio", "gte", "CANONICAL_SUCCESS_RATIO_BELOW_MINIMUM", "CANONICAL_SUCCESS_RATIO_UNAVAILABLE"],
  ["maximumMeanTransportLatencyMs", "mean_transport_latency", "lte", "MEAN_TRANSPORT_LATENCY_ABOVE_MAXIMUM", "TRANSPORT_LATENCY_UNAVAILABLE"],
  ["maximumMaxTransportLatencyMs", "max_transport_latency", "lte", "MAX_TRANSPORT_LATENCY_ABOVE_MAXIMUM", "TRANSPORT_LATENCY_UNAVAILABLE"],
] as const;
function validate(criteria: OperationalAcceptanceCriteria): void {
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) throw new Error("criteria must be an object");
  for (const key of ["minimumExecutionSuccessRatio", "minimumCanonicalSuccessRatio"] as const) { const value=criteria[key]; if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error(`${key} must be a finite ratio from 0 through 1`); }
  for (const key of ["maximumMeanTransportLatencyMs", "maximumMaxTransportLatencyMs"] as const) { const value=criteria[key]; if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > MAX_VALUE)) throw new Error(`${key} must be a bounded non-negative finite number`); }
}
/** Pure caller-specific interpretation of a Phase 11B sufficient evidence assessment. */
export function assessOperationalAcceptance(input: { readonly evidenceAssessment: OperationalEvidenceAssessment; readonly criteria: OperationalAcceptanceCriteria }): OperationalAcceptanceAssessment {
  if (!input || !input.evidenceAssessment) throw new Error("evidenceAssessment is required");
  validate(input.criteria);
  const criteriaSnapshot={ ...input.criteria }, base={ criteriaSnapshot, evidenceReference: input.evidenceAssessment.evidenceReference };
  if (input.evidenceAssessment.status !== "sufficient") return { status:"NOT_EVALUATED", reasonCodes:["EVIDENCE_INSUFFICIENT"], criterionResults:[], ...base };
  const configured=ordered.filter(([key]) => criteriaSnapshot[key] !== undefined);
  if (!configured.length) return { status:"NOT_EVALUATED", reasonCodes:["NO_ACCEPTANCE_CRITERIA"], criterionResults:[], ...base };
  const summary=input.evidenceAssessment.evidenceSummary;
  const results: CriterionAssessment[] = configured.map(([key, criterion, comparator, failedCode, unavailableCode]) => {
    const required=criteriaSnapshot[key]!;
    const observed = criterion === "execution_success_ratio" ? summary.executionSuccessRatio : criterion === "canonical_success_ratio" ? summary.canonicalSuccessRatio : criterion === "mean_transport_latency" ? summary.transportLatency?.mean : summary.transportLatency?.max;
    if (observed === undefined) return { criterion, status:"unavailable", required, comparator, reasonCode:unavailableCode };
    const passed=comparator === "gte" ? observed >= required : observed <= required;
    return { criterion, status:passed ? "passed" : "failed", observed, required, comparator, ...(passed ? {} : { reasonCode:failedCode }) };
  });
  const reasonCodes=results.flatMap(r => r.reasonCode ? [r.reasonCode] : []);
  return { status: results.some(r=>r.status==="unavailable") ? "NOT_EVALUATED" : results.some(r=>r.status==="failed") ? "REJECTED" : "ACCEPTED", reasonCodes, criterionResults:results, ...base };
}
