import type { Provider } from "./types.js";

// Higher is better. Reliability dominates; price and latency are penalties.
export function providerScore(provider: Provider): number {
  return provider.reliability * 100 - provider.price * 100 - provider.estimatedLatencyMs / 100;
}

export function rankProviders(providers: readonly Provider[]): Provider[] {
  return [...providers].sort((left, right) => {
    const scoreDifference = providerScore(right) - providerScore(left);
    return scoreDifference !== 0 ? scoreDifference : left.id.localeCompare(right.id);
  });
}
