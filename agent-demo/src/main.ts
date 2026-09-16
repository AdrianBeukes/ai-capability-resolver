import { CapabilityAgentClient } from "./client.js";
import { StaticLanguageModel } from "./mock-model.js";
import { OllamaLanguageModel } from "./ollama-model.js";

const resolverUrl = process.env.RESOLVER_URL ?? "http://localhost:3000";
const task = process.env.AGENT_TASK ?? "Convert 10 miles to kilometres";
const model = process.env.OLLAMA_MODEL
  ? new OllamaLanguageModel(process.env.OLLAMA_MODEL)
  : new StaticLanguageModel(JSON.parse(process.env.AGENT_DEMO_DECISION ?? '{"tool":"unit_conversion","arguments":{"value":10,"from":"mi","to":"km"}}'));
const trace = await new CapabilityAgentClient(resolverUrl, model).runTaskWithTrace(task);

console.log(`USER:\n${task}\n`);
console.log(`DISCOVERED TOOLS:\n${trace.discoveredTools.map((tool) => tool.name).join("\n")}\n`);
console.log(`AI DECISION:\n${trace.decision.tool}\n`);
console.log(`ARGUMENTS:\n${Object.entries(trace.decision.arguments).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
console.log(`RESOLVER:\nselected provider = ${trace.result.providerId}\n`);
console.log(`RESULT:\n${JSON.stringify(trace.result.output)}`);
