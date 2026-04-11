/**
 * Axint Registry — Cloudflare Workers
 *
 * API for publishing and installing intent packages.
 * Auth via GitHub OAuth device flow.
 */

interface Env {
  DB: D1Database;
  PACKAGES: R2Bucket;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Comma-separated GitHub user IDs allowed to publish to @axintai */
  ORG_ADMIN_IDS?: string;
}

// ─── Rate Limiter ──────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > maxRequests;
}

function getClientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// ─── Constants ─────────────────────────────────────────────────────

const MAX_PUBLISH_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_REFRESH_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days after expiry

type Handler = (req: Request, env: Env, params: Record<string, string>) => Promise<Response>;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [];

function route(method: string, path: string, handler: Handler) {
  const pattern = new RegExp(
    "^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"
  );
  routes.push({ method, pattern, handler });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function err(message: string, status: number): Response {
  return json({ error: message }, status);
}

function generateId(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(req: Request, env: Env): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const hash = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT user_id FROM tokens WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ).bind(hash).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

interface TokenRow {
  token_hash: string;
  expires_at: string | null;
}

async function getTokenData(token: string, env: Env): Promise<TokenRow | null> {
  const hash = await hashToken(token);
  return await env.DB.prepare(
    "SELECT token_hash, expires_at FROM tokens WHERE token_hash = ?"
  ).bind(hash).first<TokenRow>();
}

function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false; // Tokens with no expiry are never expired
  return Date.now() > new Date(expiresAt).getTime();
}

function isTokenRefreshable(expiresAt: string | null): boolean {
  if (!expiresAt) return true; // Tokens with no expiry can always be refreshed
  const expiryTime = new Date(expiresAt).getTime();
  const gracePeriodEnd = expiryTime + TOKEN_REFRESH_GRACE_PERIOD_MS;
  return Date.now() < gracePeriodEnd;
}

// ─── Auth: Device Code Flow ─────────────────────────────────────────

route("POST", "/api/v1/auth/device-code", async (req, env) => {
  const body = await req.json<{ client_id: string }>();
  if (!body.client_id) return err("client_id required", 400);

  const deviceCode = generateId();
  const userCode = generateCode();
  const githubState = generateId(16);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO device_codes (device_code, user_code, client_id, github_state, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(deviceCode, userCode, body.client_id, githubState, expiresAt).run();

  const verificationUri = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${githubState}&scope=read:user`;

  return json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    expires_in: 900,
    interval: 5,
  });
});

route("POST", "/api/v1/auth/token", async (req, env) => {
  const body = await req.json<{ device_code: string; grant_type: string }>();
  if (body.grant_type !== "device_code") return err("invalid grant_type", 400);

  const dc = await env.DB.prepare(
    "SELECT * FROM device_codes WHERE device_code = ? AND expires_at > datetime('now')"
  ).bind(body.device_code).first<{
    status: string;
    access_token: string | null;
    user_id: string | null;
  }>();

  if (!dc) return json({ error: "expired_token" }, 400);
  if (dc.status === "pending") return json({ error: "authorization_pending" }, 400);
  if (dc.status !== "complete" || !dc.access_token) return err("authorization failed", 400);

  return json({ access_token: dc.access_token });
});

// GitHub OAuth callback — completes the device flow
route("GET", "/api/v1/auth/callback", async (req, env) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return err("missing code or state", 400);

  // Find the device code entry
  const dc = await env.DB.prepare(
    "SELECT device_code FROM device_codes WHERE github_state = ? AND status = 'pending'"
  ).bind(state).first<{ device_code: string }>();
  if (!dc) return err("invalid or expired state", 400);

  // Exchange code for GitHub access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = await tokenRes.json<{ access_token?: string; error?: string }>();
  if (!tokenData.access_token) return err(tokenData.error ?? "github auth failed", 400);

  // Get GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "axint-registry",
    },
  });
  const ghUser = await userRes.json<{ id: number; login: string; avatar_url: string }>();

  // Upsert user
  const userId = `gh_${ghUser.id}`;
  await env.DB.prepare(
    "INSERT INTO users (id, github_id, username, avatar_url) VALUES (?, ?, ?, ?) ON CONFLICT(github_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url"
  ).bind(userId, ghUser.id, ghUser.login, ghUser.avatar_url).run();

  // Create API token
  const apiToken = generateId(48);
  const tokenHash = await hashToken(apiToken);
  await env.DB.prepare(
    "INSERT INTO tokens (id, user_id, token_hash) VALUES (?, ?, ?)"
  ).bind(generateId(), userId, tokenHash).run();

  // Complete device code
  await env.DB.prepare(
    "UPDATE device_codes SET status = 'complete', user_id = ?, access_token = ? WHERE device_code = ?"
  ).bind(userId, apiToken, dc.device_code).run();

  return new Response(
    `<html><body style="font-family:system-ui;text-align:center;padding:4rem">
      <h2>Logged in as ${ghUser.login}</h2>
      <p>You can close this window and return to your terminal.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
});

// ─── Token Revocation ──────────────────────────────────────────────

route("POST", "/api/v1/auth/revoke", async (req, env) => {
  const userId = await authenticate(req, env);
  if (!userId) return err("unauthorized", 401);

  const auth = req.headers.get("Authorization")!;
  const token = auth.slice(7);
  const hash = await hashToken(token);

  await env.DB.prepare("DELETE FROM tokens WHERE token_hash = ? AND user_id = ?")
    .bind(hash, userId)
    .run();

  return json({ revoked: true });
});

route("POST", "/api/v1/auth/revoke-all", async (req, env) => {
  const userId = await authenticate(req, env);
  if (!userId) return err("unauthorized", 401);

  await env.DB.prepare("DELETE FROM tokens WHERE user_id = ?")
    .bind(userId)
    .run();

  return json({ revoked: true, all: true });
});

// ─── Token Refresh ─────────────────────────────────────────────────

route("POST", "/api/v1/auth/refresh", async (req, env) => {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return err("missing or invalid token", 401);

  const token = auth.slice(7);
  const tokenData = await getTokenData(token, env);
  if (!tokenData) return err("token not found", 401);

  // Check if token is still refreshable (within grace period)
  if (!isTokenRefreshable(tokenData.expires_at)) {
    return err("token expired and is no longer refreshable", 401);
  }

  // Get user_id from token
  const hash = await hashToken(token);
  const tokenRow = await env.DB.prepare(
    "SELECT user_id FROM tokens WHERE token_hash = ?"
  ).bind(hash).first<{ user_id: string }>();
  if (!tokenRow) return err("token not found", 401);

  const userId = tokenRow.user_id;

  // Generate new token with fresh expiry
  const newToken = generateId(48);
  const newTokenHash = await hashToken(newToken);
  const newExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();

  await env.DB.prepare(
    "INSERT INTO tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(generateId(), userId, newTokenHash, newExpiresAt).run();

  return json({
    access_token: newToken,
    expires_in: Math.floor(TOKEN_EXPIRY_MS / 1000),
  });
});

// ─── Publish ────────────────────────────────────────────────────────

route("POST", "/api/v1/publish", async (req, env) => {
  const userId = await authenticate(req, env);
  if (!userId) return err("unauthorized", 401);

  // Enforce request size limit
  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PUBLISH_BODY_BYTES) {
    return err(`payload too large (max ${MAX_PUBLISH_BODY_BYTES / 1024 / 1024}MB)`, 413);
  }

  const body = await req.json<{
    namespace: string;
    slug: string;
    name: string;
    version: string;
    description?: string;
    readme?: string;
    primary_language?: string;
    surface_areas?: string[];
    tags?: string[];
    license?: string;
    homepage?: string;
    repository?: string;
    ts_source: string;
    py_source?: string;
    swift_output: string;
    plist_fragment?: string;
    ir: Record<string, unknown>;
    compiler_version: string;
  }>();

  if (!body.namespace || !body.slug || !body.version || !body.ts_source || !body.swift_output) {
    return err("missing required fields: namespace, slug, version, ts_source, swift_output", 400);
  }

  // Validate namespace matches user
  const user = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first<{ username: string }>();
  const expectedNamespace = `@${user?.username}`;
  if (body.namespace !== expectedNamespace) {
    // Only org admins can publish to @axintai
    if (body.namespace === "@axintai") {
      const adminIds = (env.ORG_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!adminIds.includes(userId)) {
        return err("only org admins can publish to the @axintai namespace", 403);
      }
    } else {
      return err(`namespace must be ${expectedNamespace} (your GitHub username)`, 403);
    }
  }

  // Check if package exists
  let pkg = await env.DB.prepare(
    "SELECT id, owner_id FROM packages WHERE namespace = ? AND slug = ?"
  ).bind(body.namespace, body.slug).first<{ id: number; owner_id: string }>();

  if (pkg && pkg.owner_id !== userId) {
    return err("you don't own this package", 403);
  }

  // Check for duplicate version
  if (pkg) {
    const existing = await env.DB.prepare(
      "SELECT id FROM versions WHERE package_id = ? AND version = ?"
    ).bind(pkg.id, body.version).first();
    if (existing) return err(`version ${body.version} already exists`, 409);
  }

  // Create or update package
  if (!pkg) {
    const result = await env.DB.prepare(
      "INSERT INTO packages (namespace, slug, name, description, latest_version, owner_id, license, homepage, repository) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
    ).bind(
      body.namespace, body.slug, body.name, body.description ?? "",
      body.version, userId, body.license ?? "Apache-2.0",
      body.homepage ?? null, body.repository ?? null
    ).first<{ id: number }>();
    pkg = { id: result!.id, owner_id: userId };
  } else {
    await env.DB.prepare(
      "UPDATE packages SET latest_version = ?, updated_at = datetime('now'), description = ?, name = ? WHERE id = ?"
    ).bind(body.version, body.description ?? "", body.name, pkg.id).run();
  }

  // Store version in R2 for large payloads
  const r2Key = `${body.namespace}/${body.slug}/${body.version}.json`;
  await env.PACKAGES.put(r2Key, JSON.stringify({
    ts_source: body.ts_source,
    py_source: body.py_source,
    swift_output: body.swift_output,
    plist_fragment: body.plist_fragment,
    ir: body.ir,
  }));

  // Insert version row — large payloads live in R2, D1 stores metadata only
  await env.DB.prepare(
    `INSERT INTO versions (package_id, version, ts_source, py_source, swift_output, plist_fragment, ir, readme, tags, surface_areas, primary_language, compiler_version, r2_key)
     VALUES (?, ?, '', '', '', '', '{}', ?, ?, ?, ?, ?, ?)`
  ).bind(
    pkg.id, body.version, body.readme ?? null,
    JSON.stringify(body.tags ?? []), JSON.stringify(body.surface_areas ?? []),
    body.primary_language ?? "typescript", body.compiler_version, r2Key
  ).run();

  return json({
    url: `https://registry.axint.ai/${body.namespace}/${body.slug}`,
    version: body.version,
  }, 201);
});

// ─── Install ────────────────────────────────────────────────────────

route("GET", "/api/v1/install", async (req, env) => {
  const url = new URL(req.url);
  const namespace = url.searchParams.get("namespace");
  const slug = url.searchParams.get("slug");
  const version = url.searchParams.get("version");

  if (!namespace || !slug) return err("namespace and slug required", 400);

  const pkg = await env.DB.prepare(
    "SELECT id, latest_version FROM packages WHERE namespace = ? AND slug = ?"
  ).bind(namespace, slug).first<{ id: number; latest_version: string }>();

  if (!pkg) return err("package not found", 404);

  const targetVersion = version ?? pkg.latest_version;
  const ver = await env.DB.prepare(
    "SELECT r2_key, readme, tags, surface_areas, primary_language, compiler_version FROM versions WHERE package_id = ? AND version = ?"
  ).bind(pkg.id, targetVersion).first<{
    r2_key: string;
    readme: string | null;
    tags: string;
    surface_areas: string;
    primary_language: string;
    compiler_version: string;
  }>();

  if (!ver) return err(`version ${targetVersion} not found`, 404);

  // Read source payload from R2
  const r2Obj = await env.PACKAGES.get(ver.r2_key);
  if (!r2Obj) return err("package data missing from storage", 500);
  const payload = await r2Obj.json<{
    ts_source: string;
    py_source?: string;
    swift_output: string;
    plist_fragment?: string;
    ir: Record<string, unknown>;
  }>();

  // Increment downloads
  await env.DB.prepare(
    "UPDATE packages SET downloads = downloads + 1 WHERE id = ?"
  ).bind(pkg.id).run();

  return json({
    namespace,
    slug,
    version: targetVersion,
    ts_source: payload.ts_source,
    py_source: payload.py_source ?? null,
    swift_output: payload.swift_output,
    plist_fragment: payload.plist_fragment ?? null,
    ir: payload.ir,
    readme: ver.readme,
    tags: JSON.parse(ver.tags),
    surface_areas: JSON.parse(ver.surface_areas),
    primary_language: ver.primary_language,
    compiler_version: ver.compiler_version,
  });
});

// ─── Search ─────────────────────────────────────────────────────────

route("GET", "/api/v1/search", async (req, env) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  let results;
  let totalCount: number;

  if (q) {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM packages WHERE name LIKE ? OR slug LIKE ? OR description LIKE ?"
    ).bind(`%${q}%`, `%${q}%`, `%${q}%`).first<{ n: number }>();
    totalCount = countRow?.n ?? 0;

    results = await env.DB.prepare(
      `SELECT p.namespace, p.slug, p.name, p.description, p.latest_version, p.downloads, p.license,
              u.username as author
       FROM packages p
       JOIN users u ON p.owner_id = u.id
       WHERE p.name LIKE ? OR p.slug LIKE ? OR p.description LIKE ?
       ORDER BY p.downloads DESC
       LIMIT ? OFFSET ?`
    ).bind(`%${q}%`, `%${q}%`, `%${q}%`, limit, offset).all();
  } else {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM packages"
    ).first<{ n: number }>();
    totalCount = countRow?.n ?? 0;

    results = await env.DB.prepare(
      `SELECT p.namespace, p.slug, p.name, p.description, p.latest_version, p.downloads, p.license,
              u.username as author
       FROM packages p
       JOIN users u ON p.owner_id = u.id
       ORDER BY p.downloads DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
  }

  return json({
    results: results.results,
    total: totalCount,
  });
});

// ─── Package detail ─────────────────────────────────────────────────

route("GET", "/api/v1/packages/:namespace/:slug", async (_req, env, params) => {
  const namespace = `@${params.namespace}`;
  const pkg = await env.DB.prepare(
    `SELECT p.*, u.username as author, u.avatar_url as author_avatar
     FROM packages p
     JOIN users u ON p.owner_id = u.id
     WHERE p.namespace = ? AND p.slug = ?`
  ).bind(namespace, params.slug).first();

  if (!pkg) return err("not found", 404);

  const versions = await env.DB.prepare(
    "SELECT version, created_at, compiler_version FROM versions WHERE package_id = ? ORDER BY created_at DESC"
  ).bind(pkg.id as number).all();

  return json({ ...pkg, versions: versions.results });
});

// ─── Health ─────────────────────────────────────────────────────────

route("GET", "/api/v1/health", async (_req, env) => {
  const count = await env.DB.prepare("SELECT COUNT(*) as n FROM packages").first<{ n: number }>();
  return json({ status: "ok", packages: count?.n ?? 0 });
});

// ─── Router ─────────────────────────────────────────────────────────

import { renderHomePage, renderSearchPage, renderPackagePage, renderNotFound } from "./frontend.js";

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https:; font-src https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Axint-Version",
        },
      });
    }

    const url = new URL(req.url);
    const clientIp = getClientIp(req);

    // Global rate limit: 120 requests/minute per IP
    if (rateLimit(`global:${clientIp}`, 120, 60_000)) {
      return json({ error: "rate limit exceeded" }, 429);
    }

    // Stricter limits on auth endpoints: 10 requests/minute per IP
    if (url.pathname.startsWith("/api/v1/auth/")) {
      if (rateLimit(`auth:${clientIp}`, 10, 60_000)) {
        return json({ error: "rate limit exceeded" }, 429);
      }
    }

    // Stricter limits on publish: 30 requests/hour per IP
    if (url.pathname === "/api/v1/publish" && req.method === "POST") {
      if (rateLimit(`publish:${clientIp}`, 30, 3_600_000)) {
        return json({ error: "rate limit exceeded" }, 429);
      }
    }

    // API routes
    for (const r of routes) {
      if (req.method !== r.method) continue;
      const match = url.pathname.match(r.pattern);
      if (match) {
        try {
          return await r.handler(req, env, match.groups ?? {});
        } catch (e) {
          console.error(e);
          return err("internal server error", 500);
        }
      }
    }

    // Frontend routes (GET only)
    if (req.method === "GET") {
      // Home page
      if (url.pathname === "/") {
        const featured = await env.DB.prepare(
          `SELECT p.namespace, p.slug, p.name, p.description, p.latest_version as version, p.downloads, p.license,
                  u.username as author
           FROM packages p
           JOIN users u ON p.owner_id = u.id
           ORDER BY p.downloads DESC LIMIT 12`
        ).all();
        return html(renderHomePage(featured.results as never[]));
      }

      // Search page
      if (url.pathname === "/search") {
        const q = url.searchParams.get("q") ?? "";
        const results = await env.DB.prepare(
          `SELECT p.namespace, p.slug, p.name, p.description, p.latest_version as version, p.downloads,
                  u.username as author
           FROM packages p
           JOIN users u ON p.owner_id = u.id
           WHERE p.name LIKE ? OR p.slug LIKE ? OR p.description LIKE ?
           ORDER BY p.downloads DESC LIMIT 50`
        ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
        return html(renderSearchPage(q, results.results as never[]));
      }

      // Package detail: /@namespace/slug
      const pkgMatch = url.pathname.match(/^\/@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/);
      if (pkgMatch) {
        const [, ns, slug] = pkgMatch;
        const namespace = `@${ns}`;
        const pkg = await env.DB.prepare(
          `SELECT p.*, u.username as author, u.avatar_url as author_avatar
           FROM packages p JOIN users u ON p.owner_id = u.id
           WHERE p.namespace = ? AND p.slug = ?`
        ).bind(namespace, slug).first();

        if (!pkg) return html(renderNotFound(), 404);

        const versions = await env.DB.prepare(
          "SELECT version, created_at as publishedAt, compiler_version FROM versions WHERE package_id = ? ORDER BY created_at DESC"
        ).bind(pkg.id as number).all();

        const latest = await env.DB.prepare(
          "SELECT readme, swift_output FROM versions WHERE package_id = ? AND version = ?"
        ).bind(pkg.id as number, pkg.latest_version as string).first<{ readme: string | null; swift_output: string }>();

        return html(renderPackagePage({
          ...(pkg as never),
          version: pkg.latest_version as string,
          readme: latest?.readme ?? "",
          versions: versions.results.map((v: Record<string, unknown>) => ({
            version: v.version as string,
            publishedAt: v.publishedAt as string,
            swiftOutputPreview: v === versions.results[0] ? latest?.swift_output?.slice(0, 500) : undefined,
          })),
        }));
      }
    }

    return html(renderNotFound(), 404);
  },
};
