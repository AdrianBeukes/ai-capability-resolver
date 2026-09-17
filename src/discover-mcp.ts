import { MCPRegistryDiscoverySource } from "./mcp-registry-discovery.js";
const registryUrl = process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io";
const maxPages = process.env.MCP_REGISTRY_MAX_PAGES ? Number(process.env.MCP_REGISTRY_MAX_PAGES) : 1;
const result = await new MCPRegistryDiscoverySource({ registryUrl, maxPages }).discover();
console.log(JSON.stringify({ normalized: result.records.length, rejected: result.diagnostics.length, records: result.records.map((r) => ({ name: r.mcp?.serverName, title: r.mcp?.title, version: r.mcp?.version, status: r.mcp?.status, remotes: r.mcp?.remotes.length, packages: r.mcp?.packages.length, repository: r.mcp?.repository, description: r.advertised.description, provenance: r.source })), diagnostics: result.diagnostics }, null, 2));
