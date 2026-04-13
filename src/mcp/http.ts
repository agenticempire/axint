/**
 * Axint MCP Server — Streamable HTTP Transport
 *
 * Runs the same Axint tools over HTTP so the server can be deployed
 * as a remote MCP endpoint (Smithery, Cloudflare Workers, etc.).
 *
 * Usage: node dist/mcp/http.js [--port 3001]
 */

import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAxintServer } from "./server.js";

const port = parseInt(process.env.PORT || "3001", 10);

const httpServer = createServer(async (req, res) => {
  // CORS headers for cross-origin MCP clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${port}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, server: "axint-mcp" }));
    return;
  }

  // Only handle /mcp
  if (url.pathname !== "/mcp") {
    res.writeHead(404).end("Not found");
    return;
  }

  if (req.method === "GET" || req.method === "DELETE") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      })
    );
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  // Buffer the request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString());

  // Stateless mode: new server + transport per request
  const server = createAxintServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (_err) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        })
      );
    }
  } finally {
    res.on("close", () => {
      transport.close();
      server.close();
    });
  }
});

httpServer.listen(port, () => {
  console.log(`axint mcp http server listening on port ${port}`);
});

process.on("SIGINT", () => process.exit(0));
