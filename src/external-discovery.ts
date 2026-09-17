/** Read-only, protocol-neutral boundary for externally advertised capabilities. */

export interface DiscoveryDiagnostic {
  readonly source: string;
  readonly recordIndex?: number;
  readonly message: string;
}

export interface DiscoveryResult {
  readonly records: readonly NormalizedCapabilityProvider[];
  readonly diagnostics: readonly DiscoveryDiagnostic[];
}

/** Future MCP Registry and A2A adapters implement this; the resolver does not. */
export interface CapabilityDiscoverySource {
  discover(): Promise<DiscoveryResult>;
}

export interface NormalizedPaymentOption {
  readonly scheme: string;
  readonly network: string;
  /** Atomic units exactly as advertised. No decimals, FX rate, or USD value is inferred. */
  readonly amount: string;
  readonly asset: string;
  readonly payTo: string;
  readonly maxTimeoutSeconds: number;
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly priceUsd?: undefined;
}

export interface NormalizedCapabilityProvider {
  /** Stable local identity for this external resource, not a canonical resolver capability ID. */
  readonly providerId: string;
  readonly externalResourceId: string;
  readonly source: {
    readonly ecosystem: "x402" | "mcp";
    readonly sourceId: string;
    readonly discoveredAt: string;
    readonly advertisedUpdatedAt?: string;
  };
  readonly invocation: { readonly protocol: "x402" | "mcp"; readonly resource: string; readonly resourceType: string };
  /** Unknown is deliberately distinct from free. */
  readonly economics: { readonly paymentRequired: boolean | undefined; readonly options: readonly NormalizedPaymentOption[]; readonly priceUsd?: undefined };
  /** Provider/registry assertions, never resolver measurements. */
  readonly advertised: {
    readonly description?: string;
    readonly inputSchema?: Readonly<Record<string, unknown>>;
    readonly outputSchema?: Readonly<Record<string, unknown>>;
    readonly toolName?: string;
    readonly extensions?: Readonly<Record<string, unknown>>;
  };
  /** Phase 9A intentionally has no independently measured quality data. */
  readonly observed: { readonly reliability?: undefined; readonly latencyMs?: undefined };
  /** x402/Bazaar-specific invocation provenance. It is not a cross-protocol capability claim. */
  readonly x402?: { readonly invocation?: { readonly type: "http"; readonly method: "GET" | "POST"; readonly placement: "queryParams" | "jsonBody"; readonly parameters: Readonly<Record<string, unknown>>; }; readonly bazaarSchema?: Readonly<Record<string, unknown>>; readonly outputMetadata?: Readonly<Record<string, unknown>> };
  /** Protocol-specific information kept alongside the common envelope. */
  readonly mcp?: { readonly serverName: string; readonly version: string; readonly title?: string; readonly status?: string; readonly repository?: Readonly<Record<string, unknown>>; readonly packages: readonly Readonly<Record<string, unknown>>[]; readonly remotes: readonly Readonly<Record<string, unknown>>[]; readonly registryMeta?: Readonly<Record<string, unknown>> };
}

export interface X402BazaarDiscoveryOptions {
  readonly facilitatorUrl: string;
  readonly pageSize?: number;
  readonly timeoutMs?: number;
  /** Optional operational bound for demos; omitted means walk the complete catalog. */
  readonly maxPages?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function isoTimestamp(value: unknown): value is string { return nonEmptyString(value) && !Number.isNaN(Date.parse(value)); }

function advertisedMetadata(raw: JsonRecord): NormalizedCapabilityProvider["advertised"] {
  // Bazaar extension metadata is extension data. `metadata` is used by some facilitators;
  // retaining only known optional descriptive fields avoids making it part of our core adapter.
  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined;
  const bazaar = isRecord(raw.extensions) && isRecord(raw.extensions.bazaar) ? raw.extensions.bazaar : undefined;
  const candidate = bazaar ?? metadata;
  if (!candidate) return {};
  const info = isRecord(candidate.info) ? candidate.info : undefined;
  const inputSchema = isRecord(candidate.inputSchema) ? candidate.inputSchema : isRecord(candidate.input) && isRecord(candidate.input.schema) ? candidate.input.schema : isRecord(info?.inputSchema) ? info.inputSchema : isRecord(info?.input) && info.input.type!=="http" ? info.input : undefined;
  const outputSchema = isRecord(candidate.outputSchema) ? candidate.outputSchema : isRecord(candidate.output) && isRecord(candidate.output.schema) ? candidate.output.schema : isRecord(info?.output) ? info.output : undefined;
  return {
    ...(nonEmptyString(raw.description) ? { description: raw.description } : nonEmptyString(candidate.description) ? { description: candidate.description } : nonEmptyString(metadata?.description) ? { description: metadata.description } : {}),
    ...(nonEmptyString(candidate.toolName) ? { toolName: candidate.toolName } : nonEmptyString(candidate.name) ? { toolName: candidate.name } : {}),
    ...(inputSchema ? { inputSchema } : {}), ...(outputSchema ? { outputSchema } : {}),
    ...(isRecord(raw.extensions) ? { extensions: raw.extensions } : {})
  };
}

function bazaarInvocation(raw: JsonRecord): NormalizedCapabilityProvider["x402"] | undefined {
  const bazaar=isRecord(raw.extensions)&&isRecord(raw.extensions.bazaar)?raw.extensions.bazaar:undefined;
  const input=bazaar&&isRecord(bazaar.info)&&isRecord(bazaar.info.input)?bazaar.info.input:undefined;
  if(!input || input.type!=="http" || typeof input.method!=="string") return undefined;
  const method=input.method.toUpperCase();
  if(method!=="GET"&&method!=="POST") return undefined;
  if(method==="GET"&&isRecord(input.queryParams)) return {invocation:{type:"http",method,placement:"queryParams",parameters:input.queryParams}};
  if(method==="POST"&&input.bodyType==="json"&&isRecord(input.body)) return {invocation:{type:"http",method,placement:"jsonBody",parameters:input.body}};
  return undefined;
}

function paymentOption(value: unknown): NormalizedPaymentOption | undefined {
  if (!isRecord(value) || !nonEmptyString(value.scheme) || !nonEmptyString(value.network)
    || !nonEmptyString(value.amount) || !/^\d+$/.test(value.amount) || !nonEmptyString(value.asset)
    || !nonEmptyString(value.payTo) || typeof value.maxTimeoutSeconds !== "number"
    || !Number.isFinite(value.maxTimeoutSeconds) || value.maxTimeoutSeconds < 0) return undefined;
  return { scheme: value.scheme, network: value.network, amount: value.amount, asset: value.asset, payTo: value.payTo,
    maxTimeoutSeconds: value.maxTimeoutSeconds, ...(isRecord(value.extra) ? { extra: value.extra } : {}) };
}

export function normalizeX402DiscoveredResource(raw: unknown, sourceId: string, discoveredAt: string): NormalizedCapabilityProvider | undefined {
  if (!isRecord(raw) || raw.x402Version !== 2 || !nonEmptyString(raw.resource) || !nonEmptyString(raw.type)
    || !Array.isArray(raw.accepts) || raw.accepts.length === 0 || !isoTimestamp(raw.lastUpdated)) return undefined;
  const options = raw.accepts.map(paymentOption);
  if (options.some((option) => option === undefined)) return undefined;
  const resource = raw.resource;
  return {
    providerId: `x402:${sourceId}:${resource}`, externalResourceId: resource,
    source: { ecosystem: "x402", sourceId, discoveredAt, advertisedUpdatedAt: raw.lastUpdated },
    invocation: { protocol: "x402", resource, resourceType: raw.type },
    economics: { paymentRequired: true, options: options as NormalizedPaymentOption[] },
    advertised: advertisedMetadata(raw), observed: {}, ...(x402Provenance(raw)?{x402:x402Provenance(raw)}:{})
  };
}
function x402Provenance(raw: JsonRecord): NormalizedCapabilityProvider["x402"] | undefined { const invocation=bazaarInvocation(raw)?.invocation; const bazaar=isRecord(raw.extensions)&&isRecord(raw.extensions.bazaar)?raw.extensions.bazaar:undefined; const schema=bazaar&&isRecord(bazaar.schema)?bazaar.schema:undefined; const output=bazaar&&isRecord(bazaar.info)&&isRecord(bazaar.info.output)?bazaar.info.output:undefined; return invocation||schema||output?{...(invocation?{invocation}:{}),...(schema?{bazaarSchema:schema}:{}),...(output?{outputMetadata:output}:{})}:undefined; }

/** GET-only Bazaar client. It never imports payment or execution modules. */
export class X402BazaarDiscoverySource implements CapabilityDiscoverySource {
  private readonly baseUrl: URL;
  private readonly pageSize: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly maxPages?: number;
  private readonly sourceId: string;

  constructor(options: X402BazaarDiscoveryOptions) {
    this.baseUrl = new URL(options.facilitatorUrl.endsWith("/") ? options.facilitatorUrl : `${options.facilitatorUrl}/`);
    if (this.baseUrl.protocol !== "https:" && this.baseUrl.protocol !== "http:") throw new Error("Facilitator URL must use HTTP or HTTPS.");
    this.pageSize = options.pageSize ?? 100;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 100) throw new Error("pageSize must be an integer from 1 to 100.");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (options.maxPages !== undefined && (!Number.isInteger(options.maxPages) || options.maxPages < 1)) throw new Error("maxPages must be a positive integer.");
    this.maxPages = options.maxPages;
    this.sourceId = this.baseUrl.toString().replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async discover(): Promise<DiscoveryResult> {
    const records: NormalizedCapabilityProvider[] = []; const diagnostics: DiscoveryDiagnostic[] = [];
    let offset = 0; let total = Infinity; let pageCount = 0;
    while (offset < total) {
      if (this.maxPages !== undefined && pageCount >= this.maxPages) { diagnostics.push({ source: this.sourceId, message: `Stopped after configured ${this.maxPages} page(s); catalog may be incomplete.` }); break; }
      const url = new URL("discovery/resources", this.baseUrl); url.searchParams.set("limit", String(this.pageSize)); url.searchParams.set("offset", String(offset));
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try { response = await this.fetchImpl(url, { method: "GET", signal: controller.signal }); }
      catch { throw new Error(`Unable to fetch x402 Bazaar discovery page at offset ${offset}.`); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error(`x402 Bazaar discovery returned HTTP ${response.status}.`);
      let page: unknown; try { page = await response.json(); } catch { throw new Error("x402 Bazaar discovery response is not valid JSON."); }
      if (!isRecord(page) || page.x402Version !== 2 || !Array.isArray(page.items) || !isRecord(page.pagination)
        || !Number.isInteger(page.pagination.limit) || !Number.isInteger(page.pagination.offset) || !Number.isInteger(page.pagination.total)
        || (page.pagination.total as number) < 0) throw new Error("x402 Bazaar discovery response has an invalid V2 page shape.");
      const discoveredAt = this.now().toISOString();
      page.items.forEach((item, index) => { const normalized = normalizeX402DiscoveredResource(item, this.sourceId, discoveredAt); if (normalized) records.push(normalized); else diagnostics.push({ source: this.sourceId, recordIndex: offset + index, message: "Rejected malformed or unsupported x402 V2 resource." }); });
      total = page.pagination.total as number;
      pageCount += 1;
      const nextOffset = (page.pagination.offset as number) + page.items.length;
      if (page.items.length === 0 || nextOffset <= offset) break;
      offset = nextOffset;
    }
    return { records, diagnostics };
  }
}
