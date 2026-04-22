#!/usr/bin/env node
// Keep ROADMAP release references and current snapshot tied to metrics.json.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROADMAP = resolve(ROOT, "ROADMAP.md");
const METRICS = resolve(ROOT, "metrics.json");
const CHECK = process.argv.includes("--check");

const metrics = JSON.parse(readFileSync(METRICS, "utf-8"));
const totalTests = Number(metrics.tests?.typescript ?? 0) + Number(metrics.tests?.python ?? 0);

const releaseLink = `[v${metrics.version}](https://github.com/agenticempire/axint/releases/tag/v${metrics.version})`;
const snapshotLine =
  `Current compiler snapshot: v${metrics.version} · ${metrics.mcpTools} MCP tools + ` +
  `${metrics.mcpPrompts} prompts · ${metrics.bundledTemplates} templates · ` +
  `${metrics.diagnostics} diagnostic codes · ${totalTests} tests.`;

const current = readFileSync(ROADMAP, "utf-8");
const next = replaceBetween(
  replaceBetween(
    current,
    "<!-- metrics:roadmap-release:start -->",
    "<!-- metrics:roadmap-release:end -->",
    releaseLink,
  ),
  "<!-- metrics:roadmap-snapshot:start -->",
  "<!-- metrics:roadmap-snapshot:end -->",
  snapshotLine,
);

if (CHECK) {
  if (next !== current) {
    console.error("ROADMAP.md metrics are stale — run: node scripts/sync-roadmap-metrics.mjs");
    process.exit(1);
  }
  console.log("ROADMAP.md matches metrics.json");
  process.exit(0);
}

writeFileSync(ROADMAP, next, "utf-8");
console.log("ROADMAP.md synced from metrics.json");

function replaceBetween(source, startMarker, endMarker, content) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing markers: ${startMarker} ... ${endMarker}`);
  }

  const before = source.slice(0, start + startMarker.length);
  const after = source.slice(end);
  return `${before}${content}${after}`;
}
