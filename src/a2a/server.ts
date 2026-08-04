import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import express, { type Express, type RequestHandler } from "express";
import { A2A_PROTOCOL_VERSION } from "@a2a-js/sdk";
import { DefaultRequestHandler } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler } from "@a2a-js/sdk/server/express";
import { createAxintAgentCard } from "./agent-card.js";
import { AxintA2AAuthenticator } from "./auth.js";
import { AxintA2AExecutor } from "./executor.js";
import { createAxintA2ARunner } from "./service.js";
import { AxintA2ATaskStore } from "./task-store.js";

export interface AxintA2AServerOptions {
  host?: string;
  port?: number;
  publicUrl?: string;
  projectRoot?: string;
  stateDirectory?: string;
  tokens?: string;
  allowUnauthenticated?: boolean;
  bodyLimit?: string;
  rateLimitPerMinute?: number;
}

export interface AxintA2AApp {
  app: Express;
  endpointUrl: string;
  projectRoot: string;
  stateDirectory: string;
}

export interface RunningAxintA2AServer extends AxintA2AApp {
  server: Server;
  host: string;
  port: number;
  close(): Promise<void>;
}

export function createAxintA2AApp(options: AxintA2AServerOptions = {}): AxintA2AApp {
  const host = options.host ?? "127.0.0.1";
  const port = validPort(options.port ?? 41_242);
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const stateDirectory = resolve(
    options.stateDirectory ??
      process.env.AXINT_A2A_STATE_DIR ??
      resolve(homedir(), ".axint", "a2a")
  );
  const publicUrl = normalizePublicUrl(
    options.publicUrl ?? `http://${displayHost(host)}:${port}`
  );
  const endpointUrl = new URL("/a2a", publicUrl).toString();
  const tokens = options.tokens ?? process.env.AXINT_A2A_TOKENS ?? "";
  const allowUnauthenticated = options.allowUnauthenticated === true;
  if (!isLoopback(host) && !tokens.trim() && !allowUnauthenticated) {
    throw new Error(
      "Refusing to expose an unauthenticated A2A server off loopback. Configure AXINT_A2A_TOKENS."
    );
  }

  const authenticator = new AxintA2AAuthenticator({
    tokens,
    allowUnauthenticated: allowUnauthenticated || (isLoopback(host) && !tokens.trim()),
  });
  const card = createAxintAgentCard({
    endpointUrl,
    authenticationRequired: authenticator.tokens.length > 0,
  });
  const taskStore = new AxintA2ATaskStore({ stateDirectory });
  const executor = new AxintA2AExecutor({
    projectRoot,
    runner: createAxintA2ARunner({ stateDirectory }),
  });
  const requestHandler = new DefaultRequestHandler(card, taskStore, executor);
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((request, response, next) => {
    const requestId = request.header("x-request-id")?.slice(0, 128) || randomUUID();
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    next();
  });
  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok", protocol: "A2A", version: card.version });
  });
  app.use(
    "/.well-known/agent-card.json",
    agentCardHandler({ agentCardProvider: requestHandler, cache: { maxAge: 300 } })
  );
  app.use(
    "/a2a",
    createRateLimiter(options.rateLimitPerMinute ?? 60),
    express.json({ limit: options.bodyLimit ?? "1mb", strict: true }),
    authenticator.middleware(),
    requireA2AVersion(),
    jsonRpcHandler({
      requestHandler,
      userBuilder: authenticator.userBuilder,
    })
  );
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      const status = bodyErrorStatus(error);
      response.status(status).json({
        error: status === 413 ? "payload_too_large" : "invalid_request",
        message:
          status === 413
            ? "The request body exceeds the configured limit."
            : "The request body is not valid JSON.",
      });
    }
  );

  return { app, endpointUrl, projectRoot, stateDirectory };
}

function requireA2AVersion(): RequestHandler {
  return (request, response, next) => {
    const requested = request.header("a2a-version") ?? "0.3";
    if (requested === A2A_PROTOCOL_VERSION) {
      next();
      return;
    }
    const id =
      request.body && typeof request.body === "object" && "id" in request.body
        ? request.body.id
        : null;
    response.status(400).json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: -32_009,
        message: `The requested A2A protocol version '${requested}' is not supported. Supported versions: ${A2A_PROTOCOL_VERSION}`,
      },
    });
  };
}

export async function startAxintA2AServer(
  options: AxintA2AServerOptions = {}
): Promise<RunningAxintA2AServer> {
  const host = options.host ?? "127.0.0.1";
  const port = validPort(options.port ?? 41_242);
  const created = createAxintA2AApp({ ...options, host, port });
  const server = createServer(created.app);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    ...created,
    server,
    host,
    port: actualPort,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}

function createRateLimiter(limit: number): RequestHandler {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 10_000);
  const windows = new Map<string, { startedAt: number; count: number }>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.socket.remoteAddress ?? "unknown";
    const current = windows.get(key);
    const window =
      !current || now - current.startedAt >= 60_000
        ? { startedAt: now, count: 0 }
        : current;
    window.count += 1;
    windows.set(key, window);
    response.setHeader("RateLimit-Limit", String(boundedLimit));
    response.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, boundedLimit - window.count))
    );
    if (window.count > boundedLimit) {
      response.setHeader(
        "Retry-After",
        String(Math.ceil((window.startedAt + 60_000 - now) / 1_000))
      );
      response
        .status(429)
        .json({ error: "rate_limited", message: "Too many A2A requests." });
      return;
    }
    if (windows.size > 1_000) {
      for (const [candidate, value] of windows) {
        if (now - value.startedAt >= 60_000) windows.delete(candidate);
      }
    }
    next();
  };
}

function normalizePublicUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("A2A public URL must use http or https.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("A2A public URL cannot contain credentials, a query, or a fragment.");
  }
  return url;
}

function validPort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("A2A port must be an integer from 1 through 65535.");
  }
  return value;
}

function isLoopback(host: string): boolean {
  return ["127.0.0.1", "::1", "localhost"].includes(host.toLowerCase());
}

function displayHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function bodyErrorStatus(error: unknown): number {
  const status = (error as { status?: unknown }).status;
  return status === 413 ? 413 : 400;
}
