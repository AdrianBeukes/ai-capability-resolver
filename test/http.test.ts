import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { createAppServer } from "../src/app.js";
import { CapabilityAgentClient } from "../agent-demo/src/client.js";
import type { LanguageModel, LanguageModelRequest } from "../agent-demo/src/language-model.js";

class RecordingLanguageModel implements LanguageModel {
  readonly requests: LanguageModelRequest[] = [];

  constructor(private readonly response: string) {}

  async generate(request: LanguageModelRequest): Promise<string> {
    this.requests.push(request);
    return this.response;
  }
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createAppServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function withProviderCatalogue(catalogue: unknown, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const provider = createServer((_request, response: ServerResponse) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(catalogue));
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const { port } = provider.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()));
  }
}

const independentManifest = {
  capability: {
    id: "currency_conversion",
    name: "Currency conversion",
    description: "Independent local mock conversion.",
    version: "1.0.0",
    inputSchema: { amount: "number", from: "currency code", to: "currency code" },
    outputSchema: { result: "number", currency: "currency code" }
  },
  provider: { id: "independent-fx", name: "Independent FX" },
  pricing: { amount: 0.02, currency: "USD", unit: "per_request" },
  estimatedLatencyMs: 150,
  reliability: 0.995,
  endpoint: { method: "POST", path: "/execute", action: "currency_conversion" }
};

async function withExecutableProvider(run: (baseUrl: string, executionCalls: () => number) => Promise<void>): Promise<void> {
  let calls = 0;
  const provider = createServer(async (request, response: ServerResponse) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET" && pathname === "/.well-known/capabilities.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ version: "1.0.0", capabilities: [independentManifest] }));
      return;
    }
    if (request.method === "POST" && pathname === "/execute") {
      calls += 1;
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body) as { amount: number; to: string };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ result: input.amount * 18.5, currency: input.to, dataSource: "remote mock/test data" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const { port } = provider.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`, () => calls);
  } finally {
    await new Promise<void>((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()));
  }
}

test("HTTP endpoints discover, resolve, and execute a capability", async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const capabilities = await fetch(`${baseUrl}/capabilities`);
    assert.equal(capabilities.status, 200);
    assert.deepEqual(await capabilities.json(), {
      capabilities: [
        { id: "currency_conversion", providers: ["swift-fx", "value-fx"] },
        { id: "unit_conversion", providers: ["precise-units", "value-units"] },
        { id: "text_statistics", providers: ["local-text-stats"] }
      ]
    });

    const resolution = await fetch(`${baseUrl}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: "Convert 100 USD to ZAR" })
    });
    assert.equal(resolution.status, 200);
    assert.deepEqual(await resolution.json(), {
      resolved: {
        capability: "currency_conversion",
        providerId: "swift-fx",
        input: { amount: 100, from: "USD", to: "ZAR" }
      }
    });

    const execution = await fetch(`${baseUrl}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capability: "currency_conversion", input: { from: "USD", to: "ZAR", amount: 100 } })
    });
    assert.equal(execution.status, 200);
    assert.deepEqual(await execution.json(), {
      execution: {
        providerId: "swift-fx",
        capability: "currency_conversion",
        input: { amount: 100, from: "USD", to: "ZAR" },
        rate: 18.5,
        result: 1850,
        dataSource: "mock/test data"
      }
    });
  });
});

test("HTTP server returns a clean 400 for malformed JSON", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{not valid json}'
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Malformed JSON request body." });
  });
});

test("HTTP capability discovery returns a machine-readable manifest catalogue", async () => {
  await withServer(async (baseUrl) => {
    const catalogueResponse = await fetch(`${baseUrl}/.well-known/capabilities.json`);
    assert.equal(catalogueResponse.status, 200);
    const catalogue = await catalogueResponse.json() as { version: string; capabilities: unknown[] };
    assert.equal(catalogue.version, "1.0.0");
    assert.equal(catalogue.capabilities.length, 3);

    const capabilityResponse = await fetch(`${baseUrl}/capabilities/currency_conversion`);
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json() as {
      id: string;
      inputSchema: Record<string, string>;
      outputSchema: Record<string, string>;
      providers: Array<{ provider: { id: string; name: string }; pricing: { amount: number }; endpoint: { method: string; path: string; action: string } }>;
    };

    assert.equal(capability.id, "currency_conversion");
    assert.deepEqual(capability.inputSchema, { amount: "number", from: "currency code", to: "currency code" });
    assert.deepEqual(capability.outputSchema, { result: "number", currency: "currency code" });
    assert.equal(capability.providers.length, 2);
    assert.deepEqual(capability.providers.map((provider) => provider.provider.id), ["swift-fx", "value-fx"]);
    for (const provider of capability.providers) {
      assert.equal(typeof provider.provider.name, "string");
      assert.equal(typeof provider.pricing.amount, "number");
      assert.deepEqual(provider.endpoint, { method: "POST", path: "/execute", action: "currency_conversion" });
    }
    assert.deepEqual(catalogue.capabilities.find((entry) => (entry as { id: string }).id === "currency_conversion"), capability);
  });
});

test("HTTP capability discovery returns 404 for an unknown capability", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/capabilities/not_real`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Capability not found" });
  });
});

test("HTTP provider discovery registers an independently advertised provider", async () => {
  await withProviderCatalogue({ version: "1.0.0", capabilities: [independentManifest] }, async (providerUrl) => {
    await withServer(async (baseUrl) => {
      const discovery = await fetch(`${baseUrl}/providers/discover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: providerUrl })
      });
      assert.equal(discovery.status, 201);
      assert.equal((await discovery.json() as { provider: { id: string } }).provider.id, "independent-fx");

      const providers = await fetch(`${baseUrl}/providers`);
      assert.equal(providers.status, 200);
      const providerIds = (await providers.json() as { providers: Array<{ id: string }> }).providers.map((provider) => provider.id);
      assert.deepEqual(providerIds, ["swift-fx", "precise-units", "value-units", "local-text-stats", "value-fx", "independent-fx"]);

      const capability = await fetch(`${baseUrl}/capabilities/currency_conversion`);
      assert.equal(capability.status, 200);
      const providerIdsInCapability = (await capability.json() as { providers: Array<{ provider: { id: string } }> }).providers
        .map((provider) => provider.provider.id);
      assert.deepEqual(providerIdsInCapability, ["swift-fx", "value-fx", "independent-fx"]);

      const resolution = await fetch(`${baseUrl}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: "Convert 100 USD to ZAR" })
      });
      assert.equal(resolution.status, 200);
      assert.equal((await resolution.json() as { resolved: { providerId: string } }).resolved.providerId, "independent-fx");
    });
  });
});

test("HTTP provider discovery rejects an invalid provider URL", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/providers/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" })
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Provider URL must be a valid absolute HTTP URL." });
  });
});

test("HTTP provider discovery rejects an invalid manifest", async () => {
  await withProviderCatalogue({ capabilities: [{ provider: { id: "broken" } }] }, async (providerUrl) => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/providers/discover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: providerUrl })
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Provider capability catalogue contains an invalid manifest." });
    });
  });
});

test("LLM agent dynamically passes discovered tool metadata to its language model and invokes currency conversion", async () => {
  await withServer(async (baseUrl) => {
    const model = new RecordingLanguageModel('{"tool":"currency_conversion","arguments":{"amount":100,"from":"USD","to":"ZAR"}}');
    const agent = new CapabilityAgentClient(baseUrl, model);
    const tools = await agent.listTools();
    assert.equal(tools.some((tool) => tool.name === "currency_conversion"), true);

    const tool = await agent.inspectTool("currency_conversion");
    assert.deepEqual(tool.inputSchema, { amount: "number", from: "currency code", to: "currency code" });

    const result = await agent.runTask("Convert 100 USD to ZAR");
    assert.equal(result.tool, "currency_conversion");
    assert.equal(result.providerId, "swift-fx");
    assert.deepEqual(result.output, { result: 1850, currency: "ZAR", dataSource: "mock/test data" });
    assert.equal(model.requests.length, 1);
    assert.equal(model.requests[0].task, "Convert 100 USD to ZAR");
    assert.deepEqual(model.requests[0].tools.find((tool) => tool.name === "currency_conversion")?.inputSchema, {
      amount: "number", from: "currency code", to: "currency code"
    });
  });
});

test("LLM agent accepts model-selected unit conversion and text statistics tools", async () => {
  await withServer(async (baseUrl) => {
    const unitAgent = new CapabilityAgentClient(baseUrl, new RecordingLanguageModel('{"tool":"unit_conversion","arguments":{"value":10,"from":"mi","to":"km"}}'));
    const textAgent = new CapabilityAgentClient(baseUrl, new RecordingLanguageModel('{"tool":"text_statistics","arguments":{"text":"How many words are in this sentence?"}}'));
    const agent = unitAgent;
    const tools = await agent.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ["currency_conversion", "text_statistics", "unit_conversion"]);
    assert.deepEqual((await agent.inspectTool("unit_conversion")).inputSchema, { value: "number", from: "unit code (mi or km)", to: "unit code (mi or km)" });
    assert.deepEqual((await agent.inspectTool("text_statistics")).outputSchema, { wordCount: "number", characterCount: "number" });

    const unitResult = await unitAgent.runTask("Convert 10 miles to kilometres");
    assert.equal(unitResult.tool, "unit_conversion");
    assert.equal(unitResult.providerId, "precise-units");
    assert.deepEqual(unitResult.output, { value: 16.0934, unit: "km", dataSource: "mock/test data" });

    const textTask = "How many words are in this sentence?";
    const textResult = await textAgent.runTask(textTask);
    assert.equal(textResult.tool, "text_statistics");
    assert.equal(textResult.providerId, "local-text-stats");
    assert.deepEqual(textResult.output, { wordCount: 7, characterCount: textTask.length, dataSource: "local deterministic data" });
  });
});

test("LLM agent rejects unknown tools and malformed or invalid model arguments", async () => {
  await withServer(async (baseUrl) => {
    await assert.rejects(
      () => new CapabilityAgentClient(baseUrl, new RecordingLanguageModel('{"tool":"not_a_tool","arguments":{}}')).runTask("anything"),
      /selected unavailable tool/
    );
    await assert.rejects(
      () => new CapabilityAgentClient(baseUrl, new RecordingLanguageModel('{"tool":"unit_conversion","arguments":{"value":"ten","from":"mi","to":"km"}}')).runTask("anything"),
      /invalid 'value' argument/
    );
    await assert.rejects(
      () => new CapabilityAgentClient(baseUrl, new RecordingLanguageModel('{"tool":"text_statistics","arguments":"not-an-object"}')).runTask("anything"),
      /response must contain a string tool and object arguments/
    );
  });
});

test("agent end-to-end task invokes a discovered independent provider through the resolver", async () => {
  await withExecutableProvider(async (providerUrl) => {
    await withServer(async (resolverUrl) => {
      const discovery = await fetch(`${resolverUrl}/providers/discover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: providerUrl })
      });
      assert.equal(discovery.status, 201);

      const result = await new CapabilityAgentClient(
        resolverUrl,
        new RecordingLanguageModel('{"tool":"currency_conversion","arguments":{"amount":100,"from":"USD","to":"ZAR"}}')
      ).runTask("Convert 100 USD to ZAR");
      assert.equal(result.providerId, "independent-fx");
      assert.deepEqual(result.output, { result: 1850, currency: "ZAR", dataSource: "remote mock/test data" });
    });
  });
});

test("agent-demo has no direct dependency on resolver or provider source", async () => {
  const source = await readFile(new URL("../agent-demo/src/client.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["'](?:\.\.\/)?(?:src|provider-demo)[/\\]/);
  assert.doesNotMatch(source, /provider-demo|independent-fx/);
});

test("tool calls expose routing and do not execute when policy rejects every provider", async () => {
  await withServer(async (baseUrl) => {
    const success = await fetch(`${baseUrl}/tools/call`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "currency_conversion", arguments: { amount: 100, from: "USD", to: "ZAR" }, policy: { maxPriceUsd: 0.01 } })
    });
    assert.equal(success.status, 200);
    const successBody = await success.json() as { result: { providerId: string; routing: { eligibleProviders: unknown[]; rejectedProviders: Array<{ reasons: string[] }> } } };
    assert.equal(successBody.result.providerId, "value-fx");
    assert.equal(successBody.result.routing.eligibleProviders.length, 1);
    assert.deepEqual(successBody.result.routing.rejectedProviders[0].reasons, ["price_exceeds_maximum"]);

    const rejected = await fetch(`${baseUrl}/tools/call`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "currency_conversion", arguments: { amount: 100, from: "USD", to: "ZAR" }, policy: { maxPriceUsd: 0 } })
    });
    assert.equal(rejected.status, 422);
    const rejectedBody = await rejected.json() as { result: { status: string; rejectedProviders: Array<{ reasons: string[] }> } };
    assert.equal(rejectedBody.result.status, "no_eligible_provider");
    assert.equal(rejectedBody.result.rejectedProviders.length, 2);
  });
});

test("discovered providers use the same policy gate and the agent passes caller policy separately", async () => {
  await withExecutableProvider(async (providerUrl, executionCalls) => {
    await withServer(async (resolverUrl) => {
      await fetch(`${resolverUrl}/providers/discover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: providerUrl }) });
      const response = await fetch(`${resolverUrl}/tools/call`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "currency_conversion", arguments: { amount: 100, from: "USD", to: "ZAR" }, policy: { maxPriceUsd: 0.01 } })
      });
      const result = await response.json() as { result: { providerId: string; routing: { rejectedProviders: Array<{ providerId: string; reasons: string[] }> } } };
      assert.equal(result.result.providerId, "value-fx");
      assert.deepEqual(result.result.routing.rejectedProviders.find((provider) => provider.providerId === "independent-fx")?.reasons, ["price_exceeds_maximum"]);
      assert.equal(executionCalls(), 0);

      const impossible = await fetch(`${resolverUrl}/tools/call`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "currency_conversion", arguments: { amount: 100, from: "USD", to: "ZAR" }, policy: { maxPriceUsd: 0 } })
      });
      assert.equal(impossible.status, 422);
      assert.equal(executionCalls(), 0);

      const model = new RecordingLanguageModel('{"tool":"currency_conversion","arguments":{"amount":100,"from":"USD","to":"ZAR"}}');
      const agentResult = await new CapabilityAgentClient(resolverUrl, model).runTask("Convert 100 USD to ZAR", { maxPriceUsd: 0.01 });
      assert.equal("status" in agentResult, false);
      if (!("status" in agentResult)) assert.equal(agentResult.providerId, "value-fx");
      assert.equal(model.requests.length, 1);
      assert.deepEqual(Object.keys(model.requests[0]), ["task", "tools"]);
    });
  });
});
