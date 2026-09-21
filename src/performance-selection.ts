import type { SelectionMeasurementFamily } from "./selection-measurements.js";
import type { SelectionMeasurementCandidateContext, SelectionMeasurementComparabilityResult } from "./selection-measurement-comparability.js";

export type PerformanceSelectionCriterion = "HIGHEST_EXECUTION_SUCCESS_RATIO" | "HIGHEST_CANONICAL_SUCCESS_RATIO" | "LOWEST_MEAN_TRANSPORT_LATENCY";
export interface PerformanceSelectionPolicy { readonly criterion: PerformanceSelectionCriterion; }
export interface PerformanceSelectionInput { readonly comparability: SelectionMeasurementComparabilityResult; readonly policy: PerformanceSelectionPolicy; }
export interface PerformanceSelectionCandidate { readonly identity: Readonly<{capabilityId:string;providerId:string;resourceId?:string}>; readonly measurement: Readonly<Record<string,number>>; }
export interface PerformanceSelectionResult {
  readonly status:"SELECTED"|"NOT_ESTABLISHED"; readonly capabilityId:string; readonly criterion?:PerformanceSelectionCriterion; readonly measurementFamily?:SelectionMeasurementFamily;
  readonly selected?:PerformanceSelectionCandidate; readonly tiedPreferredCandidates:readonly PerformanceSelectionCandidate[]; readonly candidates:readonly PerformanceSelectionCandidate[];
  readonly reasonCodes:readonly string[]; readonly provenance:Readonly<{comparabilityStatus:string;measurementFamily?:SelectionMeasurementFamily;requirements?:unknown;comparabilityReasonCodes:readonly string[]}>;
}
const criterionFamily:Record<PerformanceSelectionCriterion,SelectionMeasurementFamily>={HIGHEST_EXECUTION_SUCCESS_RATIO:"EXECUTION_SUCCESS",HIGHEST_CANONICAL_SUCCESS_RATIO:"CANONICAL_SUCCESS",LOWEST_MEAN_TRANSPORT_LATENCY:"TRANSPORT_LATENCY"};
const freeze=<T>(v:T):T=>{if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v as Record<string,unknown>))freeze(x);}return v;};
const snapshot=<T>(v:T):T=>freeze(structuredClone(v));
const has=(v:object,k:string)=>Object.prototype.hasOwnProperty.call(v,k);
const key=(i:{capabilityId:string;providerId:string;resourceId?:string})=>`${i.capabilityId.length}:${i.capabilityId}|${i.providerId.length}:${i.providerId}|${has(i,"resourceId")?`1:${i.resourceId!.length}:${i.resourceId}`:"0"}`;
function candidate(c:SelectionMeasurementCandidateContext):PerformanceSelectionCandidate{return {identity:{...c.identity},measurement:{...c.measurement}};}
function validCount(n:unknown):n is number{return typeof n==="number"&&Number.isSafeInteger(n)&&n>=0;}
function ratio(c:SelectionMeasurementCandidateContext):{n:bigint;d:bigint}|undefined {const n=c.measurement.numerator,d=c.measurement.denominator,r=c.measurement.ratio;if(!validCount(n)||!validCount(d)||d===0||typeof r!=="number"||!Number.isFinite(r)||r<0||r>1)return; if(Math.abs(r-n/d)>1e-12)return;return {n:BigInt(n),d:BigInt(d)};}
function compareRatio(a:{n:bigint;d:bigint},b:{n:bigint;d:bigint}) {return a.n*b.d===b.n*a.d?0:a.n*b.d>b.n*a.d?1:-1;}
function inconsistent(comparability:SelectionMeasurementComparabilityResult,criterion?:PerformanceSelectionCriterion):PerformanceSelectionResult {return snapshot({status:"NOT_ESTABLISHED",capabilityId:comparability?.capabilityId??"",...(criterion?{criterion}:{}),...(comparability?.measurementFamily?{measurementFamily:comparability.measurementFamily}:{}),tiedPreferredCandidates:[],candidates:[],reasonCodes:["INCONSISTENT_COMPARABILITY_RESULT"],provenance:{comparabilityStatus:comparability?.status??"UNKNOWN",...(comparability?.measurementFamily?{measurementFamily:comparability.measurementFamily}:{}),requirements:comparability?.requirements,comparabilityReasonCodes:[...(comparability?.reasonCodes??[])]}});}
/** Pure Phase 13C selection over the exact already-COMPARABLE Phase 13B population. */
export function selectPerformanceCandidate(input:PerformanceSelectionInput):PerformanceSelectionResult {
  if(!input?.comparability||!input.policy||!(input.policy.criterion in criterionFamily))throw new Error("comparability and a known explicit performance selection criterion are required");
  const {comparability,policy}=input, criterion=policy.criterion, family=criterionFamily[criterion];
  if(comparability.status!=="COMPARABLE")return snapshot({status:"NOT_ESTABLISHED",capabilityId:comparability.capabilityId,criterion,measurementFamily:comparability.measurementFamily,tiedPreferredCandidates:[],candidates:[],reasonCodes:["COMPARABILITY_NOT_SATISFIED"],provenance:{comparabilityStatus:comparability.status,measurementFamily:comparability.measurementFamily,requirements:comparability.requirements,comparabilityReasonCodes:[...comparability.reasonCodes]}});
  if(comparability.measurementFamily!==family)return snapshot({status:"NOT_ESTABLISHED",capabilityId:comparability.capabilityId,criterion,measurementFamily:comparability.measurementFamily,tiedPreferredCandidates:[],candidates:[],reasonCodes:["CRITERION_MEASUREMENT_FAMILY_MISMATCH"],provenance:{comparabilityStatus:comparability.status,measurementFamily:comparability.measurementFamily,requirements:comparability.requirements,comparabilityReasonCodes:[...comparability.reasonCodes]}});
  const contexts=comparability.candidateContexts;
  if(!Array.isArray(contexts)||contexts.length<2||comparability.candidateCount!==contexts.length)return inconsistent(comparability,criterion);
  const ids=new Set<string>(); for(const c of contexts){if(!c||c.measurementFamily!==family||c.identity.capabilityId!==comparability.capabilityId||ids.has(key(c.identity))){return inconsistent(comparability,criterion);}ids.add(key(c.identity));}
  const ordered=[...contexts].sort((a,b)=>key(a.identity).localeCompare(key(b.identity)));
  let best=ordered[0]!, ties:SelectionMeasurementCandidateContext[]=[best];
  if(family==="TRANSPORT_LATENCY") {if(!ordered.every(c=>typeof c.measurement.meanMs==="number"&&Number.isFinite(c.measurement.meanMs)&&c.measurement.meanMs>=0))return inconsistent(comparability,criterion);for(const c of ordered.slice(1)){const x=c.measurement.meanMs!,y=best.measurement.meanMs!;if(x<y){best=c;ties=[c];}else if(x===y)ties.push(c);}}
  else {const values=ordered.map(ratio);if(values.some(v=>!v))return inconsistent(comparability,criterion);for(let i=1;i<ordered.length;i++){const cmp=compareRatio(values[i]!,ratio(best)!);if(cmp>0){best=ordered[i]!;ties=[best];}else if(cmp===0)ties.push(ordered[i]!);}}
  const candidates=ordered.map(candidate), tied=ties.map(candidate), selected=candidate(ties[0]!);
  return snapshot({status:"SELECTED",capabilityId:comparability.capabilityId,criterion,measurementFamily:family,selected,tiedPreferredCandidates:tied,candidates,reasonCodes:["SELECTED_UNDER_EXPLICIT_CRITERION"],provenance:{comparabilityStatus:comparability.status,measurementFamily:family,requirements:comparability.requirements,comparabilityReasonCodes:[...comparability.reasonCodes]}});
}
