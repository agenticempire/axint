#!/usr/bin/env node

// Thin launcher — delegates to the published @axint/compiler MCP server.
// This file exists so the .mcpb bundle has a local entry point. In production
// the manifest's mcp_config uses `npx -y @axint/compiler axint-mcp` directly,
// but some environments prefer a bundled script.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  // Prefer locally installed compiler
  const require = createRequire(join(__dirname, "package.json"));
  const entry = require.resolve("@axint/compiler/mcp");
  await import(entry);
} catch {
  // Fall back to npx
  execFileSync("npx", ["-y", "@axint/compiler", "axint-mcp"], {
    stdio: "inherit",
  });
}
