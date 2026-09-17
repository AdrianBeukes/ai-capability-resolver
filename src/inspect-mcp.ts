import { resolveExactMCPServer } from "./mcp-exact-resolution.js";
import { MCPRemoteCapabilityInspector } from "./inspection.js";
import { classifyMCPTool, classifyWebSearch } from "./classification.js";

const names = process.argv.flatMap((value, index, values) => value === "--server" ? [values[index + 1]] : []).filter((value): value is string => !!value);
if (!names.length || names.length > 3 || process.argv.some(value => /^--(?:all|search|possible|top|scan)/.test(value))) {
  console.error("Usage: npm run inspect:mcp -- --server <exact-registry-name> [--server <exact-registry-name>] (max 3)"); process.exitCode = 2;
} else {
  const registry = process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io";
  for (const name of names) {
    const resolved = await resolveExactMCPServer(name, registry);
    console.log(JSON.stringify({ requested: name, registryUrl: resolved.url, resolution: resolved.status, version: resolved.record?.mcp?.version, status: resolved.record?.mcp?.status, selectedRemote: resolved.record?.mcp?.remotes.find(x => x.type === "streamable-http")?.url }));
    if (resolved.status !== "success" || !resolved.record) continue;
    const item = resolved.record, inspection = await new MCPRemoteCapabilityInspector().inspect(item);
    console.log(JSON.stringify({ server: item.externalResourceId, registryClassification: classifyWebSearch(item).status, inspection: { status: inspection.status, protocolVersion: inspection.protocolVersion, attempts: inspection.inspectionAttempts, networkAttempts: inspection.networkAttempts, methodCounts: inspection.methodCounts, tools: inspection.capabilities.map(tool => ({ name: tool.nativeName, description: tool.description, protocolVersion: tool.protocolVersion, classification: classifyMCPTool(item.externalResourceId, tool) })) }, safety: { toolsCall: inspection.methodCounts["tools/call"], payments: 0 } }, null, 2));
  }
}
