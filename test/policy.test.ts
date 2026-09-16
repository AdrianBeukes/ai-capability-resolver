import assert from "node:assert/strict";
import test from "node:test";
import { resolveProvider } from "../src/resolver.js";
import { providers } from "../src/providers.js";

test("no policy preserves the normal highest-ranked provider", () => {
  const resolution = resolveProvider("currency_conversion", {}, providers);
  assert.equal(resolution.status, "eligible_provider");
  if (resolution.status === "eligible_provider") assert.equal(resolution.selectedProvider.providerId, "swift-fx");
});

test("price policy changes currency routing", () => {
  const resolution = resolveProvider("currency_conversion", { maxPriceUsd: 0.01 }, providers);
  assert.equal(resolution.status, "eligible_provider");
  if (resolution.status === "eligible_provider") {
    assert.equal(resolution.selectedProvider.providerId, "value-fx");
    assert.deepEqual(resolution.rejectedProviders, [{ providerId: "swift-fx", priceUsd: 0.05, reliability: 0.99, estimatedLatencyMs: 200, reasons: ["price_exceeds_maximum"] }]);
  }
});

test("reliability and latency policies filter before ranking", () => {
  const reliability = resolveProvider("unit_conversion", { minReliability: 0.99 }, providers);
  assert.equal(reliability.status, "eligible_provider");
  if (reliability.status === "eligible_provider") {
    assert.equal(reliability.selectedProvider.providerId, "precise-units");
    assert.deepEqual(reliability.rejectedProviders[0].reasons, ["reliability_below_minimum"]);
  }
  const latency = resolveProvider("currency_conversion", { maxLatencyMs: 300 }, providers);
  assert.equal(latency.status, "eligible_provider");
  if (latency.status === "eligible_provider") {
    assert.equal(latency.selectedProvider.providerId, "swift-fx");
    assert.deepEqual(latency.rejectedProviders[0].reasons, ["latency_exceeds_maximum"]);
  }
});

test("an impossible policy returns all rejection reasons without selecting a provider", () => {
  const resolution = resolveProvider("currency_conversion", { maxPriceUsd: 0.001, minReliability: 0.999, maxLatencyMs: 100 }, providers);
  assert.deepEqual(resolution, {
    status: "no_eligible_provider",
    capability: "currency_conversion",
    policy: { maxPriceUsd: 0.001, minReliability: 0.999, maxLatencyMs: 100 },
    rejectedProviders: [
      { providerId: "swift-fx", priceUsd: 0.05, reliability: 0.99, estimatedLatencyMs: 200, reasons: ["price_exceeds_maximum", "reliability_below_minimum", "latency_exceeds_maximum"] },
      { providerId: "value-fx", priceUsd: 0.01, reliability: 0.96, estimatedLatencyMs: 500, reasons: ["price_exceeds_maximum", "reliability_below_minimum", "latency_exceeds_maximum"] }
    ]
  });
});
