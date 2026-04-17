#!/usr/bin/env node
// Rewrite every surface to match root package.json. Run after bumping.
//   node scripts/sync-versions.mjs

import { readCanonicalVersion, SURFACES } from "./versions.mjs";

const version = readCanonicalVersion();

for (const surface of SURFACES) {
  surface.write(version);
  console.log(`  ${surface.file} → ${version}`);
}

console.log(`\nsynced ${SURFACES.length} surfaces to ${version}`);
