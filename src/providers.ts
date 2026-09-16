import { CURRENCY_CONVERSION, TEXT_STATISTICS, UNIT_CONVERSION, type Provider } from "./types.js";

export const localProviders: readonly Provider[] = [
  {
    id: "swift-fx",
    name: "Swift FX (mock)",
    manifests: [
      {
        capability: {
          id: CURRENCY_CONVERSION,
          name: "Currency conversion",
          description: "Converts a monetary amount between supported currency codes using local mock/test exchange-rate data.",
          version: "1.0.0",
          inputSchema: { amount: "number", from: "currency code", to: "currency code" },
          outputSchema: { result: "number", currency: "currency code" }
        },
        provider: { id: "swift-fx", name: "Swift FX (mock)" },
        pricing: { amount: 0.05, currency: "USD", unit: "per_request" },
        estimatedLatencyMs: 200,
        reliability: 0.99,
        endpoint: { method: "POST", path: "/execute", action: "currency_conversion" }
      }
    ],
    price: 0.05,
    estimatedLatencyMs: 200,
    reliability: 0.99
  },
  {
    id: "precise-units",
    name: "Precise Units (mock)",
    manifests: [{
      capability: {
        id: UNIT_CONVERSION,
        name: "Unit conversion",
        description: "Converts a numeric value between supported measurement units, including miles and kilometres.",
        version: "1.0.0",
        inputSchema: { value: "number", from: "unit code (mi or km)", to: "unit code (mi or km)" },
        outputSchema: { value: "number", unit: "unit code" }
      },
      provider: { id: "precise-units", name: "Precise Units (mock)" },
      pricing: { amount: 0.03, currency: "USD", unit: "per_request" },
      estimatedLatencyMs: 100,
      reliability: 0.995,
      endpoint: { method: "POST", path: "/execute", action: "unit_conversion" }
    }],
    price: 0.03,
    estimatedLatencyMs: 100,
    reliability: 0.995
  },
  {
    id: "value-units",
    name: "Value Units (mock)",
    manifests: [{
      capability: {
        id: UNIT_CONVERSION,
        name: "Unit conversion",
        description: "Converts a numeric value between supported measurement units, including miles and kilometres.",
        version: "1.0.0",
        inputSchema: { value: "number", from: "unit code (mi or km)", to: "unit code (mi or km)" },
        outputSchema: { value: "number", unit: "unit code" }
      },
      provider: { id: "value-units", name: "Value Units (mock)" },
      pricing: { amount: 0.01, currency: "USD", unit: "per_request" },
      estimatedLatencyMs: 300,
      reliability: 0.96,
      endpoint: { method: "POST", path: "/execute", action: "unit_conversion" }
    }],
    price: 0.01,
    estimatedLatencyMs: 300,
    reliability: 0.96
  },
  {
    id: "local-text-stats",
    name: "Local Text Statistics (mock)",
    manifests: [{
      capability: {
        id: TEXT_STATISTICS,
        name: "Text statistics",
        description: "Counts words and characters in supplied text using deterministic local rules.",
        version: "1.0.0",
        inputSchema: { text: "string" },
        outputSchema: { wordCount: "number", characterCount: "number" }
      },
      provider: { id: "local-text-stats", name: "Local Text Statistics (mock)" },
      pricing: { amount: 0.01, currency: "USD", unit: "per_request" },
      estimatedLatencyMs: 50,
      reliability: 0.99,
      endpoint: { method: "POST", path: "/execute", action: "text_statistics" }
    }],
    price: 0.01,
    estimatedLatencyMs: 50,
    reliability: 0.99
  },
  {
    id: "value-fx",
    name: "Value FX (mock)",
    manifests: [
      {
        capability: {
          id: CURRENCY_CONVERSION,
          name: "Currency conversion",
          description: "Converts a monetary amount between supported currency codes using local mock/test exchange-rate data.",
          version: "1.0.0",
          inputSchema: { amount: "number", from: "currency code", to: "currency code" },
          outputSchema: { result: "number", currency: "currency code" }
        },
        provider: { id: "value-fx", name: "Value FX (mock)" },
        pricing: { amount: 0.01, currency: "USD", unit: "per_request" },
        estimatedLatencyMs: 500,
        reliability: 0.96,
        endpoint: { method: "POST", path: "/execute", action: "currency_conversion" }
      }
    ],
    price: 0.01,
    estimatedLatencyMs: 500,
    reliability: 0.96
  }
];

// Backwards-compatible default registry data for direct unit tests.
export const providers = localProviders;
