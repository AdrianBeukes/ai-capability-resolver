# AI Capability Resolver

A small TypeScript/Node.js prototype for machine-native capability discovery, provider routing, and local execution. It intentionally has no database, authentication, external APIs, payment system, crypto, Cloudflare, or MCP SDK.

## Architecture

- `src/providers.ts` is the in-memory provider registry. Two mock currency-conversion providers expose price, estimated latency, and reliability.
- Every provider carries a machine-readable capability manifest: schemas, provider metadata, pricing, performance characteristics, and the local execution action. Discover the complete catalogue at `GET /.well-known/capabilities.json` or a capability at `GET /capabilities/currency_conversion`.
- `src/capabilities.ts` derives the machine-readable capability list from that registry.
- `src/resolver.ts` recognizes `Convert <amount> <FROM> to <TO>` requests and selects the highest-ranked eligible provider.
- `src/ranking.ts` uses the deterministic score: `reliability * 100 - price * 100 - estimatedLatencyMs / 100`. Higher scores win; provider ID breaks ties.
- `src/executor.ts` runs the selected local mock provider. USD/ZAR uses a fixed rate of `18.5`, clearly returned as `mock/test data`.
- `src/server.ts` is a minimal Node HTTP server.

## Run

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

The server listens on `http://localhost:3000` by default. Set `PORT` to change it.

Available local capabilities are `currency_conversion`, `unit_conversion` (miles/kilometres), and `text_statistics` (word and character counts).

To run the separate local provider demo, use `npm run dev --prefix provider-demo`. It listens on port 3100 and is discovered only through `POST /providers/discover` with its base URL.

## Minimal MCP-style tool boundary

The resolver provides a small HTTP boundary inspired by MCP tool semantics: `GET /tools` lists tools, `GET /tools/:name` returns one tool description and schema, and `POST /tools/call` invokes a tool with `{ "name": "currency_conversion", "arguments": { ... } }`. It is not a full MCP JSON-RPC implementation: there is no MCP lifecycle, transport negotiation, resources, prompts, or third-party SDK. The independent `agent-demo` uses only these HTTP endpoints.

## LLM-driven agent demo

Capability execution, provider ranking, exchange/unit rates, and text statistics are deterministic local behavior today. The `agent-demo` is AI-driven at the decision point: it sends the user task and dynamically discovered tool metadata to a `LanguageModel`, validates that model's JSON decision, and invokes the selected resolver tool. The agent contains no task-to-capability mapping.

No local model runtime was detected during development, so the demo defaults to an explicit offline static-model decision. It can use a locally running Ollama model without an SDK or API key by setting `OLLAMA_MODEL` (and optionally `RESOLVER_URL`). Any later OpenAI, Anthropic, or other compatible integration only needs to implement `LanguageModel.generate(request): Promise<string>`; the resolver, manifests, providers, and tool protocol remain independent of the model.

Tool metadata is the contract that lets a model select capabilities without source-code knowledge: every tool supplies its description and input/output schemas. With the resolver running, run the offline demonstration with:

```bash
npm start --prefix agent-demo
```

```bash
curl http://localhost:3000/health
curl http://localhost:3000/capabilities
curl -X POST http://localhost:3000/resolve -H "content-type: application/json" -d '{"request":"Convert 100 USD to ZAR"}'
curl -X POST http://localhost:3000/execute -H "content-type: application/json" -d '{"capability":"currency_conversion","input":{"amount":100,"from":"USD","to":"ZAR"}}'
```

## Scripts

```bash
npm run dev     # start in watch mode
npm run build   # compile TypeScript to dist/
npm test        # run all unit tests
```
