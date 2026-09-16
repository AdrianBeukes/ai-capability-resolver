import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "../src/executor.js";

test("executes a local conversion using fixed mock/test data", () => {
  const result = execute({
    capability: "currency_conversion",
    providerId: "swift-fx",
    input: { amount: 100, from: "USD", to: "ZAR" }
  });

  assert.deepEqual(result, {
    providerId: "swift-fx",
    capability: "currency_conversion",
    input: { amount: 100, from: "USD", to: "ZAR" },
    rate: 18.5,
    result: 1850,
    dataSource: "mock/test data"
  });
});

test("rejects a conversion without configured mock/test data", () => {
  assert.throws(
    () => execute({ capability: "currency_conversion", providerId: "swift-fx", input: { amount: 1, from: "USD", to: "EUR" } }),
    /No mock\/test exchange rate/
  );
});
