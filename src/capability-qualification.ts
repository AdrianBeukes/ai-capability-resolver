/**
 * Phase 11D: pure caller-defined aggregation of already-derived capability
 * facts. This deliberately does not alter eligibility, routing, or evidence.
 */
import type { CapabilityMatch } from "./classification.js";
import type { SchemaCompatibilityResult, AdapterPlan } from "./schema-compatibility.js";
import type { CapabilityEvidenceState } from "./capability-evidence-state.js";
import type { OperationalEvidenceAssessment } from "./operational-evidence.js";
import type { OperationalAcceptanceAssessment } from "./operational-acceptance.js";

export type QualificationDimension = "SEMANTICS" | "SCHEMA" | "ADAPTER" | "EXTERNAL_CANONICAL_SUCCESS" | "OPERATIONAL_EVIDENCE" | "OPERATIONAL_ACCEPTANCE";
export type QualificationDimensionStatus = "ESTABLISHED_PASS" | "ESTABLISHED_FAIL" | "NOT_ESTABLISHED" | "NOT_REQUIRED";
export type CapabilityQualificationStatus = "NOT_ESTABLISHED" | "NOT_QUALIFIED" | "QUALIFIED";
export type QualificationReasonCode =
  | "NO_QUALIFICATION_REQUIREMENTS" | "IDENTITY_MISMATCH" | "INCONSISTENT_UPSTREAM_EVIDENCE"
  | "SEMANTIC_EVIDENCE_MISSING" | "SEMANTIC_MATCH_REJECTED"
  | "SCHEMA_EVIDENCE_MISSING" | "SCHEMA_INCOMPATIBLE"
  | "ADAPTER_EVIDENCE_MISSING" | "ADAPTER_INCOMPATIBLE"
  | "EXTERNAL_CANONICAL_SUCCESS_MISSING" | "EXTERNAL_CANONICAL_FAILURE_OBSERVED"
  | "OPERATIONAL_EVIDENCE_INSUFFICIENT" | "OPERATIONAL_ACCEPTANCE_NOT_EVALUATED" | "OPERATIONAL_ACCEPTANCE_REJECTED";

export interface CapabilityQualificationRequirement {
  readonly requireSemanticMatch?: boolean;
  readonly requireSchemaCompatibility?: boolean;
  readonly requireAdapterPlan?: boolean;
  readonly requireExternalCanonicalSuccess?: boolean;
  readonly requireOperationalEvidence?: boolean;
  readonly requireOperationalAcceptance?: boolean;
}
export interface CapabilityQualificationInput {
  readonly capabilityId: string;
  readonly providerId: string;
  readonly resourceId?: string;
  readonly semanticClassification?: CapabilityMatch;
  readonly schemaCompatibility?: SchemaCompatibilityResult;
  readonly adapterPlan?: AdapterPlan;
  readonly capabilityEvidenceState?: CapabilityEvidenceState;
  readonly operationalEvidenceAssessment?: OperationalEvidenceAssessment;
  readonly operationalAcceptanceAssessment?: OperationalAcceptanceAssessment;
}
export interface QualificationDimensionAssessment {
  readonly dimension: QualificationDimension;
  readonly status: QualificationDimensionStatus;
  readonly reasonCode?: QualificationReasonCode;
  readonly evidenceReference?: unknown;
}
export interface CapabilityQualificationResult {
  readonly status: CapabilityQualificationStatus;
  readonly capabilityId: string;
  readonly providerId: string;
  readonly resourceId?: string;
  readonly requirementSnapshot: Readonly<CapabilityQualificationRequirement>;
  readonly dimensions: readonly QualificationDimensionAssessment[];
  readonly missingEvidence: readonly QualificationDimension[];
  readonly failedRequirements: readonly QualificationDimension[];
}

const ORDER: readonly QualificationDimension[] = ["SEMANTICS", "SCHEMA", "ADAPTER", "EXTERNAL_CANONICAL_SUCCESS", "OPERATIONAL_EVIDENCE", "OPERATIONAL_ACCEPTANCE"];
const requirementKey: Record<QualificationDimension, keyof CapabilityQualificationRequirement> = {
  SEMANTICS:"requireSemanticMatch", SCHEMA:"requireSchemaCompatibility", ADAPTER:"requireAdapterPlan", EXTERNAL_CANONICAL_SUCCESS:"requireExternalCanonicalSuccess", OPERATIONAL_EVIDENCE:"requireOperationalEvidence", OPERATIONAL_ACCEPTANCE:"requireOperationalAcceptance"
};
/** Shared validation for callers that need to validate a requirement even with no candidates. */
export function validateCapabilityQualificationRequirement(requirements: CapabilityQualificationRequirement): void {
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) throw new Error("qualification requirements must be an object");
  for (const key of Object.values(requirementKey)) if (requirements[key] !== undefined && typeof requirements[key] !== "boolean") throw new Error(`${key} must be boolean`);
  if (!Object.keys(requirements).some(key => (requirements as Record<string, unknown>)[key] === true)) throw new Error("NO_QUALIFICATION_REQUIREMENTS");
}
function same(input: CapabilityQualificationInput, evidence: { capabilityId:string; providerId?:string; resourceId?:string }): boolean {
  return evidence.capabilityId === input.capabilityId && (evidence.providerId === undefined || evidence.providerId === input.providerId) && (input.resourceId === undefined || evidence.resourceId === input.resourceId);
}
function freeze<T>(value:T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
/** Copy only compact derived references so later caller mutation cannot alter a result. */
function snapshot(value: unknown): unknown { return freeze(structuredClone(value)); }
function assessment(dimension: QualificationDimension, status: QualificationDimensionStatus, reasonCode?: QualificationReasonCode, evidenceReference?: unknown): QualificationDimensionAssessment {
  return freeze({ dimension, status, ...(reasonCode ? { reasonCode } : {}), ...(evidenceReference === undefined ? {} : { evidenceReference:snapshot(evidenceReference) }) });
}
function identityFailure(dimension: QualificationDimension): QualificationDimensionAssessment { return assessment(dimension, "NOT_ESTABLISHED", "IDENTITY_MISMATCH"); }

/** Deterministic reduction: missing required evidence takes precedence over established failures. */
export function qualifyCapability(input: CapabilityQualificationInput, requirements: CapabilityQualificationRequirement): CapabilityQualificationResult {
  if (!input || !input.capabilityId || !input.providerId) throw new Error("capabilityId and providerId are required");
  validateCapabilityQualificationRequirement(requirements);
  const dims: QualificationDimensionAssessment[]=[];
  for (const dimension of ORDER) {
    if (!requirements[requirementKey[dimension]]) { dims.push(assessment(dimension,"NOT_REQUIRED")); continue; }
    if (dimension === "SEMANTICS") { const x=input.semanticClassification; const ref=x && {capabilityId:x.capabilityId,resourceId:x.resourceId,status:x.status}; if(!x) dims.push(assessment(dimension,"NOT_ESTABLISHED","SEMANTIC_EVIDENCE_MISSING")); else if(!same(input,x)) dims.push(identityFailure(dimension)); else dims.push(x.status === "matched" ? assessment(dimension,"ESTABLISHED_PASS",undefined,ref) : x.status === "rejected" ? assessment(dimension,"ESTABLISHED_FAIL","SEMANTIC_MATCH_REJECTED",ref) : assessment(dimension,"NOT_ESTABLISHED","SEMANTIC_EVIDENCE_MISSING",ref)); continue; }
    if (dimension === "SCHEMA") { const x=input.schemaCompatibility; const plan=input.adapterPlan ?? x?.adapterPlan; const ref=x && {status:x.status,...(plan ? {adapterPlan:{capabilityId:plan.capabilityId,resourceId:plan.resourceId}}:{})}; if(!x) dims.push(assessment(dimension,"NOT_ESTABLISHED","SCHEMA_EVIDENCE_MISSING")); else if(plan && !same(input,plan)) dims.push(identityFailure(dimension)); else dims.push(x.status === "compatible" ? assessment(dimension,"ESTABLISHED_PASS",undefined,ref) : x.status === "incompatible" ? assessment(dimension,"ESTABLISHED_FAIL","SCHEMA_INCOMPATIBLE",ref) : assessment(dimension,"NOT_ESTABLISHED","SCHEMA_EVIDENCE_MISSING",ref)); continue; }
    if (dimension === "ADAPTER") { const x=input.adapterPlan ?? input.schemaCompatibility?.adapterPlan; if(!x) dims.push(assessment(dimension,"NOT_ESTABLISHED","ADAPTER_EVIDENCE_MISSING")); else if(!same(input,x)) dims.push(identityFailure(dimension)); else dims.push(assessment(dimension,"ESTABLISHED_PASS",undefined,x)); continue; }
    if (dimension === "EXTERNAL_CANONICAL_SUCCESS") { const x=input.capabilityEvidenceState; if(!x) dims.push(assessment(dimension,"NOT_ESTABLISHED","EXTERNAL_CANONICAL_SUCCESS_MISSING")); else if(!same(input,x)) dims.push(identityFailure(dimension)); else if(x.facts.externalCanonicalSuccessObserved && x.facts.externalCanonicalIncompatibleObserved) dims.push(assessment(dimension,"NOT_ESTABLISHED","INCONSISTENT_UPSTREAM_EVIDENCE",x.provenance)); else if(x.facts.externalCanonicalSuccessObserved) dims.push(assessment(dimension,"ESTABLISHED_PASS",undefined,x.provenance)); else if(x.facts.externalCanonicalIncompatibleObserved) dims.push(assessment(dimension,"ESTABLISHED_FAIL","EXTERNAL_CANONICAL_FAILURE_OBSERVED",x.provenance)); else dims.push(assessment(dimension,"NOT_ESTABLISHED","EXTERNAL_CANONICAL_SUCCESS_MISSING",x.provenance)); continue; }
    if (dimension === "OPERATIONAL_EVIDENCE") { const x=input.operationalEvidenceAssessment; if(!x) dims.push(assessment(dimension,"NOT_ESTABLISHED","OPERATIONAL_EVIDENCE_INSUFFICIENT")); else if(!same(input,x.evidenceReference)) dims.push(identityFailure(dimension)); else dims.push(x.status === "sufficient" ? assessment(dimension,"ESTABLISHED_PASS",undefined,x.evidenceReference) : assessment(dimension,"NOT_ESTABLISHED","OPERATIONAL_EVIDENCE_INSUFFICIENT",x.evidenceReference)); continue; }
    const x=input.operationalAcceptanceAssessment, operational=input.operationalEvidenceAssessment;
    if(!operational || operational.status !== "sufficient") dims.push(assessment(dimension,"NOT_ESTABLISHED",x && x.status !== "NOT_EVALUATED" ? "INCONSISTENT_UPSTREAM_EVIDENCE" : "OPERATIONAL_ACCEPTANCE_NOT_EVALUATED",x?.evidenceReference)); else if(!same(input,operational.evidenceReference) || (x && !same(input,x.evidenceReference))) dims.push(identityFailure(dimension)); else if(!x) dims.push(assessment(dimension,"NOT_ESTABLISHED","OPERATIONAL_ACCEPTANCE_NOT_EVALUATED")); else dims.push(x.status === "ACCEPTED" ? assessment(dimension,"ESTABLISHED_PASS",undefined,x.evidenceReference) : x.status === "REJECTED" ? assessment(dimension,"ESTABLISHED_FAIL","OPERATIONAL_ACCEPTANCE_REJECTED",x.evidenceReference) : assessment(dimension,"NOT_ESTABLISHED","OPERATIONAL_ACCEPTANCE_NOT_EVALUATED",x.evidenceReference));
  }
  const missingEvidence=dims.filter(x=>x.status === "NOT_ESTABLISHED").map(x=>x.dimension);
  const failedRequirements=dims.filter(x=>x.status === "ESTABLISHED_FAIL").map(x=>x.dimension);
  return freeze({ status:missingEvidence.length ? "NOT_ESTABLISHED" : failedRequirements.length ? "NOT_QUALIFIED" : "QUALIFIED", capabilityId:input.capabilityId, providerId:input.providerId, ...(input.resourceId === undefined ? {} : {resourceId:input.resourceId}), requirementSnapshot:freeze({...requirements}), dimensions:freeze(dims), missingEvidence:freeze(missingEvidence), failedRequirements:freeze(failedRequirements) });
}
