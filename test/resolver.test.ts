import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequest } from "../src/resolver.js";

test("resolves a USD to ZAR request to the best mock provider", () => {
  assert.deepEqual(resolveRequest("Convert 100 USD to ZAR"), {
    capability: "currency_conversion",
    providerId: "swift-fx",
    input: { amount: 100, from: "USD", to: "ZAR" }
  });
});

test("rejects an unsupported natural-language request", () => {
  assert.throws(() => resolveRequest("Summarize this document"), /No supported capability/);
});
