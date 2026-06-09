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
| **Xcode** | Use the Xcode 27 agent plugin or add the SPM dependency (see `xcode/README.md`) |
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
      "args": ["-y", "-p", "@axint/compiler", "axint-mcp"]
    }
  }
}
```

## Tools Provided

All integrations expose the current Axint MCP surface: 36 tools plus five built-in prompts.

Core tool groups:

- Project and session tools: `axint.status`, `axint.upgrade`, `axint.doctor`, `axint.session.start`, `axint.project.pack`, `axint.project.index`, `axint.project.syncVersion`
- Apple generation tools: `axint.feature`, `axint.suggest`, `axint.scaffold`, `axint.compile`, `axint.schema.compile`
- Proof and repair tools: `axint.validate`, `axint.swift.validate`, `axint.swift.fix`, `axint.fix-packet`, `axint.cloud.check`, `axint.repair`, `axint.run`
- Xcode and workflow tools: `axint.xcode.guard`, `axint.xcode.write`, `axint.workflow.check`, `axint.run.status`, `axint.run.cancel`
- Context and ecosystem tools: `axint.context.memory`, `axint.context.docs`, `axint.registry.search`, `axint.templates.list`, `axint.templates.get`, `axint.feedback.create`, `axint.tokens.ingest`

Built-in prompts:

- `axint.quick-start` — quick-start guide
- `axint.project-start` — start a project-aware Axint loop
- `axint.context-recovery` — recover after context compaction
- `axint.create-intent` — create a new intent
- `axint.create-widget` — create a new widget
