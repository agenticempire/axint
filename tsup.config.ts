import { defineConfig } from "tsup";

export default defineConfig([
  // Core, SDK, and MCP packages
  {
    entry: {
      "core/index": "src/core/index.ts",
      "sdk/index": "src/sdk/index.ts",
      "mcp/index": "src/mcp/index.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node22",
  },
  // CLI (needs shebang banner)
  {
    entry: {
      "cli/index": "src/cli/index.ts",
    },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: true,
    target: "node22",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
