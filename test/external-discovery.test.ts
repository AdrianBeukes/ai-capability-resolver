import assert from "node:assert/strict";
import test from "node:test";
import { X402BazaarDiscoverySource, normalizeX402DiscoveredResource } from "../src/external-discovery.js";

const valid = {
  resource: "https://search.example/v1/web", type: "http", x402Version: 2,
  accepts: [{ scheme: "exact", network: "eip155:8453", amount: "200", asset: "0xabc", payTo: "0xmerchant", maxTimeoutSeconds: 60, extra: { name: "USDC" } }],
  lastUpdated: "2026-09-16T12:00:00.000Z",
  extensions: { bazaar: { description: "Search the public web", toolName: "web_search", input: { schema: { type: "object" } }, output: { schema: { type: "object" } } }, ignored: { arbitrary: true } }
};

function pagesFetch(pages: unknown[], calls: { url: URL; init?: RequestInit }[]): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init });
    return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("normalizes canonical V2 resource while preserving advertised metadata and provenance", () => {
  const record = normalizeX402DiscoveredResource(valid, "https://bazaar.example", "2026-09-16T13:00:00.000Z");
  assert.ok(record); assert.equal(record.externalResourceId, valid.resource); assert.equal(record.source.ecosystem, "x402");
  assert.equal(record.source.advertisedUpdatedAt, valid.lastUpdated); assert.equal(record.advertised.toolName, "web_search");
  assert.deepEqual(record.advertised.inputSchema, { type: "object" }); assert.equal(record.observed.reliability, undefined);
  assert.equal(record.observed.latencyMs, undefined); assert.equal(record.economics.options[0].priceUsd, undefined);
});

test("preserves multiple payment options and accepts missing optional metadata", () => {
  const record = normalizeX402DiscoveredResource({ ...valid, accepts: [valid.accepts[0], { ...valid.accepts[0], network: "solana:mainnet", amount: "999" }], extensions: undefined }, "source", "2026-01-01T00:00:00.000Z");
  assert.ok(record); assert.equal(record.economics.options.length, 2); assert.deepEqual(record.advertised, {});
});

test("fails closed for malformed resources, unsupported versions, and malformed payment requirements", () => {
  assert.equal(normalizeX402DiscoveredResource({ ...valid, resource: "" }, "s", "now"), undefined);
  assert.equal(normalizeX402DiscoveredResource({ ...valid, x402Version: 1 }, "s", "now"), undefined);
  assert.equal(normalizeX402DiscoveredResource({ ...valid, accepts: [{ ...valid.accepts[0], amount: "0.2" }] }, "s", "now"), undefined);
});

test("walks V2 offset pagination, rejects only bad records, and makes GET discovery calls only", async () => {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const pages = [
    { x402Version: 2, items: [valid, { ...valid, resource: "", lastUpdated: valid.lastUpdated }], pagination: { limit: 2, offset: 0, total: 3 } },
    { x402Version: 2, items: [{ ...valid, resource: "mcp://search/tool", type: "mcp", accepts: [{ ...valid.accepts[0], network: "eip155:84532" }] }], pagination: { limit: 2, offset: 2, total: 3 } }
  ];
  const source = new X402BazaarDiscoverySource({ facilitatorUrl: "https://example.test/platform/v2/x402", pageSize: 2, fetchImpl: pagesFetch(pages, calls), now: () => new Date("2026-09-16T13:00:00.000Z") });
  const result = await source.discover();
  assert.equal(result.records.length, 2); assert.equal(result.diagnostics.length, 1); assert.equal(result.records[1].invocation.resourceType, "mcp");
  assert.equal(calls.length, 2); assert.deepEqual(calls.map(({ url }) => url.pathname), ["/platform/v2/x402/discovery/resources", "/platform/v2/x402/discovery/resources"]);
  for (const call of calls) { assert.equal(call.init?.method, "GET"); assert.equal((call.init?.headers as Headers | undefined)?.get?.("payment-signature"), undefined); assert.equal(call.init?.body, undefined); }
});

test("rejects an invalid V2 page without retaining partial data", async () => {
  const source = new X402BazaarDiscoverySource({ facilitatorUrl: "https://example.test", fetchImpl: (async () => new Response(JSON.stringify({ x402Version: 2, items: [] }), { status: 200 })) as typeof fetch });
  await assert.rejects(source.discover(), /invalid V2 page shape/);
});
