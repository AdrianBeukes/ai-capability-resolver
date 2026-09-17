import { ObservationLedger, deriveEvidenceMeasurements } from "./observation-ledger.js";
import { assessOperationalEvidence } from "./operational-evidence.js";
import { assessOperationalAcceptance } from "./operational-acceptance.js";

const AS_OF="2026-09-17T12:00:00.000Z";
const row=(id:string, providerId:string, patch:Record<string,unknown>={})=>({observationId:id,capabilityId:"web.search",providerId,observedAt:"2026-09-17T11:00:00.000Z",executionMode:"external" as const,source:"fixture" as const,contractFingerprint:"v1",transport:{attempted:true,reached:true,latencyMs:800},execution:{attempted:true,succeeded:true},canonicalOutput:{evaluated:true,succeeded:true},...patch});
const assess=(label:string, rows:Record<string,unknown>[], requirement:Record<string,unknown>, criteria:Record<string,unknown>)=>{const ledger=new ObservationLedger();ledger.appendMany(rows as never);const window=ledger.select({capabilityId:"web.search",providerId:rows[0]?.providerId as string});const evidence=assessOperationalEvidence(window,deriveEvidenceMeasurements(window),{asOf:AS_OF,...requirement});const result=assessOperationalAcceptance({evidenceAssessment:evidence,criteria});console.log(label,{status:result.status,reasons:result.reasonCodes,criteria:result.criterionResults});};
const rows=(provider:string,n:number, patch:(i:number)=>Record<string,unknown>=()=>({}))=>Array.from({length:n},(_,i)=>row(`${provider}-${i}`,provider,patch(i)));
console.log("Phase 11C caller-defined operational acceptance (offline synthetic fixtures only)");
assess("A. insufficient evidence",rows("small",4,i=>({execution:{attempted:true,succeeded:i<3}})),{minimumExecutionAttempts:20},{minimumExecutionSuccessRatio:.70});
const sufficient=rows("sufficient",100,i=>({execution:{attempted:true,succeeded:i<97},canonicalOutput:{evaluated:true,succeeded:i<99}}));
assess("B. accepted",sufficient,{minimumExecutionAttempts:20,minimumCanonicalEvaluations:20,minimumTransportLatencySamples:1},{minimumExecutionSuccessRatio:.95,minimumCanonicalSuccessRatio:.98,maximumMeanTransportLatencyMs:1000});
assess("C. rejected by stricter caller",sufficient,{minimumExecutionAttempts:20,minimumCanonicalEvaluations:20,minimumTransportLatencySamples:1},{minimumExecutionSuccessRatio:.99,minimumCanonicalSuccessRatio:.995,maximumMeanTransportLatencyMs:500});
assess("D. canonical failure",rows("canonical",100,i=>({canonicalOutput:{evaluated:true,succeeded:i<80}})),{minimumExecutionAttempts:100,minimumCanonicalEvaluations:100},{minimumExecutionSuccessRatio:.99,minimumCanonicalSuccessRatio:.95});
assess("E. missing latency",rows("missing",20,()=>({transport:{attempted:true},canonicalOutput:{evaluated:false}})),{minimumExecutionAttempts:20},{maximumMeanTransportLatencyMs:1000});
assess("F. mean versus maximum latency",[100,100,100,2000].map((latencyMs,i)=>row(`latency-${i}`,"latency",{transport:{attempted:true,latencyMs}})),{minimumTransportLatencySamples:4},{maximumMeanTransportLatencyMs:600,maximumMaxTransportLatencyMs:1500});
