#!/usr/bin/env node
// Verify the README's public MCP docs still match the compiler surface.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = resolve(ROOT, "README.md");
const METRICS = resolve(ROOT, "metrics.json");
const SERVER_JSON = resolve(ROOT, "server.json");
const readme = readFileSync(README, "utf-8");
const metrics = JSON.parse(readFileSync(METRICS, "utf-8"));
const serverJson = JSON.parse(readFileSync(SERVER_JSON, "utf-8"));
const failures = [];

for (const toolName of metrics.mcpToolNames ?? []) {
  if (!readme.includes(`\`${toolName}\``)) {
    failures.push(`README is missing MCP tool reference: ${toolName}`);
  }
}

for (const promptName of metrics.mcpPromptNames ?? []) {
  if (!readme.includes(`\`${promptName}\``)) {
    failures.push(`README is missing MCP prompt reference: ${promptName}`);
  }
}

if (serverJson.capabilities?.tools !== metrics.mcpTools) {
  failures.push(
    `server.json capabilities.tools is ${serverJson.capabilities?.tools}, expected ${metrics.mcpTools}`
  );
}

if (serverJson.capabilities?.prompts !== metrics.mcpPrompts) {
  failures.push(
    `server.json capabilities.prompts is ${serverJson.capabilities?.prompts}, expected ${metrics.mcpPrompts}`
  );
}

const hardcodedReleaseVersions = readme.match(/\bv?\d+\.\d+\.\d+\b/g) ?? [];
if (hardcodedReleaseVersions.length > 0) {
  failures.push(
    `README hard-codes release versions: ${[...new Set(hardcodedReleaseVersions)].join(", ")}`
  );
}

if (failures.length > 0) {
  console.error("README MCP docs are stale:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "README MCP inventory matches metrics.json and contains no hard-coded release versions"
);
