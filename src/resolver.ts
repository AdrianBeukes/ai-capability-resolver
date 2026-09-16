import { providers } from "./providers.js";
import { rankProviders } from "./ranking.js";
import { CURRENCY_CONVERSION, type CapabilityId, type CurrencyConversionInput, type ExecutionRequest, type Provider } from "./types.js";

const conversionPattern = /^convert\s+([0-9]+(?:\.[0-9]+)?)\s+([a-z]{3})\s+to\s+([a-z]{3})$/i;

export function parseCurrencyConversionRequest(request: string): CurrencyConversionInput | undefined {
  const match = conversionPattern.exec(request.trim());
  if (!match) return undefined;

  return {
    amount: Number(match[1]),
    from: match[2].toUpperCase(),
    to: match[3].toUpperCase()
  };
}

export function selectProvider(capability: CapabilityId, availableProviders: readonly Provider[] = providers): Provider {
  const provider = rankProviders(
    availableProviders.filter((candidate) => candidate.manifests.some((manifest) => manifest.capability.id === capability))
  )[0];

  if (!provider) throw new Error(`No provider is available for ${capability}.`);
  return provider;
}

export function resolveRequest(request: string, availableProviders: readonly Provider[] = providers): ExecutionRequest {
  const input = parseCurrencyConversionRequest(request);
  if (!input) {
    throw new Error("No supported capability matches this request.");
  }

  const provider = selectProvider(CURRENCY_CONVERSION, availableProviders);

  return { capability: CURRENCY_CONVERSION, providerId: provider.id, input };
}
