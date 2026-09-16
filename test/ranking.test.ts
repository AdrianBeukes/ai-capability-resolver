import assert from "node:assert/strict";
import test from "node:test";
import { providers } from "../src/providers.js";
import { providerScore, rankProviders } from "../src/ranking.js";

test("ranks providers deterministically by reliability, price, and latency", () => {
  const ranked = rankProviders(providers.filter((provider) => provider.manifests.some((manifest) => manifest.capability.id === "unit_conversion")));
  assert.deepEqual(ranked.map((provider) => provider.id), ["precise-units", "value-units"]);
  assert.ok(providerScore(ranked[0]) > providerScore(ranked[1]));
});
