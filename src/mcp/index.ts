import { startMCPServer, createAxintServer } from "./server.js";

export { startMCPServer, createAxintServer };

// When invoked directly as a binary (axint-mcp), start the server
startMCPServer().catch((err: Error) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
