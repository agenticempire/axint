#!/usr/bin/env node
// Fail if the committed metrics.json disagrees with source.
// CI runs this before releases and before docs/site builds.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeMetrics } from "./metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(ROOT, "metrics.json");

let committed;
try {
  committed = JSON.parse(readFileSync(SNAPSHOT, "utf-8"));
} catch {
  console.error(`metrics.json missing — run: npm run metrics:emit`);
  process.exit(1);
}

const fresh = computeMetrics();
const drift = diff(committed, fresh);

if (drift.length === 0) {
  console.log(`metrics.json matches source`);
  process.exit(0);
}

console.error(`metrics drift — metrics.json is stale\n`);
for (const d of drift) {
  console.error(`  ${d.path.padEnd(24)} committed=${d.committed}  source=${d.source}`);
}
console.error(`\nrun: npm run metrics:emit`);
process.exit(1);

function diff(a, b, path = "") {
  const out = [];
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    const nextPath = path ? `${path}.${key}` : key;
    const av = a?.[key];
    const bv = b?.[key];
    if (isObject(av) && isObject(bv)) {
      out.push(...diff(av, bv, nextPath));
    } else if (av !== bv) {
      out.push({ path: nextPath, committed: av, source: bv });
    }
  }
  return out;
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
