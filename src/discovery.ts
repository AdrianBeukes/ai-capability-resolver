import type { CapabilityManifest, Provider } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isManifest(value: unknown): value is CapabilityManifest {
  if (!isRecord(value) || !isRecord(value.capability) || !isRecord(value.provider) || !isRecord(value.pricing) || !isRecord(value.endpoint)) return false;

  const { capability, provider, pricing, endpoint } = value;
  return typeof capability.id === "string"
    && typeof capability.name === "string"
    && typeof capability.description === "string"
    && typeof capability.version === "string"
    && isRecord(capability.inputSchema)
    && isRecord(capability.outputSchema)
    && typeof provider.id === "string"
    && typeof provider.name === "string"
    && typeof pricing.amount === "number"
    && pricing.currency === "USD"
    && pricing.unit === "per_request"
    && typeof value.estimatedLatencyMs === "number"
    && typeof value.reliability === "number"
    && endpoint.method === "POST"
    && typeof endpoint.path === "string"
    && typeof endpoint.action === "string";
}

function providerFromManifests(manifests: CapabilityManifest[], baseUrl: string): Provider {
  if (manifests.length === 0) throw new Error("Provider capability catalogue is empty.");

  const first = manifests[0];
  if (!manifests.every((manifest) => manifest.provider.id === first.provider.id && manifest.provider.name === first.provider.name)) {
    throw new Error("All provider manifests must identify the same provider.");
  }

  return {
    id: first.provider.id,
    name: first.provider.name,
    manifests,
    price: first.pricing.amount,
    estimatedLatencyMs: first.estimatedLatencyMs,
    reliability: first.reliability,
    baseUrl
  };
}

export async function discoverProvider(baseUrl: string): Promise<Provider> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Provider URL must be a valid absolute HTTP URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Provider URL must use HTTP or HTTPS.");
  }

  const catalogueUrl = new URL("/.well-known/capabilities.json", url);
  let response: Response;
  try {
    response = await fetch(catalogueUrl);
  } catch {
    throw new Error("Unable to fetch provider capability catalogue.");
  }

  if (!response.ok) throw new Error(`Provider capability catalogue returned HTTP ${response.status}.`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Provider capability catalogue is not valid JSON.");
  }

  if (!isRecord(payload) || !Array.isArray(payload.capabilities) || !payload.capabilities.every(isManifest)) {
    throw new Error("Provider capability catalogue contains an invalid manifest.");
  }

  return providerFromManifests(payload.capabilities, url.origin);
}
