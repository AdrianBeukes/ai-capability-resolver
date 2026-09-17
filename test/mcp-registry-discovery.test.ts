import assert from "node:assert/strict";
import test from "node:test";
import { MCPRegistryDiscoverySource, normalizeMCPRegistryServer } from "../src/mcp-registry-discovery.js";
import { normalizeX402DiscoveredResource } from "../src/external-discovery.js";

const remote = { server: { name: "org.example/search", title: "Search", description: "Web research server", version: "1.2.3", remotes: [{ type: "streamable-http", url: "https://example.test/mcp" }], repository: { url: "https://github.com/example/search" } }, _meta: { "io.modelcontextprotocol.registry/official": { status: "active", updatedAt: "2026-01-01T00:00:00Z" }, unknown: { keep: true } } };
test("normalizes MCP server identity, status, distributions, unknown economics, and provenance", () => {
 const item=normalizeMCPRegistryServer(remote,"https://registry.test","2026-01-02T00:00:00Z"); assert.ok(item); assert.equal(item.source.ecosystem,"mcp"); assert.equal(item.mcp?.serverName,"org.example/search"); assert.equal(item.mcp?.status,"active"); assert.equal(item.mcp?.remotes.length,1); assert.equal(item.economics.paymentRequired,undefined); assert.equal(item.observed.latencyMs,undefined); assert.equal(item.externalResourceId,"org.example/search@1.2.3");
});
test("uses opaque cursors exactly, accepts packages and isolates malformed records", async () => {
 const calls: URL[]=[]; const fetchImpl=(async (input: URL|RequestInfo) => { calls.push(new URL(String(input))); const page=calls.length===1?{servers:[remote,{server:{name:"bad"}}],metadata:{nextCursor:"opaque:cursor/=="}}:{servers:[{server:{name:"org.example/package",version:"2",packages:[{registryType:"npm",identifier:"pkg",version:"2"}]}}],metadata:{count:1}}; return new Response(JSON.stringify(page)); }) as typeof fetch;
 const result=await new MCPRegistryDiscoverySource({registryUrl:"https://registry.test",maxPages:2,fetchImpl}).discover(); assert.equal(result.records.length,2); assert.equal(result.records[1].mcp?.packages.length,1); assert.equal(result.diagnostics.length,2); assert.equal(calls[1].searchParams.get("cursor"),"opaque:cursor/=="); assert.ok(calls.every(c=>c.pathname==="/v0.1/servers"));
});
test("rejects malformed pagination and keeps MCP/x402 protocol differences in one envelope", async () => {
 const source=new MCPRegistryDiscoverySource({registryUrl:"https://registry.test",fetchImpl:(async()=>new Response(JSON.stringify({servers:[]}))) as typeof fetch}); await assert.rejects(source.discover(),/invalid pagination/);
 const x=normalizeX402DiscoveredResource({resource:"https://x.test",type:"http",x402Version:2,accepts:[{scheme:"exact",network:"eip155:1",amount:"1",asset:"a",payTo:"p",maxTimeoutSeconds:1}],lastUpdated:"2026-01-01T00:00:00Z"},"x","now"); const m=normalizeMCPRegistryServer(remote,"m","now"); assert.ok(x&&m); assert.equal(x.economics.options.length,1); assert.equal(x.mcp,undefined); assert.equal(m.economics.options.length,0); assert.equal(m.mcp?.version,"1.2.3");
});
