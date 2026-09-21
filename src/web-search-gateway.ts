import { createHash, randomUUID } from "node:crypto";
import { createObservationRecord, deriveRequestFingerprint, type CapabilityObservationRecord, type FailureCategory } from "./observation-ledger.js";
import type { SelectionMeasurementComparabilityResult } from "./selection-measurement-comparability.js";
import { selectPerformanceCandidate } from "./performance-selection.js";

export type WebSearchInput = Readonly<{ query: string; limit?: number }>;
export type WebSearchResult = Readonly<{ title?: string; url: string; snippet?: string }>;
export type WebSearchOutput = Readonly<{ results: readonly WebSearchResult[] }>;
export type GatewayErrorCode = "INVALID_REQUEST" | "CAPABILITY_NOT_SUPPORTED" | "NO_ADMISSIBLE_PROVIDER" | "SELECTION_NOT_ESTABLISHED" | "PROVIDER_EXECUTION_FAILED" | "CANONICAL_OUTPUT_INVALID" | "PAYMENT_REQUIRED_BY_PROVIDER" | "GATEWAY_INTERNAL_ERROR";
export interface Clock { now(): Date; }
export interface RequestIdSource { next(): string; }
export interface WebSearchProviderAdapter { readonly providerId: string; readonly resourceId?: string; readonly quotedCostUsd?: number; readonly qualified: boolean; readonly authorized: boolean; readonly admissible: boolean; executeNative(input: WebSearchInput): Promise<unknown>; adaptToCanonical(native: unknown): unknown; }
export interface GatewayAccountingRecord { readonly requestId:string; readonly capabilityId:"web.search"; readonly selectedProvider?:string; readonly attemptedProviders:readonly string[]; readonly providerQuotedCostUsd?:number; readonly paymentStatus:"NOT_ENABLED"; readonly executionStatus:"SUCCEEDED"|"FAILED"|"PAYMENT_REQUIRED"; readonly timestamp:string; }
export interface GatewayResult { readonly ok:true; readonly requestId:string; readonly providerId:string; readonly output:WebSearchOutput; readonly observations:readonly CapabilityObservationRecord[]; readonly accounting:GatewayAccountingRecord; }
export interface GatewayFailure { readonly ok:false; readonly requestId:string; readonly error:{readonly code:GatewayErrorCode}; readonly observations:readonly CapabilityObservationRecord[]; readonly accounting:GatewayAccountingRecord; }
export type GatewayResponse = GatewayResult | GatewayFailure;
export interface GatewayRequest { readonly capability: "web.search"; readonly input: WebSearchInput; readonly policy?: { readonly selection?: "LOWEST_EXACT_TRANSACTION_COST" | "HIGHEST_CANONICAL_SUCCESS_RATIO"; readonly maxProviderCostUsd?: number; readonly maxProviderAttempts?: number }; }
const freeze=<T>(x:T):T=>{if(x&&typeof x==="object"&&!Object.isFrozen(x)){Object.freeze(x);for(const v of Object.values(x as Record<string,unknown>))freeze(v);}return x;};
const snap=<T>(x:T):T=>freeze(structuredClone(x));
const safeId=()=>randomUUID();
const defaultClock:Clock={now:()=>new Date()};
const defaultIds:RequestIdSource={next:safeId};
export function validateWebSearchInput(value: unknown): WebSearchInput {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("INVALID_REQUEST"); const x=value as Record<string,unknown>;
  if(typeof x.query!=="string" || !x.query.trim() || x.query.length>500) throw new Error("INVALID_REQUEST");
  if(x.limit!==undefined && (typeof x.limit!=="number" || !Number.isInteger(x.limit)||x.limit<1||x.limit>20)) throw new Error("INVALID_REQUEST");
  if(Object.keys(x).some(k=>k!=="query"&&k!=="limit")) throw new Error("INVALID_REQUEST"); return snap({query:x.query.trim(),...(x.limit===undefined?{}:{limit:x.limit as number})});
}
export function validateWebSearchOutput(value: unknown): WebSearchOutput | undefined {
  if(!value||typeof value!=="object"||Array.isArray(value))return; const rows=(value as Record<string,unknown>).results;
  if(!Array.isArray(rows)||rows.length>20)return; const out:WebSearchResult[]=[];
  for(const row of rows){if(!row||typeof row!=="object"||Array.isArray(row))return;const x=row as Record<string,unknown>;if(typeof x.url!=="string"||x.url.length>2048)return;let u:URL;try{u=new URL(x.url)}catch{return}if(u.protocol!=="http:"&&u.protocol!=="https:")return;if(x.title!==undefined&&(typeof x.title!=="string"||x.title.length>500))return;if(x.snippet!==undefined&&(typeof x.snippet!=="string"||x.snippet.length>2000))return;out.push({...(typeof x.title==="string"?{title:x.title}:{}),url:u.toString(),...(typeof x.snippet==="string"?{snippet:x.snippet}:{})});}return snap({results:out});
}
function publicFailure(requestId:string, code:GatewayErrorCode, attempted:string[], timestamp:string, observations:CapabilityObservationRecord[]=[]):GatewayFailure{return snap({ok:false,requestId,error:{code},observations,accounting:{requestId,capabilityId:"web.search",attemptedProviders:attempted,paymentStatus:"NOT_ENABLED",executionStatus:code==="PAYMENT_REQUIRED_BY_PROVIDER"?"PAYMENT_REQUIRED":"FAILED",timestamp}});}
function failureCategory(error:unknown):FailureCategory { if(error&&typeof error==="object"&&(error as {status?:unknown}).status===402)return "payment_required"; return "execution_error"; }
/** Small online execution plane. Provider qualification/authorization/admissibility are pre-established control-plane facts. */
export class WebSearchGateway {
  constructor(private readonly providers:readonly WebSearchProviderAdapter[], private readonly clock:Clock=defaultClock, private readonly ids:RequestIdSource=defaultIds, private readonly comparability?:SelectionMeasurementComparabilityResult) {}
  async execute(request: unknown):Promise<GatewayResponse>{
    const requestId=this.ids.next(); const now=this.clock.now().toISOString();
    if(!request||typeof request!=="object"||(request as {capability?:unknown}).capability!=="web.search") return publicFailure(requestId,"CAPABILITY_NOT_SUPPORTED",[],now);
    let input:WebSearchInput; try{input=validateWebSearchInput((request as {input?:unknown}).input);}catch{return publicFailure(requestId,"INVALID_REQUEST",[],now);}
    const policy=(request as GatewayRequest).policy??{}; if(policy.maxProviderCostUsd!==undefined&&(!Number.isFinite(policy.maxProviderCostUsd)||policy.maxProviderCostUsd<0))return publicFailure(requestId,"INVALID_REQUEST",[],now);
    const eligible=this.providers.filter(p=>p.qualified&&p.authorized&&p.admissible&&(policy.maxProviderCostUsd===undefined||(p.quotedCostUsd!==undefined&&p.quotedCostUsd<=policy.maxProviderCostUsd)));
    if(!eligible.length)return publicFailure(requestId,"NO_ADMISSIBLE_PROVIDER",[],now);
    let ordered:WebSearchProviderAdapter[];
    if(policy.selection==="HIGHEST_CANONICAL_SUCCESS_RATIO") { if(!this.comparability)return publicFailure(requestId,"SELECTION_NOT_ESTABLISHED",[],now); const selection=selectPerformanceCandidate({comparability:this.comparability,policy:{criterion:"HIGHEST_CANONICAL_SUCCESS_RATIO"}}); if(selection.status!=="SELECTED")return publicFailure(requestId,"SELECTION_NOT_ESTABLISHED",[],now); const chosen=eligible.find(p=>p.providerId===selection.selected!.identity.providerId);if(!chosen)return publicFailure(requestId,"SELECTION_NOT_ESTABLISHED",[],now);ordered=[chosen,...eligible.filter(x=>x!==chosen).sort((a,b)=>a.providerId.localeCompare(b.providerId))]; }
    else ordered=[...eligible].sort((a,b)=>(a.quotedCostUsd??Infinity)-(b.quotedCostUsd??Infinity)||a.providerId.localeCompare(b.providerId));
    const attempts=ordered.slice(0,Math.min(Math.max(1,policy.maxProviderAttempts??2),2)); const observations:CapabilityObservationRecord[]=[]; const tried:string[]=[];
    for(const provider of attempts){tried.push(provider.providerId);const start=Date.now();try{const native=await provider.executeNative(input);const output=validateWebSearchOutput(provider.adaptToCanonical(native));const latency=Math.max(0,Date.now()-start);const observation=createObservationRecord({observationId:`${requestId}:${provider.providerId}`,capabilityId:"web.search",providerId:provider.providerId,observedAt:this.clock.now().toISOString(),executionMode:"external",source:"execution",requestFingerprint:deriveRequestFingerprint("web.search",input),transport:{attempted:true,reached:true,latencyMs:latency},execution:{attempted:true,succeeded:true},canonicalOutput:output?{evaluated:true,succeeded:true}:{evaluated:true,succeeded:false,incompatibilityCategory:"canonical_incompatible"}});observations.push(observation);if(!output)continue;return snap({ok:true,requestId,providerId:provider.providerId,output,observations,accounting:{requestId,capabilityId:"web.search",selectedProvider:provider.providerId,attemptedProviders:tried,providerQuotedCostUsd:provider.quotedCostUsd,paymentStatus:"NOT_ENABLED",executionStatus:"SUCCEEDED",timestamp:now}});}catch(error){const category=failureCategory(error);observations.push(createObservationRecord({observationId:`${requestId}:${provider.providerId}`,capabilityId:"web.search",providerId:provider.providerId,observedAt:this.clock.now().toISOString(),executionMode:"external",source:"execution",requestFingerprint:deriveRequestFingerprint("web.search",input),transport:{attempted:true,reached:false,latencyMs:Math.max(0,Date.now()-start)},execution:{attempted:true,succeeded:false,failureCategory:category},canonicalOutput:{evaluated:false}}));if(category==="payment_required")return publicFailure(requestId,"PAYMENT_REQUIRED_BY_PROVIDER",tried,now,observations);}}
    return publicFailure(requestId,observations.some(x=>x.canonicalOutput.evaluated)?"CANONICAL_OUTPUT_INVALID":"PROVIDER_EXECUTION_FAILED",tried,now,observations);
  }
}
/** Generic deterministic HTTP boundary. Local HTTP is opt-in for tests; production callers must use public HTTPS endpoints. */
export async function executeWebSearchHttp(url:string,input:WebSearchInput,options:{allowLocalHttp?:boolean;timeoutMs?:number;maxBytes?:number;credential?:string}={}):Promise<unknown>{const target=new URL(url);if(!(options.allowLocalHttp&&target.protocol==="http:")&&target.protocol!=="https:")throw new Error("unsafe provider URL");const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.min(options.timeoutMs??5000,10000));try{const response=await fetch(target,{method:"POST",redirect:"error",signal:controller.signal,headers:{"content-type":"application/json",...(options.credential?{authorization:options.credential}:{})},body:JSON.stringify(input)});if(response.status===402)throw {status:402};if(!response.ok)throw new Error("provider failed");const body=await response.arrayBuffer();if(body.byteLength>Math.min(options.maxBytes??262144,1048576))throw new Error("provider response too large");return JSON.parse(new TextDecoder().decode(body));}finally{clearTimeout(timer);}}
