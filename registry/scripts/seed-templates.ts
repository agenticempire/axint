/**
 * Seed Registry Templates
 *
 * Reads all templates from the compiler and publishes them to the registry as
 * @axintai/<slug> packages. Requires AXINT_TOKEN env var with publish credentials.
 *
 * Usage:
 *   AXINT_TOKEN=<token> npx tsx registry/scripts/seed-templates.ts
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import templates from the compiler
const templatesPath = `${__dirname}/../../src/templates/index.js`;
const { TEMPLATES } = await import(templatesPath);

// Import compiler
const { compileFile } = await import(`${__dirname}/../../src/core/compiler.js`);

const registryUrl = process.env.AXINT_REGISTRY_URL ?? "https://registry.axint.ai";
const token = process.env.AXINT_TOKEN;

if (!token) {
  console.error("error: AXINT_TOKEN environment variable required");
  console.error("  usage: AXINT_TOKEN=<token> npx tsx registry/scripts/seed-templates.ts");
  process.exit(1);
}

console.log();
console.log("  Publishing bundled templates to registry…");
console.log();

let published = 0;
let failed = 0;

for (const template of TEMPLATES) {
  const pkg = `@axintai/${template.id}`;

  try {
    // Create a temporary file in memory and compile
    // We'll use a simple approach: evaluate the template source to get the intent definition
    const tmpFile = `/tmp/axint-seed-${template.id}.ts`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(tmpFile, template.source, "utf-8");

    const result = await compileFile(tmpFile, { validate: true });

    if (!result.success || !result.output) {
      console.log(`  ✗ ${pkg} — compilation failed`);
      failed++;
      continue;
    }

    // Build the publish payload
    const payload = {
      namespace: "@axintai",
      slug: template.id,
      name: template.title,
      version: "1.0.0",
      description: template.description,
      primary_language: "typescript",
      surface_areas: [template.domain],
      tags: [template.category, template.domain],
      license: "Apache-2.0",
      ts_source: template.source,
      py_source: null,
      swift_output: result.output.swiftCode,
      plist_fragment: result.output.infoPlistFragment ?? null,
      ir: result.output.ir ?? {},
    };

    // POST to registry
    const res = await fetch(`${registryUrl}/api/v1/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ detail: res.statusText }))) as {
        detail?: string;
      };
      console.log(`  ✗ ${pkg} — ${err.detail ?? `HTTP ${res.status}`}`);
      failed++;
      continue;
    }

    console.log(`  ✓ ${pkg}`);
    published++;
  } catch (err: unknown) {
    console.log(`  ✗ ${pkg} — ${(err as Error).message}`);
    failed++;
  }
}

console.log();
console.log(`  ${published} published, ${failed} failed`);
console.log();

if (failed > 0) {
  process.exit(1);
}
