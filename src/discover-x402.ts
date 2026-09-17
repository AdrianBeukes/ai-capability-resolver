import { X402BazaarDiscoverySource } from "./external-discovery.js";

const facilitatorUrl = process.env.X402_BAZAAR_URL;
if (!facilitatorUrl) {
  console.error("Set X402_BAZAAR_URL to a Bazaar-compatible facilitator URL. This command only issues GET /discovery/resources.");
  process.exitCode = 2;
} else {
  const maxPages = process.env.X402_DISCOVERY_MAX_PAGES ? Number(process.env.X402_DISCOVERY_MAX_PAGES) : undefined;
  const result = await new X402BazaarDiscoverySource({ facilitatorUrl, maxPages }).discover();
  console.log(JSON.stringify({ discovered: result.records.length, rejected: result.diagnostics.length, records: result.records.map((record) => ({ resource: record.externalResourceId, type: record.invocation.resourceType, paymentOptions: record.economics.options.map(({ scheme, network, amount, asset, payTo, maxTimeoutSeconds }) => ({ scheme, network, amount, asset, payTo, maxTimeoutSeconds })), description: record.advertised.description, hasInputSchema: record.advertised.inputSchema !== undefined, hasOutputSchema: record.advertised.outputSchema !== undefined, provenance: record.source })), diagnostics: result.diagnostics }, null, 2));
}
