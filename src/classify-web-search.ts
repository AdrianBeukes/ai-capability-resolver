import { X402BazaarDiscoverySource } from "./external-discovery.js";
import { MCPRegistryDiscoverySource } from "./mcp-registry-discovery.js";
import { classifyWebSearchResources } from "./classification.js";
const x=await new X402BazaarDiscoverySource({facilitatorUrl:process.env.X402_BAZAAR_URL ?? "https://api.cdp.coinbase.com/platform/v2/x402",maxPages:Number(process.env.X402_DISCOVERY_MAX_PAGES ?? 1)}).discover();
const m=await new MCPRegistryDiscoverySource({registryUrl:process.env.MCP_REGISTRY_URL,maxPages:Number(process.env.MCP_REGISTRY_MAX_PAGES ?? 1)}).discover();
const records=[...x.records,...m.records]; const matches=classifyWebSearchResources(records); console.log(JSON.stringify(Object.fromEntries((["matched","possible","rejected"] as const).map(s=>[s,matches.filter(m=>m.status===s)])),null,2));
