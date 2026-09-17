import { observeSimulatedWebSearch, type SimulatedExecutionFixture } from "./observed-capability.js";

const fixtures: Record<string, SimulatedExecutionFixture> = {
  direct: { providerId:"fixture-direct", resourceId:"simulated://direct", observedAt:"2026-09-17T00:00:00.000Z", canonicalInput:{query:"OpenAI"}, nativeInput:{query:"OpenAI"}, httpStatus:200, contentType:"application/json", body:{results:[{url:"https://openai.com",title:"OpenAI"}]}, semanticStatus:"possible" },
  adapted: { providerId:"fixture-organic", resourceId:"simulated://organic", observedAt:"2026-09-17T00:00:01.000Z", canonicalInput:{query:"OpenAI"}, nativeInput:{q:"OpenAI"}, httpStatus:200, contentType:"application/json", body:{organic:[{link:"https://openai.com",title:"OpenAI",description:"AI research"}]}, semanticStatus:"possible" },
  incompatible: { providerId:"fixture-answer", resourceId:"simulated://answer", observedAt:"2026-09-17T00:00:02.000Z", canonicalInput:{query:"OpenAI"}, nativeInput:{q:"OpenAI"}, httpStatus:200, contentType:"application/json", body:{answer:"OpenAI is an AI company"}, semanticStatus:"possible" },
  scoped: { providerId:"fixture-twitter", resourceId:"simulated://twitter", observedAt:"2026-09-17T00:00:03.000Z", canonicalInput:{query:"OpenAI"}, nativeInput:{q:"OpenAI"}, httpStatus:200, contentType:"application/json", body:{results:[{url:"https://x.com/openai",title:"OpenAI on X"}]}, semanticStatus:"rejected" }
};
for (const [name, fixture] of Object.entries(fixtures)) {
  const observation = observeSimulatedWebSearch(fixture);
  console.log(`\n${name} (SIMULATED)`);
  console.log(JSON.stringify({ advertisedEvidence:{ classification:fixture.semanticStatus, adapterPlan:"unchanged / absent" }, simulatedExecution:{ nativeInput:fixture.nativeInput, httpStatus:fixture.httpStatus }, observedResponseShape:observation.responseEvidence.responseShape, observedMapping:observation.canonicalExtraction.mappings, canonicalValidation:observation.canonicalValidation, outcome:observation.outcome }, null, 2));
}
