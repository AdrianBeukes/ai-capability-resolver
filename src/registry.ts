import { localProviders } from "./providers.js";
import type { Provider } from "./types.js";

export class ProviderRegistry {
  private readonly registeredProviders = new Map<string, Provider>(localProviders.map((provider) => [provider.id, provider]));

  list(): Provider[] {
    return [...this.registeredProviders.values()];
  }

  register(provider: Provider): void {
    this.registeredProviders.set(provider.id, provider);
  }
}

export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}
