import { providers } from "./providers.js";
import { rankProviders } from "./ranking.js";
import { CURRENCY_CONVERSION, type CapabilityId, type CurrencyConversionInput, type ExecutionPolicy, type ExecutionRequest, type Provider, type ProviderResolution, type ProviderRoutingSummary, type RejectedProvider } from "./types.js";

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

function summary(provider: Provider): ProviderRoutingSummary {
  return { providerId: provider.id, priceUsd: provider.price, reliability: provider.reliability, estimatedLatencyMs: provider.estimatedLatencyMs };
}

export function resolveProvider(capability: CapabilityId, policy: ExecutionPolicy = {}, availableProviders: readonly Provider[] = providers): ProviderResolution {
  const supported = availableProviders.filter((candidate) => candidate.manifests.some((manifest) => manifest.capability.id === capability));
  const rejectedProviders: RejectedProvider[] = [];
  const eligible: Provider[] = [];
  for (const provider of supported) {
    const reasons: RejectedProvider["reasons"] = [];
    if (policy.maxPriceUsd !== undefined && provider.price > policy.maxPriceUsd) reasons.push("price_exceeds_maximum");
    if (policy.minReliability !== undefined && provider.reliability < policy.minReliability) reasons.push("reliability_below_minimum");
    if (policy.maxLatencyMs !== undefined && provider.estimatedLatencyMs > policy.maxLatencyMs) reasons.push("latency_exceeds_maximum");
    if (reasons.length) rejectedProviders.push({ ...summary(provider), reasons }); else eligible.push(provider);
  }
  const ranked = rankProviders(eligible);
  if (!ranked[0]) return { status: "no_eligible_provider", capability, policy, rejectedProviders };
  return { status: "eligible_provider", capability, policy, selectedProvider: summary(ranked[0]), eligibleProviders: ranked.map(summary), rejectedProviders };
}

export function selectProvider(capability: CapabilityId, availableProviders: readonly Provider[] = providers, policy: ExecutionPolicy = {}): Provider {
  const resolution = resolveProvider(capability, policy, availableProviders);
  const provider = resolution.status === "eligible_provider"
    ? availableProviders.find((candidate) => candidate.id === resolution.selectedProvider.providerId)
    : undefined;

  if (!provider) throw new Error(`No eligible provider is available for ${capability}.`);
  return provider;
}

export function resolveRequest(request: string, availableProviders: readonly Provider[] = providers, policy: ExecutionPolicy = {}): ExecutionRequest {
  const input = parseCurrencyConversionRequest(request);
  if (!input) {
    throw new Error("No supported capability matches this request.");
  }

  const provider = selectProvider(CURRENCY_CONVERSION, availableProviders, policy);

  return { capability: CURRENCY_CONVERSION, providerId: provider.id, input };
}
