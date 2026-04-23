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
      "args": ["-y", "@axint/compiler", "axint-mcp"]
    }
  }
}
```

## Tools Provided

All integrations expose the same 11 MCP tools plus three built-in prompts:

- `axint.feature` — generate a complete feature package from a description
- `axint.suggest` — suggest Apple-native features for a domain
- `axint.scaffold` — generate a TypeScript intent from a description
- `axint.compile` — compile TypeScript → Swift
- `axint.validate` — validate and return diagnostics
- `axint.fix-packet` — read the latest Fix Packet for an AI repair loop
- `axint.schema.compile` — minimal JSON → Swift (token-saving mode)
- `axint.swift.validate` — validate existing Swift against build-time rules
- `axint.swift.fix` — auto-fix mechanical Swift errors
- `axint.templates.list` — list pre-built templates
- `axint.templates.get` — get a template's full source

Built-in prompts:

- `axint.quick-start` — quick-start guide
- `axint.create-intent` — create a new intent
- `axint.create-widget` — create a new widget
