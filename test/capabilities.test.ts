import assert from "node:assert/strict";
import test from "node:test";
import { discoverCapabilities } from "../src/capabilities.js";

test("discovers all locally available capabilities and providers", () => {
  assert.deepEqual(discoverCapabilities(), [
    { id: "currency_conversion", providers: ["swift-fx", "value-fx"] },
    { id: "unit_conversion", providers: ["precise-units", "value-units"] },
    { id: "text_statistics", providers: ["local-text-stats"] }
  ]);
});
