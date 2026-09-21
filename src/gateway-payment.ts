import { createHash } from "node:crypto";
import { encodeX402, decodeX402, isPaymentPayload, type PaymentPayload, type PaymentRequired, type PaymentRequirements } from "./x402.js";

export type GatewayPaymentState = "NOT_REQUIRED"|"REQUIRED"|"VERIFIED"|"SETTLED"|"FAILED"|"NOT_ENABLED";
export type GatewayPaymentConfig = Readonly<{ enabled:boolean; priceAtomic:string; network:string; asset:string; payTo:string; scheme:string; publicBaseUrl:string; serviceName:string; serviceVersion:string; facilitatorUrl?:string; maxProviderCostAtomic?:string; providerCostAsset?:string; providerCostNetwork?:string }>;
export type Verification = Readonly<{ valid:boolean; reference?:string }>;
export type Settlement = Readonly<{ settled:boolean; reference?:string }>;
export interface GatewayPaymentVerifier { verify(requirement:PaymentRequirements, proof:PaymentPayload):Promise<Verification>; settle(requirement:PaymentRequirements, proof:PaymentPayload):Promise<Settlement>; }
const same=(a:PaymentRequirements,b:PaymentRequirements)=>a.scheme===b.scheme&&a.network===b.network&&a.asset===b.asset&&a.payTo===b.payTo&&a.amount===b.amount;
export function requirement(config:GatewayPaymentConfig):PaymentRequirements { return {scheme:config.scheme,network:config.network,asset:config.asset,payTo:config.payTo,amount:config.priceAtomic,maxTimeoutSeconds:300,extra:{resource:"/v1/execute"}}; }
export function challenge(config:GatewayPaymentConfig):PaymentRequired { return {x402Version:2,resource:{url:`${config.publicBaseUrl}/v1/execute`,description:"Paid canonical web.search execution",mimeType:"application/json",serviceName:config.serviceName},accepts:[requirement(config)],extensions:{serviceVersion:config.serviceVersion}}; }
export function readProof(raw:string|undefined):PaymentPayload|undefined { if(!raw) return; try { const p=decodeX402(raw); return isPaymentPayload(p)?p:undefined; } catch { return; } }
/** Offline-only verifier. It validates all requirement bindings and consumes each deterministic authorization once. */
export class LocalGatewayPaymentVerifier implements GatewayPaymentVerifier {
  private readonly used=new Set<string>();
  async verify(r:PaymentRequirements,p:PaymentPayload):Promise<Verification>{
    const auth=(p.payload.simulation as Record<string,unknown>|undefined)?.authorization;
    const resource=(p.resource as {url?:unknown}|undefined)?.url;
    if(!same(r,p.accepted)||resource!=="/v1/execute"||typeof auth!=="string"||!auth.startsWith("LOCAL:"))return {valid:false};
    const ref=createHash("sha256").update(auth).digest("hex").slice(0,24);
    if(this.used.has(ref))return {valid:false}; this.used.add(ref); return {valid:true,reference:ref};
  }
  async settle(_r:PaymentRequirements,_p:PaymentPayload):Promise<Settlement>{ return {settled:true,reference:"local-settlement"}; }
}
export function paymentHeaders(config:GatewayPaymentConfig):Record<string,string>{return {"payment-required":encodeX402(challenge(config)),"x402-version":"2"};}
export function paymentResponse(reference:string|undefined):string{return encodeX402({success:true,transaction:reference??"accepted",network:"local",extensions:{simulation:true}});}
