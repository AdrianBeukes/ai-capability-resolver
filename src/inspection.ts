import type { NormalizedCapabilityProvider } from "./external-discovery.js";
import { validatePublicHttps, type NetworkSafetyReason } from "./network-safety.js";

export type InspectionStatus = "success" | "unsupported_protocol" | "authentication_required" | "payment_required" | "unsafe_endpoint" | "timeout" | "network_unreachable" | "malformed_response" | "protocol_negotiation_failed" | "unsupported_transport";
export type MCPInspectionStrategy = "CURRENT_STATELESS" | "LEGACY_STATEFUL";
export interface InspectionAttempt { protocolVersion: string; strategy: MCPInspectionStrategy; status: InspectionStatus; reason: string; methods: readonly string[]; }
export interface InspectedCapability { protocol: "mcp"; protocolVersion: string; nativeName: string; description?: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>; metadata?: Record<string, unknown>; }
export interface CapabilityInspectionResult { resourceId: string; inspectedAt: string; status: InspectionStatus; capabilities: InspectedCapability[]; diagnostics: string[]; protocolVersion?: string; safetyReason?: NetworkSafetyReason; inspectionAttempts: readonly InspectionAttempt[]; networkAttempts: number; methodCounts: Readonly<Record<string, number>>; }
export interface CapabilityInspector { inspect(resource: NormalizedCapabilityProvider): Promise<CapabilityInspectionResult>; }

const CURRENT = "2026-07-28", LEGACY = "2025-11-25";
type Json = Record<string, any>;
function barrier(response: Response): InspectionStatus | undefined { return response.status === 401 || response.status === 403 ? "authentication_required" : response.status === 402 ? "payment_required" : undefined; }
function isProtocolError(body: unknown): boolean { const code = (body as any)?.error?.code; return code === -32022 || code === -32601; }

export class MCPRemoteCapabilityInspector implements CapabilityInspector {
  constructor(private readonly opts: { fetchImpl?: typeof fetch; allowUnsafeForTest?: boolean; maxPages?: number; timeoutMs?: number; now?: () => Date; resolver?: any; preferServerDiscover?: boolean; } = {}) {}

  async inspect(resource: NormalizedCapabilityProvider): Promise<CapabilityInspectionResult> {
    const remote = resource.mcp?.remotes.find(x => x.type === "streamable-http" && typeof x.url === "string");
    const methods: Record<string, number> = { "server/discover": 0, "initialize": 0, "notifications/initialized": 0, "tools/list": 0, "tools/call": 0 };
    const attempts: InspectionAttempt[] = [];
    const base = { resourceId: resource.externalResourceId, inspectedAt: (this.opts.now ?? (() => new Date()))().toISOString(), capabilities: [] as InspectedCapability[], diagnostics: [] as string[], inspectionAttempts: attempts, networkAttempts: 0, methodCounts: methods };
    if (!remote) return { ...base, status: "unsupported_transport" };
    const endpoint = remote.url as string;
    const safety = this.opts.allowUnsafeForTest ? { allowed: true } : await validatePublicHttps(endpoint, this.opts.resolver);
    if (!safety.allowed) return { ...base, status: "unsafe_endpoint", safetyReason: safety.reason, diagnostics: [safety.reason ?? "unsafe endpoint"] };
    let id = 1;
    const record = (protocolVersion: string, strategy: MCPInspectionStrategy, status: InspectionStatus, reason: string, used: string[]) => attempts.push({ protocolVersion, strategy, status, reason, methods: used });
    const post = async (strategy: MCPInspectionStrategy, version: string, method: string, params?: Json, session?: string) => {
      methods[method] = (methods[method] ?? 0) + 1; base.networkAttempts++;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 5000);
      const modern = strategy === "CURRENT_STATELESS";
      const meta = modern ? { _meta: { "io.modelcontextprotocol/protocolVersion": CURRENT, "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "capability-inspector", version: "0.2" } } } : {};
      try { return await (this.opts.fetchImpl ?? fetch)(endpoint, { method: "POST", redirect: "error", signal: controller.signal, headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": version, "mcp-method": method, ...(!modern && session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", ...(method.startsWith("notifications/") ? {} : { id: id++ }), method, ...(params ? { params } : {}), ...meta }) }); } finally { clearTimeout(timer); }
    };
    const tools = async (strategy: MCPInspectionStrategy, version: string, session?: string): Promise<InspectionStatus> => {
      let cursor: unknown, pages = 0;
      while (pages++ < (this.opts.maxPages ?? 3)) {
        const response = await post(strategy, version, "tools/list", cursor === undefined ? undefined : { cursor }, session);
        const stop = barrier(response); if (stop) return stop;
        if (!response.ok) { let body: unknown; try { body = await response.json(); } catch {} return isProtocolError(body) ? "unsupported_protocol" : "network_unreachable"; }
        let body: Json; try { body = await response.json() as Json; } catch { return "malformed_response"; }
        if (!Array.isArray(body?.result?.tools)) return "malformed_response";
        for (const tool of body.result.tools) { if (typeof tool?.name !== "string" || !tool.inputSchema || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)) return "malformed_response"; base.capabilities.push({ protocol: "mcp", protocolVersion: version, nativeName: tool.name, description: typeof tool.description === "string" ? tool.description : undefined, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema && typeof tool.outputSchema === "object" ? tool.outputSchema : undefined, metadata: tool._meta && typeof tool._meta === "object" ? tool._meta : undefined }); }
        cursor = body.result.nextCursor; if (typeof cursor !== "string") return "success";
      } return "success";
    };
    try {
      if (this.opts.preferServerDiscover !== false) {
        const discovery = await post("CURRENT_STATELESS", CURRENT, "server/discover"); const stop = barrier(discovery);
        if (stop) { record(CURRENT, "CURRENT_STATELESS", stop, `HTTP ${discovery.status}`, ["server/discover"]); return { ...base, status: stop, protocolVersion: CURRENT }; }
        let body: Json | undefined; try { body = await discovery.json() as Json; } catch {}
        if (discovery.ok && body?.result && Array.isArray(body.result.protocolVersions) && body.result.protocolVersions.includes(CURRENT)) { const status = await tools("CURRENT_STATELESS", CURRENT); record(CURRENT, "CURRENT_STATELESS", status, status === "success" ? "metadata reached" : "tools/list failed", ["server/discover", "tools/list"]); return { ...base, status, protocolVersion: CURRENT }; }
        if (discovery.ok && !isProtocolError(body)) { record(CURRENT, "CURRENT_STATELESS", "malformed_response", "server/discover did not advertise 2026-07-28", ["server/discover"]); return { ...base, status: "protocol_negotiation_failed", diagnostics: ["Current server/discover response was malformed or omitted 2026-07-28"] }; }
        record(CURRENT, "CURRENT_STATELESS", "unsupported_protocol", `server/discover was not accepted: HTTP ${discovery.status}`, ["server/discover"]);
      } else { const status = await tools("CURRENT_STATELESS", CURRENT); record(CURRENT, "CURRENT_STATELESS", status, status === "success" ? "direct metadata request reached" : "direct tools/list failed", ["tools/list"]); return { ...base, status, protocolVersion: CURRENT }; }
      const init = await post("LEGACY_STATEFUL", LEGACY, "initialize", { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "capability-inspector", version: "0.2" } }); const stop = barrier(init);
      if (stop) { record(LEGACY, "LEGACY_STATEFUL", stop, `HTTP ${init.status}`, ["initialize"]); return { ...base, status: stop }; }
      if (!init.ok) { record(LEGACY, "LEGACY_STATEFUL", "protocol_negotiation_failed", `initialize HTTP ${init.status}`, ["initialize"]); return { ...base, status: "protocol_negotiation_failed" }; }
      let initialized: Json;
      try { initialized = await init.json() as Json; } catch { record(LEGACY, "LEGACY_STATEFUL", "malformed_response", "initialize response was not JSON-RPC JSON", ["initialize"]); return { ...base, status: "malformed_response" }; }
      const version = initialized?.result?.protocolVersion;
      if (typeof version !== "string") { record(LEGACY, "LEGACY_STATEFUL", "malformed_response", "initialize response lacked protocolVersion", ["initialize"]); return { ...base, status: "protocol_negotiation_failed" }; }
      const session = init.headers.get("mcp-session-id") ?? ""; await post("LEGACY_STATEFUL", version, "notifications/initialized", undefined, session); const status = await tools("LEGACY_STATEFUL", version, session); record(version, "LEGACY_STATEFUL", status, status === "success" ? "metadata reached" : "tools/list failed", ["initialize", "notifications/initialized", "tools/list"]); return { ...base, status, protocolVersion: version };
    } catch (error) { const status: InspectionStatus = error instanceof Error && error.name === "AbortError" ? "timeout" : "network_unreachable"; record(CURRENT, "CURRENT_STATELESS", status, error instanceof Error ? error.message : "network failure", []); return { ...base, status }; }
  }
}
