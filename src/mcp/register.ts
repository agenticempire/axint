import { startMCPServer } from "./server.js";

startMCPServer().catch((err: Error) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
