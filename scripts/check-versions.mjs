#!/usr/bin/env node
// Fail if any surface disagrees with root package.json.
// CI runs this to catch drift before a release ships.

import { readCanonicalVersion, SURFACES } from "./versions.mjs";

const expected = readCanonicalVersion();
const drifts = [];

for (const surface of SURFACES) {
  for (const row of surface.read()) {
    if (row.value !== expected) {
      drifts.push({ file: surface.file, where: row.where, got: row.value });
    }
  }
}

if (drifts.length === 0) {
  console.log(`all ${SURFACES.length} surfaces pinned to ${expected}`);
  process.exit(0);
}

console.error(`version drift — root package.json is ${expected}\n`);
for (const d of drifts) {
  console.error(`  ${d.file} (${d.where}) → ${d.got}`);
}
console.error(`\nrun: node scripts/sync-versions.mjs`);
process.exit(1);
