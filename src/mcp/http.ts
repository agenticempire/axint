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
const logLevel = process.env.LOG_LEVEL || "info";
const timeout = parseInt(process.env.TIMEOUT || "30000", 10);
const maxBodyBytes = parseInt(process.env.MAX_BODY_BYTES || String(10 * 1024 * 1024), 10);

// Comma-separated list of allowed origins, or "*" for any. Defaults to any —
// tighten by setting ALLOWED_ORIGINS in the deploy environment.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const allowAnyOrigin = allowedOrigins.includes("*");

const shouldLog = (level: string) => {
  const levels = ["silent", "warn", "info", "debug"];
  return levels.indexOf(level) <= levels.indexOf(logLevel);
};

const resolveOrigin = (origin: string | undefined) => {
  if (allowAnyOrigin) return "*";
  if (origin && allowedOrigins.includes(origin)) return origin;
  return null;
};

const httpServer = createServer(async (req, res) => {
  const origin = Array.isArray(req.headers.origin)
    ? req.headers.origin[0]
    : req.headers.origin;
  const allowed = resolveOrigin(origin);

  // CORS headers — only echo back an origin we actually allow.
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    if (allowed !== "*") res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(allowed ? 204 : 403).end();
    return;
  }

  // Reject disallowed cross-origin requests before doing any work.
  if (origin && !allowed) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Origin not allowed" },
        id: null,
      })
    );
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${port}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, server: "axint-mcp", logLevel }));
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

  // Reject oversized bodies up front when Content-Length is declared — stops
  // clients from streaming arbitrarily large payloads into memory.
  const declaredLength = parseInt(
    Array.isArray(req.headers["content-length"])
      ? req.headers["content-length"][0]!
      : req.headers["content-length"] || "0",
    10
  );
  if (declaredLength > maxBodyBytes) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Payload too large" },
        id: null,
      })
    );
    return;
  }

  // Buffer the request body. Empty or malformed JSON yields a protocol-level
  // parse error (-32700) instead of crashing the handler — previously a stray
  // `{` would unhandled-reject and the request would stall. A running byte
  // count guards against chunked bodies that lie about their Content-Length.
  const chunks: Buffer[] = [];
  let received = 0;
  let oversized = false;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    received += buf.length;
    if (received > maxBodyBytes) {
      oversized = true;
      break;
    }
    chunks.push(buf);
  }
  if (oversized) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Payload too large" },
        id: null,
      })
    );
    req.destroy();
    return;
  }

  const raw = Buffer.concat(chunks).toString();
  let body: unknown;
  try {
    if (!raw.trim()) throw new Error("empty body");
    body = JSON.parse(raw);
  } catch {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      })
    );
    return;
  }

  // Stateless mode: new server + transport per request
  const server = createAxintServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  // Abort if request exceeds configured timeout
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.writeHead(504, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: `Request timed out after ${timeout}ms` },
          id: null,
        })
      );
    }
  }, timeout);

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
    clearTimeout(timer);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  }
});

httpServer.listen(port, () => {
  if (shouldLog("info")) {
    console.log(`axint mcp http server listening on port ${port}`);
  }
});

process.on("SIGINT", () => process.exit(0));
