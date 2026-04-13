import { defineConfig } from "tsup";

export default defineConfig([
  // Core and SDK packages (library — no shebang)
  {
    entry: {
      "core/index": "src/core/index.ts",
      "sdk/index": "src/sdk/index.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node22",
  },
  // CLI (needs shebang banner, no DTS)
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
  // MCP server (needs shebang for axint-mcp binary + DTS for library use)
  {
    entry: {
      "mcp/index": "src/mcp/index.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    target: "node22",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // MCP HTTP transport (shebang for axint-mcp-http binary, no DTS)
  {
    entry: {
      "mcp/http": "src/mcp/http.ts",
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
