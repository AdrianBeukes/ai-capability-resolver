import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { discoverCapabilities, getCapability, getCapabilityCatalogue } from "./capabilities.js";
import { discoverProvider } from "./discovery.js";
import { execute } from "./executor.js";
import { executeLocalTool, parseToolArguments, type ToolArguments } from "./local-tools.js";
import { createProviderRegistry, type ProviderRegistry } from "./registry.js";
import { resolveRequest, selectProvider } from "./resolver.js";
import { CURRENCY_CONVERSION, type CapabilityId, type CurrencyConversionInput } from "./types.js";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Malformed JSON request body.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseExecutionInput(body: unknown): CurrencyConversionInput {
  if (!isRecord(body) || body.capability !== CURRENCY_CONVERSION || !isRecord(body.input)) {
    throw new Error("Body must contain capability 'currency_conversion' and an input object.");
  }

  const { amount, from, to } = body.input;
  if (typeof amount !== "number" || !Number.isFinite(amount) || typeof from !== "string" || typeof to !== "string") {
    throw new Error("Input must contain a finite numeric amount and string from/to currency codes.");
  }

  return { amount, from: from.toUpperCase(), to: to.toUpperCase() };
}

function toolDescription(capability: NonNullable<ReturnType<typeof getCapability>>) {
  return {
    name: capability.id,
    description: capability.description,
    version: capability.version,
    inputSchema: capability.inputSchema,
    outputSchema: capability.outputSchema
  };
}

async function invokeTool(capability: CapabilityId, arguments_: ToolArguments, registry: ProviderRegistry) {
  const provider = selectProvider(capability, registry.list());
  if (!provider.baseUrl) {
    return {
      tool: capability,
      providerId: provider.id,
      output: executeLocalTool(capability, provider.id, arguments_, registry.list())
    };
  }

  const manifest = provider.manifests.find((candidate) => candidate.capability.id === capability);
  if (!manifest) throw new Error(`Selected provider does not advertise ${capability}.`);
  let response: Response;
  try {
    response = await fetch(new URL(manifest.endpoint.path, provider.baseUrl), {
      method: manifest.endpoint.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(arguments_)
    });
  } catch {
    throw new Error("Unable to invoke the selected provider.");
  }
  if (!response.ok) throw new Error(`Selected provider returned HTTP ${response.status}.`);
  const output: unknown = await response.json();
  if (!isRecord(output)) {
    throw new Error("Selected provider returned an invalid tool result.");
  }
  return { tool: capability, providerId: provider.id, output };
}

export function createAppServer(registry: ProviderRegistry = createProviderRegistry()) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

      if (request.method === "GET" && pathname === "/health") return sendJson(response, 200, { status: "ok" });
      if (request.method === "GET" && pathname === "/capabilities") return sendJson(response, 200, { capabilities: discoverCapabilities(registry.list()) });
      if (request.method === "GET" && pathname === "/.well-known/capabilities.json") {
        return sendJson(response, 200, { version: "1.0.0", capabilities: getCapabilityCatalogue(registry.list()) });
      }

      const capabilityId = /^\/capabilities\/([^/]+)$/.exec(pathname)?.[1];
      if (request.method === "GET" && capabilityId) {
        const capability = getCapability(capabilityId, registry.list());
        return capability
          ? sendJson(response, 200, capability)
          : sendJson(response, 404, { error: "Capability not found" });
      }

      if (request.method === "GET" && pathname === "/providers") {
        return sendJson(response, 200, { providers: registry.list() });
      }

      if (request.method === "GET" && pathname === "/tools") {
        return sendJson(response, 200, { tools: getCapabilityCatalogue(registry.list()).map(toolDescription) });
      }

      const toolName = /^\/tools\/([^/]+)$/.exec(pathname)?.[1];
      if (request.method === "GET" && toolName) {
        const capability = getCapability(toolName, registry.list());
        return capability
          ? sendJson(response, 200, { tool: toolDescription(capability) })
          : sendJson(response, 404, { error: "Tool not found" });
      }

      if (request.method === "POST" && pathname === "/tools/call") {
        const body = await readJson(request);
        if (!isRecord(body) || typeof body.name !== "string") throw new Error("Body must contain a tool name.");
        const capability = getCapability(body.name, registry.list());
        if (!capability) throw new Error("Requested tool is not available.");
        const arguments_ = parseToolArguments(capability.id, body.arguments);
        return sendJson(response, 200, { result: await invokeTool(capability.id, arguments_, registry) });
      }

      if (request.method === "POST" && pathname === "/providers/discover") {
        const body = await readJson(request);
        if (!isRecord(body) || typeof body.url !== "string") throw new Error("Body must contain a string 'url'.");
        const provider = await discoverProvider(body.url);
        registry.register(provider);
        return sendJson(response, 201, { provider });
      }

      if (request.method === "POST" && pathname === "/resolve") {
        const body = await readJson(request);
        if (!isRecord(body) || typeof body.request !== "string") throw new Error("Body must contain a string 'request'.");
        return sendJson(response, 200, { resolved: resolveRequest(body.request, registry.list()) });
      }

      if (request.method === "POST" && pathname === "/execute") {
        const input = parseExecutionInput(await readJson(request));
        const provider = selectProvider(CURRENCY_CONVERSION, registry.list());
        return sendJson(response, 200, {
          execution: execute({ capability: CURRENCY_CONVERSION, providerId: provider.id, input }, registry.list())
        });
      }

      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request.";
      return sendJson(response, 400, { error: message });
    }
  });
}
