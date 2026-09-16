import type { ToolDescription } from "./client.js";

export interface LanguageModelRequest {
  task: string;
  tools: ToolDescription[];
}

export interface LanguageModel {
  /** Returns one JSON object: { "tool": string, "arguments": object }. */
  generate(request: LanguageModelRequest): Promise<string>;
}
