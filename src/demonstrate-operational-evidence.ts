import { deriveContractFingerprint, deriveEvidenceMeasurements, ObservationLedger } from "./observation-ledger.js";
import { assessOperationalEvidence } from "./operational-evidence.js";

const AS_OF = "2026-09-17T12:00:00.000Z";
const record=(id:string, providerId:string, patch:Record<string,unknown>={})=>({observationId:id,capabilityId:"web.search",providerId,observedAt:"2026-09-17T11:00:00.000Z",executionMode:"external" as const,source:"fixture" as const,contractFingerprint:"v1",transport:{attempted:true,reached:true,latencyMs:10},execution:{attempted:true,succeeded:true},canonicalOutput:{evaluated:true,succeeded:true},...patch});
const assessment=(rows:Record<string,unknown>[], providerId:string, requirement:Record<string,unknown>={})=>{const ledger=new ObservationLedger();ledger.appendMany(rows as never);const mode=(rows[0]?.executionMode as "external"|"simulated"|undefined);const window=ledger.select({capabilityId:"web.search",providerId,executionMode:mode});return assessOperationalEvidence(window,deriveEvidenceMeasurements(window),{asOf:AS_OF,...requirement});};
const executions=(provider:string,n:number)=>Array.from({length:n},(_,i)=>record(`${provider}-${i}`,provider,{execution:{attempted:true,succeeded:i%4!==3},canonicalOutput:{evaluated:true,succeeded:i%4!==3}}));
const show=(label:string, value:ReturnType<typeof assessment>)=>console.log(label,{status:value.status,reasons:value.reasonCodes,attempts:value.evidenceSummary.executionAttempts,ratio:value.evidenceSummary.executionSuccessRatio});

console.log("Phase 11B operational evidence assessment (offline synthetic fixtures only)");
const small=assessment(executions("small",4),"small",{minimumExecutionAttempts:20});
const large=assessment(executions("large",100),"large",{minimumExecutionAttempts:20});
show("A. 3/4 same ratio, small sample",small); show("A. 75/100 same ratio, large sample",large);
show("B. stale evidence",assessment(executions("stale",20).map(x=>({...x,observedAt:"2026-09-16T00:00:00.000Z"})),"stale",{minimumExecutionAttempts:20,maximumNewestObservationAgeMs:3_600_000}));
const v2=deriveContractFingerprint({version:2})!; const changed=[...executions("changed",20),...executions("changed",2).map((x,i)=>({...x,observationId:`v2-${i}`,contractFingerprint:v2}))];
show("C. contract change combined",assessment(changed,"changed",{requireSingleKnownContractFingerprint:true,minimumExecutionAttempts:10}));
show("C. v2-only independent",assessment(changed.filter(x=>x.contractFingerprint===v2),"changed",{requireSingleKnownContractFingerprint:true,minimumExecutionAttempts:10}));
show("D. simulated under external requirement",assessment(executions("sim",30).map(x=>({...x,executionMode:"simulated"})),"sim",{requireExternalMode:true}));
const quotes=Array.from({length:100},(_,i)=>record(`quote-${i}`,"quote",{execution:{attempted:false},canonicalOutput:{evaluated:false},payment:{applicable:true,quoteObserved:true,quoteMatched:true}}));
show("E. quote-only under execution requirement",assessment(quotes,"quote",{minimumExecutionAttempts:1}));
