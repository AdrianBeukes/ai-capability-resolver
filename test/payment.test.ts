import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createAppServer } from "../src/app.js";
import { SimulatedPaymentClient, type PaymentClient, type PaymentProof, type PaymentRequirement } from "../src/payment.js";
import { createProviderRegistry } from "../src/registry.js";
import type { Provider } from "../src/types.js";
import { encodeX402, type PaymentPayload, type PaymentRequired } from "../src/x402.js";

const requirement: PaymentRequirement = { scheme: "exact", network: "eip155:84532", amount: "20000", asset: "simulation:usdc-base-sepolia", payTo: "simulation:paid-fx", maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2", simulation: true } };
const required: PaymentRequired = { x402Version: 2, error: "PAYMENT-SIGNATURE header is required", resource: { url: "http://paid.test/execute", mimeType: "application/json" }, accepts: [requirement], extensions: {} };

class RecordingPaymentClient implements PaymentClient {
  calls = 0;
  constructor(private readonly proof?: PaymentProof) {}
  async pay(requirement_: PaymentRequirement): Promise<PaymentProof> { this.calls += 1; return this.proof ?? new SimulatedPaymentClient().pay(requirement_); }
}

async function withPaidProvider(run: (url: string, executions: () => number) => Promise<void>): Promise<void> {
  let executionCount = 0;
  const server = createServer(async (request, response: ServerResponse) => {
    if (request.method !== "POST" || new URL(request.url ?? "/", "http://localhost").pathname !== "/execute") return response.writeHead(404).end();
    const proof = request.headers["payment-signature"];
    if (!proof) { response.writeHead(402, { "content-type": "application/json", "payment-required": encodeX402(required) }); response.end(JSON.stringify({ status: "payment_required" })); return; }
    const parsed = JSON.parse(Buffer.from(String(proof), "base64").toString("utf8")) as PaymentProof;
    if (parsed.x402Version !== 2 || parsed.accepted.amount !== requirement.amount || (parsed.payload.simulation as Record<string, unknown>)?.authorization !== "SIMULATED_AUTHORIZATION:20000") { response.writeHead(402, { "content-type": "application/json", "payment-required": encodeX402(required) }); response.end(JSON.stringify({ status: "payment_required" })); return; }
    executionCount += 1;
    response.writeHead(200, { "content-type": "application/json", "payment-response": encodeX402({ success: true, transaction: "", network: "eip155:84532", amount: "20000", extensions: { simulation: true } }) }); response.end(JSON.stringify({ result: 1850, currency: "ZAR" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${port}`, () => executionCount); } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

function paidProvider(baseUrl: string): Provider {
  return { id: "paid-fx", name: "Paid FX", price: 0.02, reliability: 0.999, estimatedLatencyMs: 100, baseUrl, manifests: [{ capability: { id: "currency_conversion", name: "Currency conversion", description: "Paid test provider", version: "1", inputSchema: { amount: "number", from: "currency code", to: "currency code" }, outputSchema: { result: "number", currency: "currency code" } }, provider: { id: "paid-fx", name: "Paid FX" }, pricing: { amount: 0.02, currency: "USD", unit: "per_request" }, payment: { protocol: "x402", scheme: "exact", asset: "USDC", network: "base-sepolia" }, estimatedLatencyMs: 100, reliability: 0.999, endpoint: { method: "POST", path: "/execute", action: "currency_conversion" } }] };
}

async function call(baseUrl: string, policy: Record<string, unknown>) { return fetch(`${baseUrl}/tools/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "currency_conversion", arguments: { amount: 100, from: "USD", to: "ZAR" }, policy }) }); }

test("simulated payment client is generic, deterministic, and contains no credentials", async () => {
  const proof = await new SimulatedPaymentClient().pay(requirement);
  assert.deepEqual(proof, await new SimulatedPaymentClient().pay(requirement));
  assert.equal((proof.payload.simulation as Record<string, unknown>).simulation, true);
  assert.doesNotMatch(JSON.stringify(proof), /private|seed|wallet/i);
});

test("paid provider requires an explicit allowPayment opt-in before execution", async () => {
  await withPaidProvider(async (providerUrl, executions) => {
    const registry = createProviderRegistry(); registry.register(paidProvider(providerUrl));
    const client = new RecordingPaymentClient(); const app = createAppServer(registry, client);
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve)); const { port } = app.address() as AddressInfo;
    try {
      for (const policy of [{}, { allowPayment: false }]) { const response = await call(`http://127.0.0.1:${port}`, policy); assert.equal(response.status, 402); }
      assert.equal(client.calls, 0); assert.equal(executions(), 0);
      const paid = await call(`http://127.0.0.1:${port}`, { allowPayment: true, maxPriceUsd: 0.02 });
      assert.equal(paid.status, 200); assert.equal(client.calls, 1); assert.equal(executions(), 1);
    } finally { await new Promise<void>((resolve, reject) => app.close((error) => error ? reject(error) : resolve())); }
  });
});

test("economic rejection prevents payment and invalid proof prevents execution", async () => {
  await withPaidProvider(async (providerUrl, executions) => {
    const registry = createProviderRegistry(); registry.register(paidProvider(providerUrl));
    const invalid = new RecordingPaymentClient({ x402Version: 2, accepted: requirement, payload: { simulation: { authorization: "invalid", simulation: true } }, extensions: {} });
    const app = createAppServer(registry, invalid); await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve)); const { port } = app.address() as AddressInfo;
    try {
      const budget = await call(`http://127.0.0.1:${port}`, { allowPayment: true, maxPriceUsd: 0.001 });
      assert.equal(budget.status, 422); assert.equal(invalid.calls, 0); assert.equal(executions(), 0);
      const badProof = await call(`http://127.0.0.1:${port}`, { allowPayment: true, maxPriceUsd: 0.02 });
      assert.equal(badProof.status, 402); assert.equal(invalid.calls, 1); assert.equal(executions(), 0);
    } finally { await new Promise<void>((resolve, reject) => app.close((error) => error ? reject(error) : resolve())); }
  });
});
