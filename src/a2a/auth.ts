import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import type { User } from "@a2a-js/sdk/server";

export interface AxintA2AToken {
  id: string;
  digest: Buffer;
}

export interface AxintA2AAuthOptions {
  tokens?: string;
  allowUnauthenticated?: boolean;
}

export class AxintA2AUser implements User {
  constructor(
    readonly userName: string,
    readonly isAuthenticated: boolean
  ) {}
}

export class AxintA2AAuthenticator {
  readonly tokens: AxintA2AToken[];
  readonly allowUnauthenticated: boolean;
  private readonly requestUsers = new WeakMap<Request, User>();

  constructor(options: AxintA2AAuthOptions = {}) {
    this.tokens = parseTokens(options.tokens ?? process.env.AXINT_A2A_TOKENS ?? "");
    this.allowUnauthenticated = options.allowUnauthenticated === true;
    if (this.tokens.length === 0 && !this.allowUnauthenticated) {
      throw new Error(
        "A2A authentication is required. Set AXINT_A2A_TOKENS=id=secret or explicitly allow unauthenticated local access."
      );
    }
  }

  middleware(): RequestHandler {
    return (request, response, next) => {
      const user = this.authenticate(request.headers.authorization);
      if (!user) {
        response.setHeader("WWW-Authenticate", 'Bearer realm="Axint A2A"');
        response.status(401).json({
          error: "unauthorized",
          message: "A valid bearer token is required.",
        });
        return;
      }
      this.requestUsers.set(request, user);
      next();
    };
  }

  userBuilder = async (request: Request): Promise<User> => {
    const cached = this.requestUsers.get(request);
    if (cached) return cached;
    const user = this.authenticate(request.headers.authorization);
    if (!user)
      throw new Error("Unauthenticated A2A request reached the protocol handler.");
    return user;
  };

  authenticate(authorization: string | undefined): User | undefined {
    if (this.tokens.length === 0) {
      return this.allowUnauthenticated
        ? new AxintA2AUser("local-anonymous", false)
        : undefined;
    }
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
    if (!match) return undefined;
    const candidate = digest(match[1]);
    let matched: AxintA2AToken | undefined;
    for (const token of this.tokens) {
      if (timingSafeEqual(candidate, token.digest)) matched = token;
    }
    return matched ? new AxintA2AUser(`token:${matched.id}`, true) : undefined;
  }
}

export function parseTokens(value: string): AxintA2AToken[] {
  if (!value.trim()) return [];
  const seen = new Set<string>();
  return value.split(",").map((entry) => {
    const separator = entry.indexOf("=");
    const id = entry.slice(0, separator).trim();
    const secret = separator >= 0 ? entry.slice(separator + 1).trim() : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(id) || secret.length < 16) {
      throw new Error(
        "AXINT_A2A_TOKENS must contain comma-separated id=secret entries with secrets of at least 16 characters."
      );
    }
    if (seen.has(id)) throw new Error(`Duplicate A2A token id: ${id}.`);
    seen.add(id);
    return { id, digest: digest(secret) };
  });
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
