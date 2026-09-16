import assert from "node:assert/strict";
import test from "node:test";
import { decodeX402, encodeX402, isPaymentPayload, isPaymentRequired } from "../src/x402.js";
import { verifySimulatedPayment } from "../provider-demo/src/payment.js";

const requirement = { scheme: "exact", network: "eip155:84532", amount: "20000", asset: "simulation:usdc-base-sepolia", payTo: "simulation:independent-fx", maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2", simulation: true } } as const;
const required = { x402Version: 2, error: "PAYMENT-SIGNATURE header is required", resource: { url: "http://example.test/execute", description: "fixture", mimeType: "application/json", serviceName: "Fixture" }, accepts: [requirement], extensions: {} } as const;
const payload = { x402Version: 2, resource: required.resource, accepted: requirement, payload: { simulation: { authorization: "SIMULATED_AUTHORIZATION:20000", simulation: true } }, extensions: {} } as const;
const settlement = { success: true, transaction: "", network: "eip155:84532", amount: "20000", extensions: { simulation: true } } as const;
test("V2 x402 base64 transport preserves canonical fixtures exactly", () => { assert.deepEqual(decodeX402(encodeX402(required)), required); assert.deepEqual(decodeX402(encodeX402(payload)), payload); assert.deepEqual(decodeX402(encodeX402(settlement)), settlement); assert.equal(isPaymentRequired(required), true); assert.equal(isPaymentPayload(payload), true); });
test("V2 x402 runtime validation rejects malformed transports and envelopes", () => { assert.throws(() => decodeX402("%%%")); assert.throws(() => decodeX402("bm90LWpzb24=")); assert.equal(isPaymentRequired({ ...required, x402Version: 1 }), false); assert.equal(isPaymentRequired({ ...required, accepts: [{ ...requirement, amount: "0.02" }] }), false); assert.equal(isPaymentPayload({ ...payload, accepted: { ...requirement, network: "base-sepolia" } }), false); });
test("provider simulated verification binds a payload to the offered requirement", () => { assert.equal(verifySimulatedPayment(requirement, payload), true); for (const field of ["amount", "network", "asset", "payTo"] as const) { assert.equal(verifySimulatedPayment(requirement, { ...payload, accepted: { ...requirement, [field]: `tampered-${field}` } }), false); } });
