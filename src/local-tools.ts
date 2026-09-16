import { execute } from "./executor.js";
import type { CapabilityId, Provider } from "./types.js";

export type ToolArguments = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseToolArguments(capability: CapabilityId, value: unknown): ToolArguments {
  if (!isRecord(value)) throw new Error("Tool arguments must be an object.");

  if (capability === "currency_conversion") {
    if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || typeof value.from !== "string" || typeof value.to !== "string") {
      throw new Error("Currency conversion requires a finite numeric amount and string from/to currency codes.");
    }
    return { amount: value.amount, from: value.from.toUpperCase(), to: value.to.toUpperCase() };
  }
  if (capability === "unit_conversion") {
    if (typeof value.value !== "number" || !Number.isFinite(value.value) || typeof value.from !== "string" || typeof value.to !== "string") {
      throw new Error("Unit conversion requires a finite numeric value and string from/to units.");
    }
    return { value: value.value, from: value.from, to: value.to };
  }
  if (typeof value.text !== "string") throw new Error("Text statistics requires a string text field.");
  return { text: value.text };
}

export function executeLocalTool(capability: CapabilityId, providerId: string, arguments_: ToolArguments, providers: readonly Provider[]): Record<string, unknown> {
  if (capability === "currency_conversion") {
    const input = arguments_ as { amount: number; from: string; to: string };
    const result = execute({ capability, providerId, input }, providers);
    return { result: result.result, currency: input.to, dataSource: result.dataSource };
  }
  if (capability === "unit_conversion") {
    const input = arguments_ as { value: number; from: string; to: string };
    if (input.from === "mi" && input.to === "km") return { value: Number((input.value * 1.60934).toFixed(4)), unit: "km", dataSource: "mock/test data" };
    if (input.from === "km" && input.to === "mi") return { value: Number((input.value / 1.60934).toFixed(4)), unit: "mi", dataSource: "mock/test data" };
    throw new Error(`No mock/test unit conversion for ${input.from} to ${input.to}.`);
  }

  const text = (arguments_ as { text: string }).text;
  return { wordCount: text.trim() === "" ? 0 : text.trim().split(/\s+/).length, characterCount: text.length, dataSource: "local deterministic data" };
}
