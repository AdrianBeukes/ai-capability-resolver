import { providers } from "./providers.js";
import type { CapabilityId, CapabilityManifest, FieldSchema, Provider } from "./types.js";

export interface CapabilityDescription {
  id: CapabilityId;
  providers: string[];
}

export interface CapabilityCatalogueEntry {
  id: CapabilityId;
  name: string;
  description: string;
  version: string;
  inputSchema: FieldSchema;
  outputSchema: FieldSchema;
  providers: CapabilityManifest[];
}

export function discoverCapabilities(availableProviders: readonly Provider[] = providers): CapabilityDescription[] {
  const capabilities = new Map<CapabilityId, string[]>();

  for (const provider of availableProviders) {
    for (const manifest of provider.manifests) {
      const providerIds = capabilities.get(manifest.capability.id) ?? [];
      providerIds.push(provider.id);
      capabilities.set(manifest.capability.id, providerIds);
    }
  }

  return [...capabilities.entries()].map(([id, providerIds]) => ({
    id,
    providers: providerIds.sort()
  }));
}

export function getCapabilityCatalogue(availableProviders: readonly Provider[] = providers): CapabilityCatalogueEntry[] {
  const entries = new Map<CapabilityId, CapabilityCatalogueEntry>();

  for (const provider of availableProviders) {
    for (const manifest of provider.manifests) {
      const capability = manifest.capability;
      const existing = entries.get(capability.id);
      if (existing) {
        existing.providers.push(manifest);
      } else {
        entries.set(capability.id, {
          id: capability.id,
          name: capability.name,
          description: capability.description,
          version: capability.version,
          inputSchema: capability.inputSchema,
          outputSchema: capability.outputSchema,
          providers: [manifest]
        });
      }
    }
  }

  return [...entries.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function getCapability(id: string, availableProviders: readonly Provider[] = providers): CapabilityCatalogueEntry | undefined {
  return getCapabilityCatalogue(availableProviders).find((capability) => capability.id === id);
}
