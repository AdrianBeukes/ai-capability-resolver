import type { CapabilityDiscoverySource, DiscoveryDiagnostic, DiscoveryResult, NormalizedCapabilityProvider } from "./external-discovery.js";

type JsonRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is JsonRecord => typeof v === "object" && v !== null && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export interface MCPRegistryDiscoveryOptions { readonly registryUrl?: string; readonly maxPages?: number; readonly timeoutMs?: number; readonly fetchImpl?: typeof fetch; readonly now?: () => Date; }

/** Registry-metadata-only source: GET /v0.1/servers, never an MCP transport connection. */
export class MCPRegistryDiscoverySource implements CapabilityDiscoverySource {
  private readonly base: URL; private readonly maxPages: number; private readonly timeoutMs: number; private readonly fetchImpl: typeof fetch; private readonly now: () => Date;
  constructor(options: MCPRegistryDiscoveryOptions = {}) {
    this.base = new URL((options.registryUrl ?? "https://registry.modelcontextprotocol.io").replace(/\/$/, "") + "/");
    this.maxPages = options.maxPages ?? 1; if (!Number.isInteger(this.maxPages) || this.maxPages < 1) throw new Error("maxPages must be a positive integer.");
    this.timeoutMs = options.timeoutMs ?? 10_000; this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date());
  }
  async discover(): Promise<DiscoveryResult> {
    const records: NormalizedCapabilityProvider[] = []; const diagnostics: DiscoveryDiagnostic[] = []; let cursor: string | undefined; let pages = 0;
    while (pages < this.maxPages) {
      const url = new URL("v0.1/servers", this.base); if (cursor !== undefined) url.searchParams.set("cursor", cursor);
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); let response: Response;
      try { response = await this.fetchImpl(url, { method: "GET", signal: controller.signal }); } catch { throw new Error("Unable to fetch MCP Registry servers."); } finally { clearTimeout(timer); }
      if (!response.ok) throw new Error(`MCP Registry returned HTTP ${response.status}.`); let page: unknown; try { page = await response.json(); } catch { throw new Error("MCP Registry response is not valid JSON."); }
      if (!isRecord(page) || !Array.isArray(page.servers) || !isRecord(page.metadata) || (page.metadata.nextCursor !== undefined && !string(page.metadata.nextCursor))) throw new Error("MCP Registry response has an invalid pagination shape.");
      const sourceId = this.base.toString().replace(/\/$/, ""); const at = this.now().toISOString();
      page.servers.forEach((item, index) => { const normalized = normalizeMCPRegistryServer(item, sourceId, at); if (normalized) records.push(normalized); else diagnostics.push({ source: sourceId, recordIndex: index, message: "Rejected malformed MCP Registry server." }); });
      pages++; const next = page.metadata.nextCursor; if (!string(next)) break; cursor = next;
    }
    if (cursor !== undefined && pages === this.maxPages) diagnostics.push({ source: this.base.toString().replace(/\/$/, ""), message: `Stopped after configured ${this.maxPages} page(s); registry may be incomplete.` });
    return { records, diagnostics };
  }
}

export function normalizeMCPRegistryServer(raw: unknown, sourceId: string, discoveredAt: string): NormalizedCapabilityProvider | undefined {
  if (!isRecord(raw) || !isRecord(raw.server) || !string(raw.server.name) || !string(raw.server.version)) return undefined;
  const server = raw.server; const name = server.name as string; const version = server.version as string; const meta = isRecord(raw._meta) ? raw._meta : undefined; const official = isRecord(meta?.["io.modelcontextprotocol.registry/official"]) ? meta!["io.modelcontextprotocol.registry/official"] : undefined;
  const remotes = Array.isArray(server.remotes) && server.remotes.every(isRecord) ? server.remotes : []; const packages = Array.isArray(server.packages) && server.packages.every(isRecord) ? server.packages : [];
  const repository = isRecord(server.repository) ? server.repository : undefined;
  return { providerId: `mcp:${sourceId}:${name}:${version}`, externalResourceId: `${name}@${version}`,
    source: { ecosystem: "mcp", sourceId, discoveredAt, ...(string(official?.updatedAt) ? { advertisedUpdatedAt: official.updatedAt } : {}) },
    invocation: { protocol: "mcp", resource: name, resourceType: "server" }, economics: { paymentRequired: undefined, options: [] },
    advertised: { ...(string(server.description) ? { description: server.description } : {}), ...(meta ? { extensions: meta } : {}) }, observed: {},
    mcp: { serverName: name, version, ...(string(server.title) ? { title: server.title } : {}), ...(string(official?.status) ? { status: official.status } : {}), ...(repository ? { repository } : {}), packages, remotes, ...(meta ? { registryMeta: meta } : {}) } };
}
