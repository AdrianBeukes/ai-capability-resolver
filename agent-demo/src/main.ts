import { CapabilityAgentClient } from "./client.js";
import { StaticLanguageModel } from "./mock-model.js";
import { OllamaLanguageModel } from "./ollama-model.js";

const resolverUrl = process.env.RESOLVER_URL ?? "http://localhost:3000";
const task = process.env.AGENT_TASK ?? "Convert 10 miles to kilometres";
const policy = process.env.EXECUTION_POLICY ? JSON.parse(process.env.EXECUTION_POLICY) : undefined;
const model = process.env.OLLAMA_MODEL
  ? new OllamaLanguageModel(process.env.OLLAMA_MODEL)
  : new StaticLanguageModel(JSON.parse(process.env.AGENT_DEMO_DECISION ?? '{"tool":"unit_conversion","arguments":{"value":10,"from":"mi","to":"km"}}'));
const trace = await new CapabilityAgentClient(resolverUrl, model).runTaskWithTrace(task, policy);

console.log(`USER:\n${task}\n`);
console.log(`DISCOVERED TOOLS:\n${trace.discoveredTools.map((tool) => tool.name).join("\n")}\n`);
console.log(`AI DECISION:\n${trace.decision.tool}\n`);
console.log(`ARGUMENTS:\n${Object.entries(trace.decision.arguments).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
console.log(`POLICY:\n${JSON.stringify(policy ?? {})}\n`);
if ("status" in trace.result) {
  console.log(`RESOLVER:\n${trace.result.status === "payment_required" ? "payment required" : "no eligible provider"}\n`);
  console.log(`RESULT:\n${JSON.stringify(trace.result)}`);
} else {
  console.log(`RESOLVER:\nselected provider = ${trace.result.providerId}\n`);
  console.log(`ROUTING:\n${JSON.stringify(trace.result.routing)}\n`);
  console.log(`RESULT:\n${JSON.stringify(trace.result.output)}`);
}
