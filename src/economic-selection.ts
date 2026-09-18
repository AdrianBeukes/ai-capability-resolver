/** Phase 12C: pure caller-directed economic selection over supplied ADMISSIBLE candidates. */
import type { CandidateAdmissibilityResult, CandidateIdentity } from "./candidate-admissibility.js";

export type EconomicSelectionCriterion = "LOWEST_EXACT_TRANSACTION_COST";
export interface EconomicSelectionPolicy { readonly criterion: EconomicSelectionCriterion; }
export type TransactionCost = Readonly<{ paymentMode:"FREE" } | { paymentMode:"PAID"; scheme?:string; network:string; asset:string; atomicAmount:string }>;
export type CostComparisonState = "COMPARABLE" | "INCOMPARABLE" | "NOT_ESTABLISHED";
export type EconomicSelectionStatus = "SELECTED" | "NOT_ESTABLISHED";
export type EconomicSelectionReasonCode = "NO_ADMISSIBLE_CANDIDATES" | "COST_NOT_ESTABLISHED" | "MALFORMED_ATOMIC_AMOUNT" | "COST_PROVENANCE_IDENTITY_MISMATCH" | "INCOMPARABLE_COST_CONTEXTS" | "SELECTED_UNIQUE_MINIMUM" | "SELECTED_IDENTITY_TIE_BREAK";
export interface EconomicSelectionCandidate { readonly admissibility: CandidateAdmissibilityResult; }
export interface EconomicSelectionInput { readonly policy: EconomicSelectionPolicy; readonly candidates: readonly EconomicSelectionCandidate[]; }
export interface EconomicCandidateSummary { readonly identity: Readonly<CandidateIdentity>; readonly cost?: TransactionCost; readonly comparability: CostComparisonState; }
export interface EconomicSelectionResult { readonly status:EconomicSelectionStatus; readonly criterion:EconomicSelectionCriterion; readonly selected?:EconomicCandidateSummary; readonly tiedMinimumCandidates:readonly EconomicCandidateSummary[]; readonly candidates:readonly EconomicCandidateSummary[]; readonly reasonCodes:readonly EconomicSelectionReasonCode[]; readonly missingFacts:readonly string[]; readonly provenance:Readonly<{policy:EconomicSelectionPolicy; source:"ADMISSIBLE_TRANSACTION_AUTHORIZATION_PROPOSAL"}>; }

const integer=/^(?:0|[1-9]\d*)$/;
function freeze<T>(x:T):T { if(x&&typeof x==="object"&&!Object.isFrozen(x)){Object.freeze(x);for(const v of Object.values(x as Record<string,unknown>))freeze(v);} return x; }
function snap<T>(x:T):T{return freeze(structuredClone(x));}
function hasResource(x:CandidateIdentity):boolean{return Object.hasOwn(x,"resourceId");}
/** Canonical structured candidate identity ordering; it is never an economic preference. */
function compareIdentity(a:CandidateIdentity,b:CandidateIdentity):number {const base=a.capabilityId.localeCompare(b.capabilityId)||a.providerId.localeCompare(b.providerId);if(base)return base;return hasResource(a)===hasResource(b)?String(a.resourceId??"").localeCompare(String(b.resourceId??"")):hasResource(a)?1:-1;}
function key(x:CandidateIdentity):string{return JSON.stringify([x.capabilityId,x.providerId,hasResource(x),x.resourceId]);}
/** Matches Phase 12A's conservative resource semantics: only known conflicting resources fail. */
function identityCompatible(a:CandidateIdentity,b:{capabilityId?:string;providerId?:string;resourceId?:string}):boolean{return a.capabilityId===b.capabilityId&&a.providerId===b.providerId&&!(hasResource(a)&&Object.hasOwn(b,"resourceId")&&a.resourceId!==b.resourceId);}
function extract(candidate:EconomicSelectionCandidate):{cost?:TransactionCost; issue?:EconomicSelectionReasonCode; missing?:string} {
 const authorization=candidate.admissibility.provenance?.authorization;
 const proposal=authorization?.proposalSnapshot;
 if(!authorization||!proposal||!identityCompatible(candidate.admissibility.identity,authorization)||!identityCompatible(candidate.admissibility.identity,proposal)||authorization.capabilityId!==proposal.capabilityId||authorization.providerId!==proposal.providerId||(Object.hasOwn(authorization,"resourceId")&&Object.hasOwn(proposal,"resourceId")&&authorization.resourceId!==proposal.resourceId))return {issue:"COST_PROVENANCE_IDENTITY_MISMATCH",missing:"AUTHORIZED_PROPOSAL_IDENTITY"};
 const payment=proposal.payment;
 if(payment?.status==="FREE") return {cost:freeze({paymentMode:"FREE"})};
 if(payment?.status!=="REQUIRED") return {issue:"COST_NOT_ESTABLISHED",missing:"PAYMENT_MODE"};
 const r=payment.requirement;
 if(!r?.network)return {issue:"COST_NOT_ESTABLISHED",missing:"NETWORK"}; if(!r.asset)return {issue:"COST_NOT_ESTABLISHED",missing:"ASSET"};
 if(r.atomicAmount===undefined)return {issue:"COST_NOT_ESTABLISHED",missing:"ATOMIC_AMOUNT"}; if(!integer.test(r.atomicAmount))return {issue:"MALFORMED_ATOMIC_AMOUNT",missing:"ATOMIC_AMOUNT"};
 return {cost:freeze({paymentMode:"PAID",...(r.scheme===undefined?{}:{scheme:r.scheme}),network:r.network,asset:r.asset,atomicAmount:r.atomicAmount})};
}
function summary(identity:CandidateIdentity,cost?:TransactionCost,comparability:CostComparisonState="NOT_ESTABLISHED"):EconomicCandidateSummary{return freeze({identity:snap(identity),...(cost===undefined?{}:{cost:snap(cost)}),comparability});}
function validate(input:EconomicSelectionInput):void {if(!input?.policy||input.policy.criterion!=="LOWEST_EXACT_TRANSACTION_COST")throw new Error("ECONOMIC_SELECTION_POLICY_REQUIRED");if(!Array.isArray(input.candidates))throw new Error("ECONOMIC_SELECTION_CANDIDATES_REQUIRED");const seen=new Set<string>();let cap:string|undefined;for(const x of input.candidates){const a=x?.admissibility;if(!a||a.status!=="ADMISSIBLE")throw new Error("NON_ADMISSIBLE_SELECTION_INPUT");const id=a.identity;if(!id?.capabilityId||!id.providerId)throw new Error("CANDIDATE_IDENTITY_REQUIRED");if(cap===undefined)cap=id.capabilityId;else if(cap!==id.capabilityId)throw new Error("INCONSISTENT_SELECTION_CAPABILITY");const k=key(id);if(seen.has(k))throw new Error("DUPLICATE_CANDIDATE_IDENTITY");seen.add(k);}}
function result(status:EconomicSelectionStatus,policy:EconomicSelectionPolicy,candidates:EconomicCandidateSummary[],ties:EconomicCandidateSummary[],reasons:EconomicSelectionReasonCode[],missing:string[],selected?:EconomicCandidateSummary):EconomicSelectionResult{return freeze({status,criterion:policy.criterion,...(selected===undefined?{}:{selected}),tiedMinimumCandidates:freeze(ties),candidates:freeze(candidates),reasonCodes:freeze(reasons),missingFacts:freeze([...new Set(missing)].sort()),provenance:freeze({policy:snap(policy),source:"ADMISSIBLE_TRANSACTION_AUTHORIZATION_PROPOSAL"})});}

/**
 * Establishes a global minimum before tie-breaking.  Positive paid costs need one
 * exact network+asset context; all numeric zero costs (FREE or PAID) tie across
 * contexts because no asset quantity is transferred.  FREE also dominates known
 * strictly-positive paid costs without conversion.
 */
export function selectEconomically(input:EconomicSelectionInput):EconomicSelectionResult {
 validate(input); const policy=snap(input.policy); if(input.candidates.length===0)return result("NOT_ESTABLISHED",policy,[],[],["NO_ADMISSIBLE_CANDIDATES"],[]);
 const extracted=input.candidates.map(x=>({identity:x.admissibility.identity,...extract(x)})); const issues=extracted.filter(x=>x.issue);
 if(issues.length){const candidates=extracted.map(x=>summary(x.identity,x.cost,"NOT_ESTABLISHED")).sort((a,b)=>compareIdentity(a.identity,b.identity));return result("NOT_ESTABLISHED",policy,candidates,[],issues.map(x=>x.issue!).sort(),issues.map(x=>`${key(x.identity)}:${x.missing}`));}
 const costs=extracted as {identity:CandidateIdentity;cost:TransactionCost}[]; const zeros=costs.filter(x=>x.cost.paymentMode==="FREE"||(x.cost.paymentMode==="PAID"&&BigInt(x.cost.atomicAmount)===0n));
 let ties:{identity:CandidateIdentity;cost:TransactionCost}[]; let comparable:boolean;
 if(zeros.length){ties=zeros;comparable=true;} else {const paid=costs as {identity:CandidateIdentity;cost:Extract<TransactionCost,{paymentMode:"PAID"}>}[];const context=`${paid[0]!.cost.network}\u0000${paid[0]!.cost.asset}`;comparable=paid.every(x=>`${x.cost.network}\u0000${x.cost.asset}`===context);if(comparable){let minimum=BigInt(paid[0]!.cost.atomicAmount);for(const x of paid)if(BigInt(x.cost.atomicAmount)<minimum)minimum=BigInt(x.cost.atomicAmount);ties=paid.filter(x=>BigInt(x.cost.atomicAmount)===minimum);}else ties=[];}
 const candidates=costs.map(x=>summary(x.identity,x.cost,comparable?"COMPARABLE":"INCOMPARABLE")).sort((a,b)=>compareIdentity(a.identity,b.identity));
 if(!comparable)return result("NOT_ESTABLISHED",policy,candidates,[],["INCOMPARABLE_COST_CONTEXTS"],[]);
 const tieSummaries=ties.map(x=>summary(x.identity,x.cost,"COMPARABLE")).sort((a,b)=>compareIdentity(a.identity,b.identity)); const selected=tieSummaries[0]!;
 return result("SELECTED",policy,candidates,tieSummaries,[tieSummaries.length===1?"SELECTED_UNIQUE_MINIMUM":"SELECTED_IDENTITY_TIE_BREAK"],[],selected);
}
