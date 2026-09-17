/** Phase 11F: pure caller authorization for one supplied transaction proposal. */
export type PaymentStatus = "FREE" | "REQUIRED" | "UNKNOWN";
export type TransactionAuthorizationStatus = "NOT_ESTABLISHED" | "NOT_AUTHORIZED" | "AUTHORIZED";
export type TransactionAuthorizationDimension = "TRANSACTION_IDENTITY" | "PAYMENT_MODE" | "METHOD" | "PAYMENT_SCHEME" | "NETWORK" | "ASSET" | "AMOUNT" | "PAY_TO";
export type DimensionStatus = "ESTABLISHED_PASS" | "ESTABLISHED_FAIL" | "NOT_ESTABLISHED" | "NOT_REQUIRED";
export type TransactionAuthorizationReasonCode =
  | "NO_AUTHORIZATION_REQUIREMENTS" | "TRANSACTION_IDENTITY_MISMATCH" | "INCONSISTENT_TRANSACTION_FACTS"
  | "PAYMENT_STATUS_UNKNOWN" | "FREE_TRANSACTION_NOT_ALLOWED" | "PAID_TRANSACTION_NOT_ALLOWED"
  | "METHOD_MISSING" | "METHOD_NOT_ALLOWED" | "PAYMENT_SCHEME_MISSING" | "PAYMENT_SCHEME_NOT_ALLOWED"
  | "NETWORK_MISSING" | "NETWORK_NOT_ALLOWED" | "ASSET_MISSING" | "ASSET_NOT_ALLOWED"
  | "PAYMENT_AMOUNT_MISSING" | "PAYMENT_AMOUNT_INVALID" | "PAYMENT_AMOUNT_ABOVE_MAXIMUM" | "PAYMENT_MAXIMUM_NOT_COMPARABLE"
  | "PAY_TO_MISSING" | "PAY_TO_NOT_ALLOWED";

export interface TransactionPaymentRequirement { readonly scheme?: string; readonly network?: string; readonly asset?: string; readonly atomicAmount?: string; readonly payTo?: string; readonly maxTimeoutSeconds?: number; }
export interface TransactionProposal {
  readonly capabilityId: string; readonly providerId: string; readonly resourceId?: string;
  readonly invocation: { readonly method?: string; readonly resource?: string };
  readonly payment: { readonly status: PaymentStatus; readonly requirement?: TransactionPaymentRequirement };
  /** Optional retained quote identity, never raw headers, payloads, or credentials. */
  readonly provenance?: { readonly quoteCapabilityId?: string; readonly quoteProviderId?: string; readonly quoteResourceId?: string };
}
export interface TransactionAuthorizationPolicy {
  readonly allowFree?: boolean; readonly allowPaid?: boolean; readonly allowedMethods?: readonly string[];
  readonly allowedPaymentSchemes?: readonly string[]; readonly allowedNetworks?: readonly string[]; readonly allowedAssets?: readonly string[];
  readonly maximumPayment?: { readonly network: string; readonly asset: string; readonly atomicAmount: string };
  readonly allowedPayTo?: readonly string[];
}
export interface TransactionAuthorizationAssessment { readonly dimension: TransactionAuthorizationDimension; readonly status: DimensionStatus; readonly reasonCode?: TransactionAuthorizationReasonCode; readonly observed?: string; readonly required?: string; }
export interface TransactionAuthorizationResult {
  readonly status: TransactionAuthorizationStatus; readonly capabilityId: string; readonly providerId: string; readonly resourceId?: string;
  readonly policySnapshot: Readonly<TransactionAuthorizationPolicy>; readonly proposalSnapshot: Readonly<TransactionProposal>;
  readonly dimensions: readonly TransactionAuthorizationAssessment[]; readonly missingFacts: readonly TransactionAuthorizationAssessment[]; readonly failedRequirements: readonly TransactionAuthorizationAssessment[];
}
const order: readonly TransactionAuthorizationDimension[]=["TRANSACTION_IDENTITY","PAYMENT_MODE","METHOD","PAYMENT_SCHEME","NETWORK","ASSET","AMOUNT","PAY_TO"];
const integer=/^(?:0|[1-9]\d*)$/;
function deepFreeze<T>(x:T):T { if(x && typeof x==="object"&&!Object.isFrozen(x)){Object.freeze(x);for(const child of Object.values(x as Record<string,unknown>))deepFreeze(child);}return x; }
function snap<T>(x:T):T{return deepFreeze(structuredClone(x));}
function canonical(values:readonly string[]|undefined, upper=false):readonly string[]|undefined { if(values===undefined)return undefined; if(!Array.isArray(values)||values.some(x=>typeof x!=="string"||!x.trim()))throw new Error("INVALID_AUTHORIZATION_ALLOW_LIST"); return [...new Set(values.map(x=>upper?x.trim().toUpperCase():x.trim()))].sort(); }
function hasRequirements(p:TransactionAuthorizationPolicy):boolean{return p.allowFree!==undefined||p.allowPaid!==undefined||p.allowedMethods!==undefined||p.allowedPaymentSchemes!==undefined||p.allowedNetworks!==undefined||p.allowedAssets!==undefined||p.maximumPayment!==undefined||p.allowedPayTo!==undefined;}
/** Validates and canonicalizes only caller policy data; this performs no I/O. */
export function validateTransactionAuthorizationPolicy(policy:TransactionAuthorizationPolicy):Readonly<TransactionAuthorizationPolicy>{
 if(!policy||typeof policy!=="object")throw new Error("INVALID_AUTHORIZATION_POLICY");
 const maximum=policy.maximumPayment;
 if(maximum!==undefined&&(!maximum.network||!maximum.asset||!integer.test(maximum.atomicAmount)))throw new Error("INVALID_MAXIMUM_PAYMENT");
 return snap({...(policy.allowFree===undefined?{}:{allowFree:policy.allowFree}),...(policy.allowPaid===undefined?{}:{allowPaid:policy.allowPaid}),...(canonical(policy.allowedMethods,true)?{allowedMethods:canonical(policy.allowedMethods,true)}:{}),...(canonical(policy.allowedPaymentSchemes)?{allowedPaymentSchemes:canonical(policy.allowedPaymentSchemes)}:{}),...(canonical(policy.allowedNetworks)?{allowedNetworks:canonical(policy.allowedNetworks)}:{}),...(canonical(policy.allowedAssets)?{allowedAssets:canonical(policy.allowedAssets)}:{}),...(maximum?{maximumPayment:{network:maximum.network,asset:maximum.asset,atomicAmount:maximum.atomicAmount}}:{}),...(canonical(policy.allowedPayTo)?{allowedPayTo:canonical(policy.allowedPayTo)}:{})});
}
function assessment(dimension:TransactionAuthorizationDimension,status:DimensionStatus,reasonCode?:TransactionAuthorizationReasonCode,observed?:string,required?:string):TransactionAuthorizationAssessment{return {dimension,status,...(reasonCode?{reasonCode}:{}),...(observed===undefined?{}:{observed}),...(required===undefined?{}:{required})};}
function requiredList(d:TransactionAuthorizationDimension,value:string|undefined, allowed:readonly string[]|undefined, missing:TransactionAuthorizationReasonCode, rejected:TransactionAuthorizationReasonCode, upper=false):TransactionAuthorizationAssessment {
 if(!allowed)return assessment(d,"NOT_REQUIRED"); const actual=value===undefined?undefined:(upper?value.toUpperCase():value); if(!actual)return assessment(d,"NOT_ESTABLISHED",missing); return allowed.includes(actual)?assessment(d,"ESTABLISHED_PASS",undefined,actual,allowed.join(",")):assessment(d,"ESTABLISHED_FAIL",rejected,actual,allowed.join(","));
}
export function authorizeTransaction(proposal:TransactionProposal, policy:TransactionAuthorizationPolicy):TransactionAuthorizationResult {
 const p=snap(proposal), policySnapshot=validateTransactionAuthorizationPolicy(policy), ds:TransactionAuthorizationAssessment[]=[];
 const add=(x:TransactionAuthorizationAssessment)=>ds.push(x);
 const identityOK=!!p?.capabilityId&&!!p?.providerId&&(!p.provenance?.quoteCapabilityId||p.provenance.quoteCapabilityId===p.capabilityId)&&(!p.provenance?.quoteProviderId||p.provenance.quoteProviderId===p.providerId)&&(!p.provenance?.quoteResourceId||p.provenance.quoteResourceId===p.resourceId);
 add(identityOK?assessment("TRANSACTION_IDENTITY","NOT_REQUIRED"):assessment("TRANSACTION_IDENTITY","NOT_ESTABLISHED","TRANSACTION_IDENTITY_MISMATCH"));
 if(!hasRequirements(policySnapshot)) add(assessment("PAYMENT_MODE","NOT_ESTABLISHED","NO_AUTHORIZATION_REQUIREMENTS"));
 else if(p.payment?.status==="FREE") add(policySnapshot.allowFree===undefined?assessment("PAYMENT_MODE","NOT_REQUIRED"):policySnapshot.allowFree?assessment("PAYMENT_MODE","ESTABLISHED_PASS"):assessment("PAYMENT_MODE","ESTABLISHED_FAIL","FREE_TRANSACTION_NOT_ALLOWED"));
 else if(p.payment?.status==="REQUIRED") add(policySnapshot.allowPaid===undefined?assessment("PAYMENT_MODE","NOT_REQUIRED"):policySnapshot.allowPaid?assessment("PAYMENT_MODE","ESTABLISHED_PASS"):assessment("PAYMENT_MODE","ESTABLISHED_FAIL","PAID_TRANSACTION_NOT_ALLOWED"));
 else add(policySnapshot.allowFree!==undefined||policySnapshot.allowPaid!==undefined?assessment("PAYMENT_MODE","NOT_ESTABLISHED","PAYMENT_STATUS_UNKNOWN"):assessment("PAYMENT_MODE","NOT_REQUIRED"));
 add(requiredList("METHOD",p.invocation?.method,policySnapshot.allowedMethods,"METHOD_MISSING","METHOD_NOT_ALLOWED",true));
 const r=p.payment?.requirement;
 const contradictory=p.payment?.status==="FREE"&&r!==undefined;
 if(contradictory){ add(assessment("PAYMENT_SCHEME","NOT_ESTABLISHED","INCONSISTENT_TRANSACTION_FACTS")); add(assessment("NETWORK","NOT_ESTABLISHED","INCONSISTENT_TRANSACTION_FACTS")); add(assessment("ASSET","NOT_ESTABLISHED","INCONSISTENT_TRANSACTION_FACTS")); add(assessment("AMOUNT","NOT_ESTABLISHED","INCONSISTENT_TRANSACTION_FACTS")); add(assessment("PAY_TO","NOT_ESTABLISHED","INCONSISTENT_TRANSACTION_FACTS")); }
 else if(p.payment?.status!=="REQUIRED") { for(const d of ["PAYMENT_SCHEME","NETWORK","ASSET","AMOUNT","PAY_TO"] as const)add(assessment(d,"NOT_REQUIRED")); }
 else { add(requiredList("PAYMENT_SCHEME",r?.scheme,policySnapshot.allowedPaymentSchemes,"PAYMENT_SCHEME_MISSING","PAYMENT_SCHEME_NOT_ALLOWED")); add(requiredList("NETWORK",r?.network,policySnapshot.allowedNetworks,"NETWORK_MISSING","NETWORK_NOT_ALLOWED")); add(requiredList("ASSET",r?.asset,policySnapshot.allowedAssets,"ASSET_MISSING","ASSET_NOT_ALLOWED"));
   if(!policySnapshot.maximumPayment)add(assessment("AMOUNT","NOT_REQUIRED")); else if(r?.atomicAmount===undefined)add(assessment("AMOUNT","NOT_ESTABLISHED","PAYMENT_AMOUNT_MISSING")); else if(!integer.test(r.atomicAmount))add(assessment("AMOUNT","NOT_ESTABLISHED","PAYMENT_AMOUNT_INVALID")); else if(r.network!==policySnapshot.maximumPayment.network||r.asset!==policySnapshot.maximumPayment.asset)add(assessment("AMOUNT","NOT_ESTABLISHED","PAYMENT_MAXIMUM_NOT_COMPARABLE")); else add(BigInt(r.atomicAmount)<=BigInt(policySnapshot.maximumPayment.atomicAmount)?assessment("AMOUNT","ESTABLISHED_PASS",undefined,r.atomicAmount,policySnapshot.maximumPayment.atomicAmount):assessment("AMOUNT","ESTABLISHED_FAIL","PAYMENT_AMOUNT_ABOVE_MAXIMUM",r.atomicAmount,policySnapshot.maximumPayment.atomicAmount));
   add(requiredList("PAY_TO",r?.payTo,policySnapshot.allowedPayTo,"PAY_TO_MISSING","PAY_TO_NOT_ALLOWED")); }
 const dimensions=order.map(d=>ds.find(x=>x.dimension===d)!).filter(Boolean); const missing=dimensions.filter(x=>x.status==="NOT_ESTABLISHED"), failed=dimensions.filter(x=>x.status==="ESTABLISHED_FAIL"); const status:TransactionAuthorizationStatus=missing.length?"NOT_ESTABLISHED":failed.length?"NOT_AUTHORIZED":"AUTHORIZED";
 return deepFreeze({status,capabilityId:p.capabilityId,providerId:p.providerId,...(p.resourceId===undefined?{}:{resourceId:p.resourceId}),policySnapshot,proposalSnapshot:p,dimensions:deepFreeze(dimensions),missingFacts:deepFreeze(missing),failedRequirements:deepFreeze(failed)});
}
