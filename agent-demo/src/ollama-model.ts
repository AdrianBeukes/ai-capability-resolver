import type { LanguageModel, LanguageModelRequest } from "./language-model.js";

/** Minimal adapter for a locally running Ollama server; no SDK or API key is used. */
export class OllamaLanguageModel implements LanguageModel {
  constructor(private readonly model: string, private readonly baseUrl = "http://localhost:11434") {}

  async generate(request: LanguageModelRequest): Promise<string> {
    const prompt = [
      "Select exactly one tool for the user task using only the supplied tool metadata.",
      "Return only valid JSON matching {\"tool\": string, \"arguments\": object}; do not use Markdown.",
      "Honor documented schema constraints and faithfully represent information from the user task; do not invent or substitute argument values.",
      `USER TASK: ${request.task}`,
      `TOOLS: ${JSON.stringify(request.tools)}`
    ].join("\n\n");
    const response = await fetch(new URL("/api/generate", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false, format: "json" })
    });
    if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}.`);
    const body = await response.json() as { response?: unknown };
    if (typeof body.response !== "string") throw new Error("Local model did not return a text response.");
    return body.response;
  }
}
