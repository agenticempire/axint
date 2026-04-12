# Axint Editor Extensions

Pre-built integrations for every major AI coding tool. Each directory contains the config or extension package for that platform.

## Quick Setup

| Tool | How to install |
|------|---------------|
| **Claude Code** | `/plugin marketplace add agenticempire/axint` |
| **Claude Desktop** | Double-click the `.mcpb` bundle (see `claude-desktop/README.md`) |
| **VS Code** | `ext install agenticempire.axint` |
| **Cursor** | Copy `cursor/mcp.json` → `.cursor/mcp.json` or search in Settings → Tools → MCP |
| **Windsurf** | Copy `windsurf/mcp_config.json` → `~/.codeium/windsurf/mcp_config.json` |
| **Codex** | Copy `codex/mcp.json` into your Codex MCP config |
| **Xcode** | Add SPM dependency (see `xcode/README.md`) |
| **JetBrains** | Settings → Tools → AI Assistant → MCP Servers (see `jetbrains/README.md`) |
| **Zed** | Add to `~/.config/zed/settings.json` (see `zed/README.md`) |
| **Neovim** | Configure your MCP plugin (see `neovim/README.md`) |

## Universal (any MCP client)

Any tool that speaks MCP over stdio can connect to Axint:

```json
{
  "mcpServers": {
    "axint": {
      "command": "npx",
      "args": ["-y", "@axintai/compiler@0.3.2", "axint-mcp"]
    }
  }
}
```

## Tools Provided

All integrations expose the same five tools:

- `axint_scaffold` — generate a TypeScript intent from a description
- `axint_compile` — compile TypeScript → Swift
- `axint_validate` — validate and return diagnostics
- `axint_list_templates` — list pre-built templates
- `axint_template` — get a template's full source
