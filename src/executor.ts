import { providers } from "./providers.js";
import { CURRENCY_CONVERSION, type CurrencyConversionInput, type ExecutionRequest, type Provider } from "./types.js";

// Fixed mock/test data only. This is deliberately not a live exchange rate.
const mockRates: Readonly<Record<string, number>> = {
  "USD:ZAR": 18.5,
  "ZAR:USD": 1 / 18.5
};

export interface ExecutionResult {
  providerId: string;
  capability: typeof CURRENCY_CONVERSION;
  input: CurrencyConversionInput;
  rate: number;
  result: number;
  dataSource: "mock/test data";
}

export function execute(request: ExecutionRequest, availableProviders: readonly Provider[] = providers): ExecutionResult {
  if (request.capability !== CURRENCY_CONVERSION) {
    throw new Error(`Unsupported capability: ${request.capability}`);
  }

  const provider = availableProviders.find((candidate) => candidate.id === request.providerId);
  if (!provider || !provider.manifests.some((manifest) => manifest.capability.id === CURRENCY_CONVERSION)) {
    throw new Error("Provider cannot execute currency_conversion.");
  }

  const rate = mockRates[`${request.input.from}:${request.input.to}`];
  if (!rate) {
    throw new Error(`No mock/test exchange rate for ${request.input.from} to ${request.input.to}.`);
  }

  return {
    providerId: provider.id,
    capability: CURRENCY_CONVERSION,
    input: request.input,
    rate,
    result: Number((request.input.amount * rate).toFixed(2)),
    dataSource: "mock/test data"
  };
}
