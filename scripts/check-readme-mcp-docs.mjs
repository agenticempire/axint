#!/usr/bin/env node
// Verify the README's public MCP docs still match the compiler surface.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = resolve(ROOT, "README.md");
const METRICS = resolve(ROOT, "metrics.json");
const PUBLIC_TRUTH = resolve(ROOT, "..", "public-truth", "public-truth.json");

const readme = readFileSync(README, "utf-8");
const metrics = JSON.parse(readFileSync(METRICS, "utf-8"));
const publicTruth = existsSync(PUBLIC_TRUTH)
  ? JSON.parse(readFileSync(PUBLIC_TRUTH, "utf-8"))
  : null;
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

const proofMatch = readme.match(
  /<!-- truth:readme-proof-line:start -->([\s\S]*?)<!-- truth:readme-proof-line:end -->/,
);

if (!proofMatch) {
  failures.push("README public-truth proof line markers are missing");
} else {
  const proofLine = proofMatch[1].trim();
  const expectedVersion = publicTruth?.axint?.versionTag ?? `v${metrics.version}`;
  const expectedMcp =
    publicTruth?.axint?.mcp?.summary
    ?? `${metrics.mcpTools} MCP tools + ${metrics.mcpPrompts} prompts`;
  const expectedDiagnostics =
    publicTruth?.axint?.diagnostics?.summary
    ?? `${metrics.diagnostics} diagnostic codes`;
  const totalTests = (metrics.tests?.typescript ?? 0) + (metrics.tests?.python ?? 0);
  const expectedTests =
    publicTruth?.axint?.tests?.summary
    ?? `${totalTests} tests`;
  const expectedPackages =
    publicTruth?.axint?.registryPackages?.summary
    ?? `${metrics.registryPackages} live packages`;
  const expectedTemplates =
    publicTruth?.axint?.templates?.summary
    ?? `${metrics.bundledTemplates} bundled templates`;

  if (!proofLine.includes(expectedVersion)) {
    failures.push(`README proof line should include ${expectedVersion}`);
  }
  if (!proofLine.includes(expectedMcp)) {
    failures.push(`README proof line should include ${expectedMcp}`);
  }
  if (!proofLine.includes(expectedDiagnostics)) {
    failures.push(`README proof line should include ${expectedDiagnostics}`);
  }
  if (!proofLine.includes(expectedTests)) {
    failures.push(`README proof line should include ${expectedTests}`);
  }
  if (!proofLine.includes(expectedPackages)) {
    failures.push(`README proof line should include ${expectedPackages}`);
  }
  if (!proofLine.includes(expectedTemplates)) {
    failures.push(`README proof line should include ${expectedTemplates}`);
  }
}

if (failures.length > 0) {
  console.error("README MCP docs are stale:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("README MCP docs match metrics.json");
