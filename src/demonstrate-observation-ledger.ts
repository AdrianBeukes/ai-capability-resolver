import { ObservationLedger, assessEvidenceSufficiency, deriveContractFingerprint, deriveEvidenceMeasurements, deriveRequestFingerprint } from "./observation-ledger.js";

const ledger = new ObservationLedger();
const contractA = deriveContractFingerprint({ operation: "search", request: { query: "string" }, version: 1 })!;
const contractB = deriveContractFingerprint({ operation: "search", request: { query: "string", limit: "integer" }, version: 2 })!;
const privateRequest = { query: "private customer search 12345", limit: 5 };
const requestFingerprint = deriveRequestFingerprint("web.search", privateRequest);
ledger.appendMany([
 { observationId:"quote-kadec0",capabilityId:"web.search",providerId:"fixture:kadec0",resourceId:"fixture://kadec0",observedAt:"2026-09-17T00:00:00.000Z",executionMode:"external",source:"fixture",contractFingerprint:contractA,requestFingerprint,transport:{attempted:true,reached:true,status:402,latencyMs:30},execution:{attempted:false},canonicalOutput:{evaluated:false},payment:{applicable:true,quoteObserved:true,quoteMatched:true} },
 { observationId:"sim-1",capabilityId:"web.search",providerId:"fixture:sim",observedAt:"2026-09-17T01:00:00.000Z",executionMode:"simulated",source:"fixture",transport:{attempted:true,reached:true,latencyMs:2},execution:{attempted:true,succeeded:true},canonicalOutput:{evaluated:true,succeeded:true} },
 ...[true,true,false,true].map((succeeded,index)=>({ observationId:`external-${index+1}`,capabilityId:"web.search",providerId:"fixture:external",observedAt:`2026-09-17T0${2+index}:00:00.000Z`,executionMode:"external" as const,source:"fixture" as const,contractFingerprint:index===3?contractB:contractA,transport:{attempted:true,reached:true,status:200,latencyMs:10+index},execution:{attempted:true,succeeded},canonicalOutput:{evaluated:true,succeeded} }))
]);
const quote = deriveEvidenceMeasurements(ledger.select({capabilityId:"web.search",providerId:"fixture:kadec0"}));
const simulated = deriveEvidenceMeasurements(ledger.select({capabilityId:"web.search",providerId:"fixture:sim",executionMode:"simulated"}));
const externalWindow = ledger.select({capabilityId:"web.search",providerId:"fixture:external"});
const external = deriveEvidenceMeasurements(externalWindow);
console.log("Phase 11A observation ledger (offline fixtures only)");
console.log("kadec0-like quote-only (reconstructed offline fixture)", { quote: quote.quoteObservations, match: quote.quoteMatches, executionAttempts: quote.executionAttempts });
console.log("SIMULATED window", { total: simulated.totalObservations, executionAttempts: simulated.executionAttempts });
console.log("SYNTHETIC TEST DATA external", { executionAttempts: external.executionAttempts, executionSuccesses: external.executionSuccesses, executionFailures: external.executionFailures, executionSuccessRatio: external.executionSuccessRatio });
console.log("mixed contracts", { mixedContracts: externalWindow.mixedContracts, sufficient: assessEvidenceSufficiency(externalWindow,{requireSingleContractFingerprint:true}).sufficient });
console.log("privacy-safe request fingerprint", { fingerprint: requestFingerprint, structuralOnly: true, containsRawQuery: requestFingerprint.includes(privateRequest.query) });
