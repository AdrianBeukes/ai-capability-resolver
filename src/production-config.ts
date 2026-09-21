import type { GatewayPaymentConfig } from "./gateway-payment.js";
export type RuntimeMode="development"|"test"|"production";
export type ProductionConfig=Readonly<{mode:RuntimeMode; port:number; payment:GatewayPaymentConfig; treasuryMode:string; treasuryDestinationDescription?:string}>;
const bool=(x:string|undefined)=>x==="true";
const required=(env:NodeJS.ProcessEnv,n:string)=>{const v=env[n];if(!v)throw new Error(`Missing ${n}`);return v;};
const atomic=(x:string,n:string)=>{if(!/^([1-9]\d*|0)$/.test(x))throw new Error(`${n} must be an atomic integer`);return x;};
export function loadProductionConfig(env:NodeJS.ProcessEnv=process.env):ProductionConfig{
 const mode=(env.RUNTIME_MODE??"development") as RuntimeMode;if(!["development","test","production"].includes(mode))throw new Error("RUNTIME_MODE is invalid");
 const enabled=bool(env.GATEWAY_PAYMENT_ENABLED); const publicBaseUrl=env.PUBLIC_BASE_URL??(mode==="production"?"":"http://localhost:3000");
 if(mode==="production"&&!publicBaseUrl.startsWith("https://"))throw new Error("PUBLIC_BASE_URL must be HTTPS in production");
 const payment:GatewayPaymentConfig={enabled,priceAtomic:enabled?atomic(required(env,"GATEWAY_PRICE_ATOMIC"),"GATEWAY_PRICE_ATOMIC"):"0",network:enabled?required(env,"GATEWAY_PAYMENT_NETWORK"):"local",asset:enabled?required(env,"GATEWAY_PAYMENT_ASSET"):"local",payTo:enabled?required(env,"GATEWAY_PAY_TO"):"disabled",scheme:env.X402_SCHEME??"exact",publicBaseUrl,serviceName:env.SERVICE_NAME??"AI Capability Gateway",serviceVersion:env.SERVICE_VERSION??"0.1.0",facilitatorUrl:env.X402_FACILITATOR_URL};
 if(enabled&&mode==="production"&&!payment.facilitatorUrl)throw new Error("X402_FACILITATOR_URL is required in production paid mode"); if(payment.facilitatorUrl){const u=new URL(payment.facilitatorUrl);if(u.protocol!=="https:")throw new Error("X402_FACILITATOR_URL must be HTTPS");}
 const max=env.GATEWAY_MAX_PROVIDER_COST_ATOMIC;if(max){atomic(max,"GATEWAY_MAX_PROVIDER_COST_ATOMIC");if(env.PROVIDER_COST_ASSET===payment.asset&&env.PROVIDER_COST_NETWORK===payment.network&&BigInt(max)>BigInt(payment.priceAtomic))throw new Error("Provider maximum cost exceeds gateway charge");}
 return {mode,port:Number(env.PORT??3000),payment:{...payment,maxProviderCostAtomic:max,providerCostAsset:env.PROVIDER_COST_ASSET,providerCostNetwork:env.PROVIDER_COST_NETWORK},treasuryMode:env.TREASURY_MODE??"manual",treasuryDestinationDescription:env.TREASURY_DESTINATION_DESCRIPTION};
}
