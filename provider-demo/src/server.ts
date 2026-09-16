import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { verifySimulatedPayment } from "./payment.js";

const manifest = {
  capability: {
    id: "currency_conversion",
    name: "Currency conversion",
    description: "Converts a monetary amount between supported currency codes using local mock/test exchange-rate data.",
    version: "1.0.0",
    inputSchema: { amount: "number", from: "currency code", to: "currency code" },
    outputSchema: { result: "number", currency: "currency code" }
  },
  provider: { id: "independent-fx", name: "Independent FX" },
  pricing: { amount: 0.02, currency: "USD", unit: "per_request" },
  payment: { protocol: "x402", scheme: "exact", asset: "USDC", network: "base-sepolia" },
  estimatedLatencyMs: 150,
  reliability: 0.995,
  endpoint: { method: "POST", path: "/execute", action: "currency_conversion" }
} as const;

const paymentRequirement = {
  protocol: "x402", scheme: "exact", amount: "0.02", asset: "USDC", network: "base-sepolia",
  providerId: "independent-fx", requestId: "independent-fx:currency_conversion", simulation: true
} as const;

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

function isInput(value: unknown): value is { amount: number; from: string; to: string } {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return typeof input.amount === "number" && Number.isFinite(input.amount)
    && typeof input.from === "string" && typeof input.to === "string";
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET" && pathname === "/.well-known/capabilities.json") {
      return sendJson(response, 200, { version: "1.0.0", capabilities: [manifest] });
    }

    if (request.method === "POST" && pathname === "/execute") {
      const proofHeader = request.headers["payment-signature"];
      let proof: unknown;
      try { proof = proofHeader ? JSON.parse(String(proofHeader)) : undefined; } catch { proof = undefined; }
      if (!verifySimulatedPayment(paymentRequirement, proof)) {
        response.setHeader("payment-required", Buffer.from(JSON.stringify(paymentRequirement)).toString("base64"));
        return sendJson(response, 402, { status: "payment_required", paymentRequired: paymentRequirement });
      }
      const input = await readJson(request);
      if (!isInput(input)) throw new Error("Input must contain a finite numeric amount and string from/to currency codes.");
      const from = input.from.toUpperCase();
      const to = input.to.toUpperCase();
      if (from !== "USD" || to !== "ZAR") throw new Error("No mock/test exchange rate for this currency pair.");
      return sendJson(response, 200, {
        result: Number((input.amount * 18.5).toFixed(2)),
        currency: to,
        rate: 18.5,
        dataSource: "mock/test data",
        payment: { ...paymentRequirement, status: "simulated_settled", simulation: true }
      });
    }

    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid request." });
  }
});

const port = Number(process.env.PORT ?? 3100);
server.listen(port, () => console.log(`Independent FX listening on http://localhost:${port}`));
