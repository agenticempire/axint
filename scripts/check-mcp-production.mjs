#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeMetrics } from "./metrics.mjs";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const expectedVersion = process.env.AXINT_EXPECTED_VERSION || packageJson.version;
const endpoint = (process.env.AXINT_MCP_ENDPOINT || "https://mcp.axint.ai").replace(
  /\/+$/,
  ""
);
const timeoutMs = positiveInteger(process.env.AXINT_MCP_CHECK_TIMEOUT_MS, 15_000);
const metrics = computeMetrics({ countTests: false });

const expected = {
  version: expectedVersion,
  tools: metrics.mcpToolNames,
  prompts: metrics.mcpPromptNames,
};

const health = await fetchJson(`${endpoint}/health`);
const initialized = await rpc(1, "initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: {
    name: "axint-production-gate",
    version: expectedVersion,
  },
});
const tools = await rpc(2, "tools/list");
const prompts = await rpc(3, "prompts/list");
const discovered = await rpc(
  4,
  "server/discover",
  {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    },
  },
  {
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "server/discover",
  }
);
const modernTools = await rpc(
  5,
  "tools/list",
  {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        name: "axint-production-gate",
        version: expectedVersion,
      },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  },
  {
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "tools/list",
  }
);

const actualToolNames = namesFrom(tools?.result?.tools);
const actualPromptNames = namesFrom(prompts?.result?.prompts);
const failures = [];

compare("health version", health?.version, expected.version);
compare("server version", initialized?.result?.serverInfo?.version, expected.version);
compare("legacy protocol version", initialized?.result?.protocolVersion, "2025-11-25");
compare(
  "modern server version",
  discovered?.result?.serverInfo?.version,
  expected.version
);
if (!discovered?.result?.supportedVersions?.includes("2026-07-28")) {
  failures.push("modern discovery does not advertise 2026-07-28");
}
compareSet("MCP tools", actualToolNames, expected.tools);
compareSet("MCP prompts", actualPromptNames, expected.prompts);
compareSet("modern MCP tools", namesFrom(modernTools?.result?.tools), expected.tools);

if (failures.length > 0) {
  console.error(`Axint production MCP check failed for ${endpoint}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Axint production MCP verified at ${endpoint}: v${expected.version}, ` +
    `${actualToolNames.length} tools, ${actualPromptNames.length} prompts.`
);

function positiveInteger(raw, fallback) {
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function namesFrom(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (item && typeof item.name === "string" ? item.name : null))
    .filter(Boolean)
    .sort();
}

function compare(label, actual, wanted) {
  if (actual !== wanted) {
    failures.push(
      `${label}: expected ${JSON.stringify(wanted)}, received ${JSON.stringify(actual)}`
    );
  }
}

function compareSet(label, actual, wanted) {
  const actualSet = new Set(actual);
  const wantedSet = new Set(wanted);
  const missing = [...wantedSet].filter((name) => !actualSet.has(name));
  const unexpected = [...actualSet].filter((name) => !wantedSet.has(name));

  if (missing.length > 0 || unexpected.length > 0) {
    failures.push(
      `${label}: expected ${wanted.length}, received ${actual.length}` +
        `${missing.length > 0 ? `; missing ${missing.join(", ")}` : ""}` +
        `${unexpected.length > 0 ? `; unexpected ${unexpected.join(", ")}` : ""}`
    );
  }
}

async function rpc(id, method, params = {}, extraHeaders = {}) {
  return fetchJson(`${endpoint}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text);
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`Unable to verify ${url}: ${detail}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}
