import { defineConfig } from "tsup";

const bundledMcpDependencies = ["@modelcontextprotocol/sdk"];

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
    sourcemap: false,
    target: "node22",
    noExternal: bundledMcpDependencies,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // Importable MCP module (pure exports, no shebang)
  {
    entry: {
      "mcp/index": "src/mcp/index.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: false,
    target: "node22",
    noExternal: bundledMcpDependencies,
  },
  // Importable A2A adapter and direct axint-a2a executable
  {
    entry: {
      "a2a/index": "src/a2a/index.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: false,
    target: "node22",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // MCP stdio binary (side-effectful axint-mcp entrypoint)
  {
    entry: {
      "mcp/register": "src/mcp/register.ts",
    },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: false,
    target: "node22",
    noExternal: bundledMcpDependencies,
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
    sourcemap: false,
    target: "node22",
    noExternal: bundledMcpDependencies,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
