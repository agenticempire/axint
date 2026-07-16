#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = readJson("server.json");
const pkg = readJson("package.json");
const errors = [];

requireExact(
  manifest.$schema,
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "server.json $schema"
);
requireExact(manifest.name, pkg.mcpName, "server.json name");
requireNonEmpty(manifest.title, "server.json title");
requireNonEmpty(manifest.description, "server.json description");
requireExact(manifest.version, pkg.version, "server.json version");

if (typeof manifest.description === "string" && manifest.description.length > 100) {
  errors.push(
    `server.json description is ${manifest.description.length} characters; the MCP Registry limit is 100`
  );
}

const expectedPackages = new Map([
  ["npm", { identifier: pkg.name, version: pkg.version }],
  ["pypi", { identifier: "axint", version: pkg.version }],
]);

for (const [registryType, expected] of expectedPackages) {
  const entry = manifest.packages?.find(
    (candidate) => candidate.registryType === registryType
  );
  if (!entry) {
    errors.push(`server.json packages is missing ${registryType}`);
    continue;
  }
  requireExact(
    entry.identifier,
    expected.identifier,
    `server.json ${registryType} identifier`
  );
  requireExact(entry.version, expected.version, `server.json ${registryType} version`);
  requireExact(entry.transport?.type, "stdio", `server.json ${registryType} transport`);
}

const hosted = manifest.remotes?.find(
  (remote) =>
    remote.type === "streamable-http" && remote.url === "https://mcp.axint.ai/mcp"
);
if (!hosted) {
  errors.push("server.json remotes must include the production streamable-http endpoint");
}

for (const capability of ["tools", "prompts"]) {
  const value = manifest.capabilities?.[capability];
  if (!Number.isInteger(value) || value < 1) {
    errors.push(`server.json capabilities.${capability} must be a positive integer`);
  }
}

if (errors.length > 0) {
  console.error("MCP Registry manifest check failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  [
    "MCP Registry manifest verified",
    `version=${manifest.version}`,
    `description=${manifest.description.length}/100 characters`,
    `packages=${manifest.packages.length}`,
    `tools=${manifest.capabilities.tools}`,
    `prompts=${manifest.capabilities.prompts}`,
  ].join(" · ")
);

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf8"));
}

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function requireExact(actual, expected, label) {
  if (actual !== expected) {
    errors.push(
      `${label} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
    );
  }
}
