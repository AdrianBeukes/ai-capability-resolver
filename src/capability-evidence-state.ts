/**
 * Phase 10E: a pure, protocol-neutral boundary between immutable evidence and
 * action eligibility.  It deliberately has no resolver, network, payment, or
 * provider dependencies.
 */
import type { MatchStatus } from "./classification.js";
import type { SchemaCompatibilityStatus } from "./schema-compatibility.js";
import type { ObservedCapabilityEvidence, ExecutionMode } from "./observed-capability.js";
import type { ObservedStatus, AdvertisedObservedComparison } from "./x402-quote-verification.js";

export type EvidenceState = "unknown" | "discovered" | "rejected" | "possible" | "matched" | "incomplete" | "complete" | "compatible" | "reachable" | "malformed" | "not_applicable" | "advertised" | "quote_observed" | "quote_matched" | "quote_mismatched";
export type ExecutionState = "unobserved" | "simulated_success" | "simulated_failure" | "external_success" | "external_failure" | "mixed";
export type CanonicalOutputState = "unobserved" | "simulated_success" | "simulated_incompatible" | "external_success" | "external_incompatible" | "mixed";
export type EligibilityTarget = "discovery" | "inspection" | "verification" | "routing";
export type MissingEvidence = "discovery" | "established_semantics" | "safe_invocation" | "request_contract" | "output_contract" | "transport" | "payment_understanding" | "external_capability_success" | "external_canonical_output_success" | "reliability";
export type EligibilityReasonCode =
 | "ELIGIBLE_DISCOVERED" | "ELIGIBLE_INSPECTION" | "ELIGIBLE_VERIFICATION" | "ELIGIBLE_ROUTING"
 | "DISCOVERY_UNKNOWN" | "SEMANTICS_REJECTED" | "SEMANTICS_ONLY_POSSIBLE" | "SEMANTICS_UNKNOWN"
 | "INVOCATION_UNKNOWN" | "INVOCATION_INCOMPLETE" | "REQUEST_CONTRACT_UNKNOWN" | "REQUEST_CONTRACT_INCOMPLETE"
 | "OUTPUT_CONTRACT_UNKNOWN" | "OUTPUT_CONTRACT_INCOMPLETE" | "UNSAFE_ENDPOINT" | "TRANSPORT_UNOBSERVED" | "TRANSPORT_MALFORMED"
 | "PAYMENT_QUOTE_UNOBSERVED" | "PAYMENT_QUOTE_MISMATCH" | "PAYMENT_CHALLENGE_MALFORMED"
 | "EXECUTION_UNOBSERVED" | "ONLY_SIMULATED_EXECUTION_OBSERVED" | "EXTERNAL_EXECUTION_FAILED"
 | "CANONICAL_OUTPUT_UNOBSERVED" | "ONLY_SIMULATED_CANONICAL_SUCCESS" | "EXTERNAL_CANONICAL_OUTPUT_INCOMPATIBLE"
 | "EXTERNAL_OBSERVATIONS_CONFLICT" | "RELIABILITY_UNESTABLISHED" | "SIDE_EFFECT_RISK";

export interface CapabilityEvidenceInput {
 capabilityId: string; providerId: string; resourceId?: string;
 /** A normalized discovery record has already passed its source's validation. */
 discovered?: boolean;
 semantics?: MatchStatus;
 /** Compatibility represents advertised schema/AdapterPlan evidence only. */
 requestContract?: SchemaCompatibilityStatus;
 outputContract?: SchemaCompatibilityStatus;
 invocation?: { complete: boolean; endpointSafety?: "safe" | "unsafe" | "unknown"; inspectionRequiresNetwork?: boolean; readOnly?: boolean };
 payment?: { applicable: boolean; advertised?: boolean; observedStatus?: ObservedStatus; comparison?: AdvertisedObservedComparison };
 observations?: readonly ObservedCapabilityEvidence[];
}
export interface CapabilityEvidenceState {
 capabilityId: string; providerId: string; resourceId?: string;
 discovery: "unknown" | "discovered";
 semantics: "unknown" | MatchStatus;
 invocation: "unknown" | "incomplete" | "complete";
 requestContract: "unknown" | "incomplete" | "compatible";
 outputContract: "unknown" | "incomplete" | "compatible";
 transport: "unknown" | "reachable" | "rejected" | "malformed";
 payment: "not_applicable" | "unknown" | "advertised" | "quote_observed" | "quote_matched" | "quote_mismatched" | "malformed";
 execution: ExecutionState;
 canonicalOutput: CanonicalOutputState;
 reliability: "unknown";
 facts: { simulatedExecutionSuccessObserved: boolean; simulatedExecutionFailureObserved: boolean; externalExecutionSuccessObserved: boolean; externalExecutionFailureObserved: boolean; simulatedCanonicalSuccessObserved: boolean; simulatedCanonicalIncompatibleObserved: boolean; externalCanonicalSuccessObserved: boolean; externalCanonicalIncompatibleObserved: boolean };
 provenance: { observedCount: number; observedAt: readonly string[]; latestObservedAt?: string };
}
export interface EligibilityDecision { target: EligibilityTarget; eligible: boolean; reasonCodes: readonly EligibilityReasonCode[]; missingEvidence: readonly MissingEvidence[]; evidenceSnapshot: CapabilityEvidenceState; }

const contract = (value: SchemaCompatibilityStatus | undefined): "unknown" | "incomplete" | "compatible" => value === "compatible" ? "compatible" : value === undefined || value === "unknown" ? "unknown" : "incomplete";
function aggregate(success: boolean, failure: boolean, simulatedSuccess: boolean, simulatedFailure: boolean, external = false): ExecutionState {
 if (success && failure) return "mixed";
 if (external && success) return "external_success"; if (external && failure) return "external_failure";
 if (simulatedSuccess) return "simulated_success"; if (simulatedFailure) return "simulated_failure"; return "unobserved";
}
function canonicalAggregate(facts: CapabilityEvidenceState["facts"]): CanonicalOutputState {
 const success=facts.externalCanonicalSuccessObserved||facts.simulatedCanonicalSuccessObserved;
 const incompatible=facts.externalCanonicalIncompatibleObserved||facts.simulatedCanonicalIncompatibleObserved;
 if(success&&incompatible)return "mixed";
 if(facts.externalCanonicalSuccessObserved)return "external_success";
 if(facts.externalCanonicalIncompatibleObserved)return "external_incompatible";
 if(facts.simulatedCanonicalSuccessObserved)return "simulated_success";
 if(facts.simulatedCanonicalIncompatibleObserved)return "simulated_incompatible";
 return "unobserved";
}
function payment(input: CapabilityEvidenceInput): CapabilityEvidenceState["payment"] {
 const p=input.payment; if (!p || !p.applicable) return "not_applicable";
 if (p.observedStatus === "malformed_payment_challenge") return "malformed";
 if (p.comparison && [p.comparison.scheme,p.comparison.network,p.comparison.asset,p.comparison.amount,p.comparison.payTo,p.comparison.timeout].includes("mismatch")) return "quote_mismatched";
 if (p.observedStatus === "payment_required" && p.comparison?.matchedAdvertisedOption !== undefined) return "quote_matched";
 if (p.observedStatus === "payment_required") return "quote_observed";
 return p.advertised ? "advertised" : "unknown";
}
export function deriveCapabilityEvidenceState(input: CapabilityEvidenceInput): CapabilityEvidenceState {
 const observations=input.observations ?? [];
 const has=(mode:ExecutionMode, predicate:(o:ObservedCapabilityEvidence)=>boolean)=>observations.some(o=>o.executionMode===mode && predicate(o));
 const facts={
  simulatedExecutionSuccessObserved:has("simulated",o=>o.outcome!=="execution_failed"), simulatedExecutionFailureObserved:has("simulated",o=>o.outcome==="execution_failed"),
  externalExecutionSuccessObserved:has("external",o=>o.outcome!=="execution_failed"), externalExecutionFailureObserved:has("external",o=>o.outcome==="execution_failed"),
  simulatedCanonicalSuccessObserved:has("simulated",o=>o.outcome==="canonical_success"), simulatedCanonicalIncompatibleObserved:has("simulated",o=>o.outcome!=="execution_failed" && o.outcome!=="canonical_success" && o.canonicalValidation.status==="invalid"),
  externalCanonicalSuccessObserved:has("external",o=>o.outcome==="canonical_success"), externalCanonicalIncompatibleObserved:has("external",o=>o.outcome!=="execution_failed" && o.outcome!=="canonical_success" && o.canonicalValidation.status==="invalid")
 };
 const observedAt=[...new Set(observations.map(o=>o.observedAt))].sort();
 const p=payment(input), transport=input.invocation?.endpointSafety === "unsafe" ? "rejected" : p === "malformed" ? "malformed" : input.payment?.observedStatus === "reachable_without_payment" || input.payment?.observedStatus === "payment_required" ? "reachable" : "unknown";
 return { capabilityId:input.capabilityId,providerId:input.providerId,...(input.resourceId?{resourceId:input.resourceId}:{}), discovery:input.discovered?"discovered":"unknown", semantics:input.semantics??"unknown", invocation:!input.invocation?"unknown":input.invocation.complete?"complete":"incomplete", requestContract:contract(input.requestContract), outputContract:contract(input.outputContract), transport, payment:p,
  execution:aggregate(facts.externalExecutionSuccessObserved||facts.simulatedExecutionSuccessObserved,facts.externalExecutionFailureObserved||facts.simulatedExecutionFailureObserved,facts.simulatedExecutionSuccessObserved,facts.simulatedExecutionFailureObserved,facts.externalExecutionSuccessObserved||facts.externalExecutionFailureObserved),
  canonicalOutput:canonicalAggregate(facts),
  reliability:"unknown", facts, provenance:{observedCount:observations.length,observedAt,...(observedAt.length?{latestObservedAt:observedAt.at(-1)}:{})} };
}
function add(a:EligibilityReasonCode[], m:MissingEvidence[], code:EligibilityReasonCode, missing?:MissingEvidence){a.push(code);if(missing)m.push(missing);}
function base(state:CapabilityEvidenceState, reasons:EligibilityReasonCode[], missing:MissingEvidence[], target:EligibilityTarget) {
 if(state.discovery!=="discovered") add(reasons,missing,"DISCOVERY_UNKNOWN","discovery");
 if(target!=="discovery") { if(state.invocation==="unknown")add(reasons,missing,"INVOCATION_UNKNOWN","safe_invocation"); if(state.invocation==="incomplete")add(reasons,missing,"INVOCATION_INCOMPLETE","safe_invocation"); }
}
export function decideEligibility(state: CapabilityEvidenceState, target: EligibilityTarget, options:{inspectionRequiresNetwork?:boolean; readOnly?:boolean}={}): EligibilityDecision {
 const reasons:EligibilityReasonCode[]=[], missing:MissingEvidence[]=[]; base(state,reasons,missing,target);
 if(target==="discovery") { if(!reasons.length)reasons.push("ELIGIBLE_DISCOVERED"); return {target,eligible:!reasons.some(x=>x==="DISCOVERY_UNKNOWN"),reasonCodes:reasons,missingEvidence:missing,evidenceSnapshot:state}; }
 const needsNetwork=options.inspectionRequiresNetwork ?? false;
 if(target==="inspection") { if(needsNetwork&&state.transport!=="reachable") add(reasons,missing,state.transport==="malformed"?"TRANSPORT_MALFORMED":"UNSAFE_ENDPOINT","transport"); if(!reasons.length)reasons.push("ELIGIBLE_INSPECTION"); return {target,eligible:!reasons.length||reasons[0]==="ELIGIBLE_INSPECTION",reasonCodes:reasons,missingEvidence:missing,evidenceSnapshot:state}; }
 if(state.semantics==="rejected")add(reasons,missing,"SEMANTICS_REJECTED"); else if(state.semantics==="unknown")add(reasons,missing,"SEMANTICS_UNKNOWN");
 if(state.requestContract==="unknown")add(reasons,missing,"REQUEST_CONTRACT_UNKNOWN","request_contract"); if(state.requestContract==="incomplete")add(reasons,missing,"REQUEST_CONTRACT_INCOMPLETE","request_contract");
 if(state.transport==="rejected")add(reasons,missing,"UNSAFE_ENDPOINT","transport"); if(state.transport==="malformed")add(reasons,missing,"TRANSPORT_MALFORMED","transport");
 if(state.payment==="malformed")add(reasons,missing,"PAYMENT_CHALLENGE_MALFORMED","payment_understanding"); if(state.payment==="quote_mismatched")add(reasons,missing,"PAYMENT_QUOTE_MISMATCH","payment_understanding");
 if(options.readOnly===false)add(reasons,missing,"SIDE_EFFECT_RISK");
 if(target==="verification") { if(!reasons.length)reasons.push("ELIGIBLE_VERIFICATION"); return {target,eligible:reasons[0]==="ELIGIBLE_VERIFICATION",reasonCodes:reasons,missingEvidence:missing,evidenceSnapshot:state}; }
 if(state.semantics==="possible")add(reasons,missing,"SEMANTICS_ONLY_POSSIBLE","established_semantics");
 if(state.outputContract==="unknown")add(reasons,missing,"OUTPUT_CONTRACT_UNKNOWN","output_contract"); if(state.outputContract==="incomplete")add(reasons,missing,"OUTPUT_CONTRACT_INCOMPLETE","output_contract");
 if(!state.facts.externalExecutionSuccessObserved) add(reasons,missing,state.facts.simulatedExecutionSuccessObserved?"ONLY_SIMULATED_EXECUTION_OBSERVED":"EXECUTION_UNOBSERVED","external_capability_success");
 if(state.facts.externalExecutionFailureObserved) add(reasons,missing,"EXTERNAL_EXECUTION_FAILED");
 if(!state.facts.externalCanonicalSuccessObserved) add(reasons,missing,state.facts.simulatedCanonicalSuccessObserved?"ONLY_SIMULATED_CANONICAL_SUCCESS":"CANONICAL_OUTPUT_UNOBSERVED","external_canonical_output_success");
 if(state.facts.externalCanonicalIncompatibleObserved)add(reasons,missing,"EXTERNAL_CANONICAL_OUTPUT_INCOMPATIBLE");
 if(state.facts.externalExecutionSuccessObserved&&state.facts.externalExecutionFailureObserved)add(reasons,missing,"EXTERNAL_OBSERVATIONS_CONFLICT");
 add(reasons,missing,"RELIABILITY_UNESTABLISHED","reliability");
 return {target,eligible:false,reasonCodes:[...new Set(reasons)],missingEvidence:[...new Set(missing)],evidenceSnapshot:state};
}
