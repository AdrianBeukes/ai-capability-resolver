import { createAppServer } from "./app.js";
import { loadProductionConfig } from "./production-config.js";

const config = loadProductionConfig();
export const server = createAppServer(undefined, undefined, undefined, config.payment);

if (process.env.NODE_ENV !== "test") {
  server.listen(config.port, () => console.log(JSON.stringify({ event: "listening", port: config.port })));
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
}
