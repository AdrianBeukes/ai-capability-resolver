import type { LanguageModel } from "./language-model.js";

export interface ExecutionPolicy {
  maxPriceUsd?: number;
  minReliability?: number;
  maxLatencyMs?: number;
}

export interface ToolDescription {
  name: string;
  description: string;
  version: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
}

export interface ToolCallResult {
  tool: string;
  providerId: string;
  output: Record<string, unknown>;
  routing?: Record<string, unknown>;
}

export interface NoEligibleProviderResult {
  status: "no_eligible_provider";
  capability: string;
  policy: ExecutionPolicy;
  rejectedProviders: Array<{ providerId: string; reasons: string[] }>;
}

export interface AgentTrace {
  discoveredTools: ToolDescription[];
  decision: { tool: string; arguments: Record<string, unknown> };
  result: ToolCallResult | NoEligibleProviderResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CapabilityAgentClient {
  constructor(private readonly resolverUrl: string, private readonly languageModel: LanguageModel) {}

  async listTools(): Promise<ToolDescription[]> {
    const response = await fetch(new URL("/tools", this.resolverUrl));
    if (!response.ok) throw new Error(`Tool listing failed with HTTP ${response.status}.`);
    const body = await response.json() as { tools: ToolDescription[] };
    return body.tools;
  }

  async inspectTool(name: string): Promise<ToolDescription> {
    const response = await fetch(new URL(`/tools/${encodeURIComponent(name)}`, this.resolverUrl));
    if (!response.ok) throw new Error(`Tool inspection failed with HTTP ${response.status}.`);
    return (await response.json() as { tool: ToolDescription }).tool;
  }

  async callTool(name: string, arguments_: Record<string, unknown>, policy?: ExecutionPolicy): Promise<ToolCallResult | NoEligibleProviderResult> {
    const response = await fetch(new URL("/tools/call", this.resolverUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, arguments: arguments_, policy })
    });
    const body = await response.json() as { result?: ToolCallResult | NoEligibleProviderResult };
    if (response.status === 422 && body.result && "status" in body.result) return body.result as NoEligibleProviderResult;
    if (!response.ok || !body.result) throw new Error(`Tool call failed with HTTP ${response.status}.`);
    return body.result as ToolCallResult;
  }

  async runTask(task: string, policy?: ExecutionPolicy): Promise<ToolCallResult | NoEligibleProviderResult> {
    return (await this.runTaskWithTrace(task, policy)).result;
  }

  async runTaskWithTrace(task: string, policy?: ExecutionPolicy): Promise<AgentTrace> {
    const discoveredTools = await this.listTools();
    const rawDecision = await this.languageModel.generate({ task, tools: discoveredTools });
    const decision = this.parseDecision(rawDecision, discoveredTools);
    const tool = await this.inspectTool(decision.tool);
    this.validateArguments(decision.arguments, tool.inputSchema);
    const result = await this.callTool(tool.name, decision.arguments, policy);
    return { discoveredTools, decision, result };
  }

  private parseDecision(rawDecision: string, discoveredTools: ToolDescription[]): { tool: string; arguments: Record<string, unknown> } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDecision);
    } catch {
      throw new Error("Language model returned malformed JSON.");
    }
    if (!isRecord(parsed) || typeof parsed.tool !== "string" || !isRecord(parsed.arguments)) {
      throw new Error("Language model response must contain a string tool and object arguments.");
    }
    if (!discoveredTools.some((tool) => tool.name === parsed.tool)) {
      throw new Error(`Language model selected unavailable tool '${parsed.tool}'.`);
    }
    return { tool: parsed.tool, arguments: parsed.arguments };
  }

  private validateArguments(arguments_: Record<string, unknown>, inputSchema: Record<string, string>): void {
    for (const [field, type] of Object.entries(inputSchema)) {
      if (!(field in arguments_)) throw new Error(`Language model omitted required argument '${field}'.`);
      const value = arguments_[field];
      const expectsNumber = type === "number";
      if ((expectsNumber && (typeof value !== "number" || !Number.isFinite(value))) || (!expectsNumber && typeof value !== "string")) {
        throw new Error(`Language model supplied an invalid '${field}' argument.`);
      }
    }
    for (const field of Object.keys(arguments_)) {
      if (!(field in inputSchema)) throw new Error(`Language model supplied unknown argument '${field}'.`);
    }
  }
}
