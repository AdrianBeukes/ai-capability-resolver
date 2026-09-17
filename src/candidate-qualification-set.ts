/** Phase 11E: a pure, non-preferential set view over independent Phase 11D results. */
import { qualifyCapability, validateCapabilityQualificationRequirement, type CapabilityQualificationInput, type CapabilityQualificationRequirement, type CapabilityQualificationResult, type QualificationDimension, type QualificationReasonCode } from "./capability-qualification.js";

export interface CandidateSetQualificationInput {
  readonly capabilityId: string;
  readonly requirement: CapabilityQualificationRequirement;
  readonly candidates: readonly CapabilityQualificationInput[];
}
export interface CandidateKey { readonly capabilityId: string; readonly providerId: string; readonly resourceId?: string; }
export interface EvidenceGapAggregate { readonly dimension: QualificationDimension; readonly reasonCode: QualificationReasonCode; readonly candidateCount: number; readonly candidateKeys: readonly CandidateKey[]; }
export interface FailureAggregate { readonly dimension: QualificationDimension; readonly reasonCode: QualificationReasonCode; readonly candidateCount: number; readonly candidateKeys: readonly CandidateKey[]; }
export interface CandidateSetQualificationResult {
  readonly capabilityId: string;
  readonly requirementSnapshot: Readonly<CapabilityQualificationRequirement>;
  readonly totalCandidates: number;
  readonly qualified: readonly CapabilityQualificationResult[];
  readonly notQualified: readonly CapabilityQualificationResult[];
  readonly notEstablished: readonly CapabilityQualificationResult[];
  readonly counts: Readonly<{ qualified:number; notQualified:number; notEstablished:number }>;
  readonly coverage: Readonly<{ totalCandidates:number; qualifiedCount:number; notQualifiedCount:number; notEstablishedCount:number }>;
  readonly evidenceGaps: readonly EvidenceGapAggregate[];
  readonly establishedFailures: readonly FailureAggregate[];
}
const dimensions: readonly QualificationDimension[]=["SEMANTICS","SCHEMA","ADAPTER","EXTERNAL_CANONICAL_SUCCESS","OPERATIONAL_EVIDENCE","OPERATIONAL_ACCEPTANCE"];
const dimensionIndex=new Map(dimensions.map((x,i)=>[x,i]));
function freeze<T>(value:T):T { if(value && typeof value === "object" && !Object.isFrozen(value)){ Object.freeze(value); for(const child of Object.values(value as Record<string,unknown>)) freeze(child); } return value; }
function key(x: Pick<CapabilityQualificationInput,"capabilityId"|"providerId"|"resourceId">):CandidateKey { return {capabilityId:x.capabilityId,providerId:x.providerId,...(x.resourceId===undefined?{}:{resourceId:x.resourceId})}; }
function keyId(x:CandidateKey):string { return JSON.stringify([x.capabilityId,x.providerId,x.resourceId ?? null]); }
function compareKeys(a:CandidateKey,b:CandidateKey):number {
  const base=a.capabilityId.localeCompare(b.capabilityId)||a.providerId.localeCompare(b.providerId); if(base) return base;
  const aHas=a.resourceId!==undefined, bHas=b.resourceId!==undefined;
  return aHas===bHas ? String(a.resourceId ?? "").localeCompare(String(b.resourceId ?? "")) : aHas ? 1 : -1;
}
function compareResults(a:CapabilityQualificationResult,b:CapabilityQualificationResult):number { return compareKeys(key(a),key(b)); }
function aggregate(results:readonly CapabilityQualificationResult[], status:"NOT_ESTABLISHED"|"ESTABLISHED_FAIL"):readonly EvidenceGapAggregate[] {
  const groups=new Map<string,{dimension:QualificationDimension;reasonCode:QualificationReasonCode; keys:Map<string,CandidateKey>}>();
  for(const result of results) for(const assessment of result.dimensions) if(assessment.status===status && assessment.reasonCode) {
    const groupKey=`${assessment.dimension}\u0000${assessment.reasonCode}`;
    const group=groups.get(groupKey) ?? {dimension:assessment.dimension,reasonCode:assessment.reasonCode,keys:new Map<string,CandidateKey>()};
    const candidateKey=key(result); group.keys.set(keyId(candidateKey),candidateKey); groups.set(groupKey,group);
  }
  return [...groups.values()].sort((a,b)=>(dimensionIndex.get(a.dimension)!-dimensionIndex.get(b.dimension)!)||a.reasonCode.localeCompare(b.reasonCode)).map(x=>freeze({dimension:x.dimension,reasonCode:x.reasonCode,candidateCount:x.keys.size,candidateKeys:freeze([...x.keys.values()].sort(compareKeys))}));
}
/**
 * Qualifies every supplied candidate independently. Ordering is identity-only
 * determinism, never a preference, score, ranking, or selection signal.
 */
export function qualifyCandidateSet(input:CandidateSetQualificationInput):CandidateSetQualificationResult {
  if(!input || !input.capabilityId || !Array.isArray(input.candidates)) throw new Error("capabilityId and candidates array are required");
  validateCapabilityQualificationRequirement(input.requirement);
  const seen=new Set<string>();
  for(const candidate of input.candidates) {
    if(!candidate || candidate.capabilityId!==input.capabilityId) throw new Error("CANDIDATE_SET_CAPABILITY_MISMATCH");
    if(!candidate.providerId) throw new Error("capabilityId and providerId are required");
    const identity=keyId(key(candidate)); if(seen.has(identity)) throw new Error("DUPLICATE_CANDIDATE_IDENTITY"); seen.add(identity);
  }
  // Validate/qualify only after all set-level structural checks: errors are atomic.
  const all=input.candidates.map(candidate=>qualifyCapability(candidate,input.requirement)).sort(compareResults);
  const qualified=all.filter(x=>x.status==="QUALIFIED"), notQualified=all.filter(x=>x.status==="NOT_QUALIFIED"), notEstablished=all.filter(x=>x.status==="NOT_ESTABLISHED");
  if(qualified.length+notQualified.length+notEstablished.length!==all.length) throw new Error("CANDIDATE_SET_PARTITION_INVARIANT");
  const evidenceGaps=aggregate(notEstablished,"NOT_ESTABLISHED");
  const establishedFailures=aggregate(all,"ESTABLISHED_FAIL") as readonly FailureAggregate[];
  const counts=freeze({qualified:qualified.length,notQualified:notQualified.length,notEstablished:notEstablished.length});
  return freeze({capabilityId:input.capabilityId,requirementSnapshot:freeze(structuredClone(input.requirement)),totalCandidates:all.length,qualified:freeze(qualified),notQualified:freeze(notQualified),notEstablished:freeze(notEstablished),counts,coverage:freeze({totalCandidates:all.length,qualifiedCount:counts.qualified,notQualifiedCount:counts.notQualified,notEstablishedCount:counts.notEstablished}),evidenceGaps,establishedFailures});
}
