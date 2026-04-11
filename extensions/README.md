# Axint Editor Extensions

Pre-built integrations for every major AI coding tool. Each directory contains the config or extension package for that platform.

## Quick Setup

| Tool | How to install |
|------|---------------|
| **Claude Code** | `/plugin marketplace add agenticempire/axint` |
| **Claude Desktop** | Copy `claude-desktop/mcp.json` into your Claude Desktop config (see `claude-desktop/README.md`) |
| **VS Code** | `ext install agenticempire.axint` |
| **Cursor** | Copy `cursor/mcp.json` → `.cursor/mcp.json` |
| **Windsurf** | Copy `windsurf/mcp_config.json` → `~/.codeium/windsurf/mcp_config.json` |

## Universal (any MCP client)

Any tool that speaks MCP over stdio can connect to Axint:

```json
{
  "mcpServers": {
    "axint": {
      "command": "npx",
      "args": ["-y", "@axintai/compiler@latest", "axint-mcp"]
    }
  }
}
```

## Tools Provided

All integrations expose the same five tools:

- `axint_scaffold` — Generate a TypeScript intent from a description
- `axint_compile` — Compile TypeScript → Swift
- `axint_validate` — Validate and return diagnostics
- `axint_list_templates` — List pre-built templates
- `axint_template` — Get a template's full source
