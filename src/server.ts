import { createAppServer } from "./app.js";

export const server = createAppServer();

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`AI Capability Resolver listening on http://localhost:${port}`));
}
