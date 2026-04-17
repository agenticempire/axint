#!/usr/bin/env node
// Recompute metrics from source and write metrics.json.
//   node scripts/emit-metrics.mjs

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeMetrics } from "./metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "metrics.json");

const metrics = computeMetrics();
writeFileSync(OUT, JSON.stringify(metrics, null, 2) + "\n");

const { tests, ...flat } = metrics;
const entries = Object.entries(flat)
  .concat([
    ["tests.typescript", tests.typescript],
    ["tests.python", tests.python],
  ])
  .map(([k, v]) => `  ${k.padEnd(22)} ${v}`)
  .join("\n");

console.log(`wrote ${OUT}\n\n${entries}`);
