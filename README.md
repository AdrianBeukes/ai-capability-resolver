# AI Capability Resolver

## Phase 10E: capability evidence state and eligibility

Phase 10E adds a pure, protocol-neutral layer: **evidence** is what a source advertised or an observation recorded; **state** is a deterministic summary of that immutable evidence; and **eligibility** says whether that state is sufficient for one action. Caller **policy** (including payment authorization) remains separate, and ranking is future work. Thus `eligible != best`, `eligible != reliable`, `discovered != executable`, `verified once != reliable`, and simulated success never creates production eligibility.

`CapabilityEvidenceState` retains independent discovery, semantics, invocation, request/output-contract, transport, payment, execution, canonical-output, reliability, and timestamp provenance dimensions. Advertised and observed evidence are never rewritten into one another. Multiple observations retain both external success and failure facts, without rates or scores, and derivation is order independent.

`EligibilityDecision` supports `discovery`, `inspection`, `verification`, and `routing`, returning stable reason codes plus machine-readable missing evidence. **Verification eligible** means only that current evidence supports attempting a bounded verification action, subject to separate caller policy, authorization, safety, and execution mechanisms. It does not mean verified, successful, payment-authorized, trusted, reliable, or production-routable. Routing requires external execution and canonical-output success, deterministic advertised contracts, established semantics, no contradiction, and reliability. Reliability is deliberately `unknown`, so this phase grants no production routing eligibility. Payment authorization is not encoded in eligibility; `routing eligible != best provider`.

```bash
npm run demonstrate:evidence-state
```

The demonstration uses offline fixtures only. Its kadec0-like, x402atlas-like, and StableEnrich-like records are explicitly labeled reconstructed offline fixtures from previously observed evidence, not new live observations. It performs no discovery, provider, payment, wallet, facilitator, MCP, or package-installation action.

A small TypeScript/Node.js prototype for machine-native capability discovery, provider routing, and local execution. It intentionally has no database, authentication, external APIs, payment system, crypto, Cloudflare, or MCP SDK.

## Architecture

- `src/providers.ts` is the in-memory provider registry. Two mock currency-conversion providers expose price, estimated latency, and reliability.
- Every provider carries a machine-readable capability manifest: schemas, provider metadata, pricing, performance characteristics, and the local execution action. Discover the complete catalogue at `GET /.well-known/capabilities.json` or a capability at `GET /capabilities/currency_conversion`.
- `src/capabilities.ts` derives the machine-readable capability list from that registry.
- `src/resolver.ts` recognizes `Convert <amount> <FROM> to <TO>` requests. It first applies a caller-supplied execution policy, records machine-readable rejection codes, then ranks only eligible providers.
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

The resolver provides a small HTTP boundary inspired by MCP tool semantics: `GET /tools` lists tools, `GET /tools/:name` returns one tool description and schema, and `POST /tools/call` invokes a tool with `{ "name": "currency_conversion", "arguments": { ... }, "policy": { "maxPriceUsd": 0.03 } }`. Policy is separate from model-selected capability arguments and all values are simulated metadata. A successful result includes routing information (`selectedProvider`, `eligibleProviders`, and `rejectedProviders`). When providers support a capability but none meet policy, the endpoint returns HTTP `422 Unprocessable Content` and a structured `no_eligible_provider` result with rejection codes (`price_exceeds_maximum`, `reliability_below_minimum`, `latency_exceeds_maximum`); no provider is invoked. It is not a full MCP JSON-RPC implementation: there is no MCP lifecycle, transport negotiation, resources, prompts, or third-party SDK. The independent `agent-demo` uses only these HTTP endpoints.

## LLM-driven agent demo

Capability execution, provider ranking, exchange/unit rates, and text statistics are deterministic local behavior today. The `agent-demo` is AI-driven at the decision point: it sends the user task and dynamically discovered tool metadata to a `LanguageModel`, validates that model's JSON decision, and invokes the selected resolver tool. The agent contains no task-to-capability mapping.

No local model runtime was detected during development, so the demo defaults to an explicit offline static-model decision. It can use a locally running Ollama model without an SDK or API key by setting `OLLAMA_MODEL` (and optionally `RESOLVER_URL`). Any later OpenAI, Anthropic, or other compatible integration only needs to implement `LanguageModel.generate(request): Promise<string>`; the resolver, manifests, providers, and tool protocol remain independent of the model.

Tool metadata is the contract that lets a model select capabilities without source-code knowledge: every tool supplies its description and input/output schemas. With the resolver running, run the offline demonstration with:

```bash
npm start --prefix agent-demo
```

## Canonical x402 V2 Transport

The paid `independent-fx` provider uses HTTP 402 plus base64 JSON `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` headers. Its envelope uses V2 `PaymentRequired`, `PaymentRequirements`, `PaymentPayload`, and settlement-response field names, with CAIP-2 `eip155:84532`. The Phase 7 price remains simulated USD metadata (`0.02` USD/request); the V2 `amount` is the separate string atomic-unit development value `"20000"` (USDC-style six-decimal representation), never calculated using floating point.

## Simulated Authorization / Settlement Boundary

Flow: `402 → PAYMENT-REQUIRED → PAYMENT-SIGNATURE → simulated verification → simulated settlement → execution → PAYMENT-RESPONSE`. The protocol envelope and header encoding follow V2 where implemented. Only the narrow exact-EVM authorization payload is simulated (`payload.simulation`): no wallet, private key, EIP-712 signature, EIP-3009 authorization, blockchain transaction, facilitator, or real asset exists. `asset` and `payTo` are explicitly non-spendable `simulation:` identifiers, not addresses.

## Path to Real x402

This is not full x402 interoperability. Real Base Sepolia requires a genuine USDC contract address and recipient address, real EIP-712/EIP-3009 authorization from an external wallet, expiry and replay protection, supported scheme/network verification, facilitator `/verify` and `/settle`, and blockchain settlement. None is implemented here.

## Simulated Facilitator Boundary

The architecture separates the agent/resolver (capability discovery and economic routing), resource server (`independent-fx`, which sells and executes the capability), and `facilitator-demo` (payment verification and settlement). The provider follows authorization ordering: `PAYMENT-SIGNATURE → /verify → capability execution → /settle → PAYMENT-RESPONSE`. The facilitator advertises only V2 `exact` on `eip155:84532`; it is deterministic simulation with no wallet, key, chain connection, or ability to move funds.

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

## Phase 10D: observed capability evidence (offline simulation)

Phase 10D separates four evidence classes: advertised capability evidence, observed transport evidence, observed payment evidence, and observed capability evidence. An observed capability record retains its provider/resource identity, capability ID, timestamp, and execution mode. The demonstration uses only deterministic local fixtures and labels every execution as `simulated`.

An **advertised contract** is what a provider declares. An **observed response** is what one execution produced. An **observed mapping** is a deterministic mapping that worked for that particular response shape; it is not an advertised `AdapterPlan`. **Canonical validation** checks whether the mapped response satisfies the canonical `web.search` output (a result collection with HTTP(S) URL-bearing items). Semantic scope remains a gate: structurally perfect Twitter/X output is not general public-web search.

Response-shape capture is bounded by depth, object properties, array samples, string lengths, and diagnostic count. It retains shape rather than arbitrary payloads and redacts obvious secret-like text. Empty arrays establish container evidence only: they do not establish an item URL shape. Mixed items are conservatively non-success, and `javascript:`, `data:`, `file:`, and malformed URLs are rejected without fetching them.

```bash
npm run demonstrate:observed-capability
```

The command prints direct, adapted, incompatible, and semantically scoped fixture outcomes, alongside unchanged advertised classification/adapter-plan context. It makes no network, payment, wallet, facilitator, or MCP calls.

Reliability is **not yet established**: one successful observation != declared schema; one successful observation != reliability; one successful observation != future compatibility guarantee; and simulated observation != external provider evidence. Multiple `ObservedCapabilityEvidence` records may coexist later, but Phase 10D performs no scoring, ranking, routing change, or learned-adapter promotion.

## Phase 11A: immutable observation ledger and evidence windows

An **observation** is an immutable event/fact. The in-memory **ledger** is append-only: it supports append, read, and select; duplicate observation IDs are rejected and reads are defensive copies. An **evidence window** is an explicit selection of comparable observations by capability, provider, optional resource, execution mode, optional contract/request fingerprints, and `[fromInclusive, toExclusive)` time boundaries. Its production default is `external`; simulations are selected only with `executionMode: "simulated"`.

A **measurement** is a deterministic count, literal observed ratio, or transport-latency summary over a window. It is not a reliability, trust, or quality score. A quote observation is not an execution attempt: quote-only evidence can have a reached HTTP 402 and a quote match while execution attempts remain zero. Transport latency is measured separately from execution outcome; missing latency is never inferred.

**Sufficiency** answers only whether caller-defined requirements are met (for example minimum execution attempts or one known contract), and does not interpret provider reliability. More samples are not automatically trustworthy. Mixed known contract fingerprints, and unknown contract fingerprints when a single known contract is required, are never silently pooled. Contract fingerprints SHA-256 canonicalized stable contract material only. Request fingerprints SHA-256 canonical request shape (field names and value types), never raw request values.

`CapabilityEvidenceState.reliability` remains `unknown`; Phase 11A does not change eligibility, ranking, or routing. Run the offline fixture demonstration with:

```bash
npm run demonstrate:observation-ledger
```
# Phase 9A: read-only external x402 discovery

Phase 9A adds a deliberately separate ingestion path:

`x402 Bazaar -> read-only discovery -> runtime validation -> protocol-neutral normalization -> candidate resources`

`X402BazaarDiscoverySource` only performs paginated `GET {facilitator}/discovery/resources` requests. Configure a compatible facilitator with `X402_BAZAAR_URL` and run `npm run discover:x402`. It prints normalized records and rejected-record diagnostics; it does not invoke a discovered resource, authorize payment, create a payment payload, send `PAYMENT-SIGNATURE`, verify/settle, or move funds. `X402_DISCOVERY_MAX_PAGES` is an explicit demo-only operational bound for very large catalogs; omitting it walks the complete catalog.

The V2 core adapter validates per-resource `resource`, `type`, `x402Version: 2`, `accepts`, and `lastUpdated`, plus the consumed payment fields: `scheme`, `network`, atomic-string `amount`, `asset`, `payTo`, and `maxTimeoutSeconds`. It follows V2 `pagination.limit`, `pagination.offset`, and `pagination.total`. `extensions` (including Bazaar schemas/tool metadata), provider `metadata`, and payment `extra` are optional extension/facilitator data and are retained only where useful for future classification.

External records become `NormalizedCapabilityProvider`, not the existing ranked provider model: their resource identity and facilitator provenance are retained, and no canonical resolver capability is assumed. Provider/registry claims (description, tool name, schemas, price options) are **advertised**. Reliability and latency are **observed** only when independently measured; Phase 9A leaves both absent and never fabricates a USD price from atomic token amounts.

Phase 9B adds the official MCP Registry as a second, metadata-only source:

```text
             External Discovery
                     |
         +-----------+-----------+
         |                       |
    x402 Bazaar              MCP Registry
         |                       |
         +-----------+-----------+
                     |
                     v
           Normalized external resource model
```

`npm run discover:mcp` uses read-only `GET /v0.1/servers` with opaque cursor pagination (`MCP_REGISTRY_URL` and `MCP_REGISTRY_MAX_PAGES` are configurable). It does not install packages, run or connect to MCP servers, call tools, authorize or pay. Registry economics remain **unknown**, never free; server metadata is advertised, not observed evidence; capability/tool mapping is intentionally deferred.

Phase 9C adds deterministic semantic classification: discovery → normalization → `web.search` candidate. Classification is not provider quality, economic ranking, or execution success. General public-web evidence plus compatible query and URL-result schemas can match; social, directory, documentation, trends, package, and other scoped search claims are not automatically web search. `npm run classify:web-search` remains read-only.

Phase 9D permits only explicit `npm run inspect:mcp -- --server exact/name` inspection (maximum three names): Registry metadata → server-level candidate → safe `tools/list` → per-tool classification. Inspection is not execution: `tools/call` is prohibited; returned tool metadata remains advertised capability evidence, never performance evidence.

## Phase 9 milestone

Phase 9 proved cross-ecosystem, read-only discovery for x402 Bazaar and the official MCP Registry, followed by protocol-neutral normalization and conservative `web.search` candidate classification. The bounded live classification experiment inspected 128 records: 0 matched, 5 possible, and 123 rejected. This is intentional evidence of classifier conservatism, not provider quality.

The explicit Goji MCP experiment resolved `agency.goji/goji@1.0.1` as active, found an advertised remote, and observed only public DNS answers. The safe connection attempt was unreachable before initialization, so `tools/list` was not reached. Listed/discovered does not imply inspectable; inspectable does not imply a working or high-quality provider. Phase 9 does not measure execution success, quality, reliability, latency, or provider performance.

The network guard validates every DNS answer before connecting, disables redirects, and fails closed on unsafe or unresolved destinations. A remaining limitation is DNS TOCTOU/rebinding: the HTTP client can independently resolve a hostname after validation, so this implementation does not pin the TCP connection to a previously validated address. Address pinning would require a more substantial transport change and is intentionally deferred.

## Phase 10A: protocol-aware MCP inspectability

MCP evidence is intentionally staged: **discovered → semantically plausible → network-safe → protocol-compatible / inspectable → tool-level semantic match → not yet executed**. Protocol generation is retained as tool provenance, not provider-quality evidence. A failed protocol negotiation means only that this resolver could not inspect that endpoint under its bounded metadata-only policy; it is not a reliability or quality score.

The inspector supports two isolated strategies. `CURRENT_STATELESS` implements official MCP `2026-07-28`: a self-describing request with `MCP-Protocol-Version`, `Mcp-Method`, and `_meta` protocol-version/client-capability/client-identity metadata. It normally starts with `server/discover`, then issues `tools/list`; a direct `tools/list` is also supported where discovery is deliberately skipped. `LEGACY_STATEFUL` is a single fallback only after an explicit unsupported modern discovery response, and retains `initialize → notifications/initialized → tools/list` for pre-2026 servers. No strategy sends `tools/call`, resources, prompts, or payment requests.

## Phase 10B: canonical schema compatibility and adapter planning

Phase 10B adds a protocol-neutral, metadata-only schema compatibility layer after semantic classification. The questions remain deliberately separate: **semantic equivalence** asks “does this mean general public-web search?”, **schema compatibility** asks “can this native contract be mapped to ours?”, and an **adapter plan** describes how that translation would happen. Execution is not performed.

For `web.search`, the canonical required contract is a textual `query` and an output collection containing `results[].url`; `limit`, title, and snippet are optional. Native field names do not need to be identical: deterministic evidence can map `q`, `search_query`, `numResults`, `items[].link`, `organic[].href`, and nested result paths. Plans are data only, with the small safe transformation vocabulary `identity`, `rename`, `nested_path`, `array_item_mapping`, and `optional_default`; they never contain executable code, expressions, templates, or fetched scripts.

The analyzer inspects common local JSON Schema evidence (`properties`, `required`, `items`, local `$defs`/`$ref`, and composition variants). External `$ref` values are inert and never fetched. Ambiguous textual inputs, missing output schemas, and unresolved external references remain partial/unknown. Required native fields that cannot be supplied from the canonical request—especially credential or account fields—are incompatible. Structural compatibility cannot override an explicitly scoped semantic result such as Twitter/X or documentation search.

Run `npm run analyze:web-search-schema` with `X402_BAZAAR_URL` (and optionally `X402_DISCOVERY_MAX_PAGES`) for bounded GET-only x402 discovery followed by semantic classification, schema analysis, and declarative plan reporting. It never invokes a listed provider, constructs a payment proof, calls an MCP tool, installs a package, settles a payment, or fetches external schema references.

The bounded Phase 10B live x402 experiment inspected **196** resources: **0 matched**, **7 possible**, and **189 rejected**. No real adapter plan was generated. This does not characterize provider capability; it establishes only that the providers' advertised metadata was insufficient to prove deterministic canonical adaptation of both a textual query input and a URL-bearing result output.

## Phase 10C: live transport / payment-quote evidence

The evidence ladder is: **DISCOVERED → NORMALIZED → ADVERTISED SEMANTICS → ADVERTISED INVOCATION → ADVERTISED REQUEST CONTRACT → ADVERTISED OUTPUT CONTRACT → OBSERVED TRANSPORT / PAYMENT BOUNDARY → OBSERVED QUOTE → NOT YET CAPABILITY EXECUTION**. Bazaar invocation metadata (`extensions.bazaar.info.input`) is preserved separately from its declaration schema (`extensions.bazaar.schema`) and output metadata (`extensions.bazaar.info.output`). Examples do not prove field types or requiredness; only bounded nested schema evidence can derive a safe request contract.

`npm run verify:x402-quotes -- --resource <exact-resource-url>` accepts one to three exact discovery-resolved identities only; scanner flags, wildcards, and arbitrary URLs are rejected. It makes at most one safe HTTPS request, with DNS safety, redirects disabled, bounded timeout/body handling, and no default HTTP method. It never sends `PAYMENT-SIGNATURE`, creates a proof, uses a payment client or wallet, calls a facilitator, retries, or executes a paid capability. Advertised quotes remain separate from observed evidence and are compared field-by-field against every accepted option; no USD or exchange-rate conversion is inferred.

The bounded experiment selected and found three resources. Invocation metadata was complete for all three; request contracts were complete for two; output contracts were complete for none. Two provider verification requests returned HTTP 402: `https://api.kadec0.xyz/v1/serp` returned one strictly valid observed option that exactly matched advertised scheme, network, asset, atomic amount, payTo, and timeout. `https://websearch.use.x402atlas.com/search` returned HTTP 402, but its observed `PAYMENT-REQUIRED` envelope did not satisfy this verifier's strict validation requirements, so comparison was unavailable and no retry occurred. `https://stableenrich.dev/api/exa/search` was not contacted because its JSON-body field contract remained incomplete. This is payment-boundary evidence only: neither a 402 nor an exact quote match establishes capability execution, canonical output, reliability, or a future quote guarantee.

Inspection records bounded per-remote protocol attempts, HTTP/network attempts, and metadata method counters, and distinguishes unsafe endpoints, authentication/payment barriers, timeout, network unreachable, malformed responses, unsupported protocol, and protocol-negotiation failure. `tools/list` pagination remains bounded; 2026 list cache hints are accepted as advertised metadata. Tool schemas may use local JSON Schema 2020-12 structures (`properties`, `required`, `$defs` local references, `oneOf`, `anyOf`, `allOf`); external `$ref` URLs are inert and never fetched. The existing DNS rebinding/TOCTOU limitation remains unchanged.
