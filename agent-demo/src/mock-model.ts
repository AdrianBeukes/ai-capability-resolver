import type { LanguageModel, LanguageModelRequest } from "./language-model.js";

/** Offline-only model substitute for tests and the explicit demo mode. */
export class StaticLanguageModel implements LanguageModel {
  constructor(private readonly decision: unknown) {}

  async generate(_request: LanguageModelRequest): Promise<string> {
    return JSON.stringify(this.decision);
  }
}
