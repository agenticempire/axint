# Axint for OpenAI Codex

Use Axint inside Codex to generate, validate, repair, and prove Apple-native capabilities.

## Setup

Add to your Codex MCP configuration:

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

The host discovers the MCP tools and built-in prompts from the installed Axint release automatically. Core tools include:

- `axint.scaffold` — generate a TypeScript intent from a description
- `axint.compile` — compile TypeScript → Swift
- `axint.validate` — validate and return diagnostics
- `axint.fix-packet` — read the latest Fix Packet for an AI repair loop
- `axint.templates.list` — list pre-built templates
- `axint.templates.get` — get a template's full source
- `axint.feature` — generate a complete feature package from a description
- `axint.suggest` — suggest Apple-native features for a domain
- `axint.schema.compile` — minimal JSON → Swift (token-saving mode)
- `axint.swift.validate` — validate existing Swift against build-time rules
- `axint.swift.fix` — auto-fix mechanical Swift errors

Project-aware tools such as `axint.project.index`, `axint.context.memory`, `axint.workflow.check`, `axint.run`, and `axint.project.syncVersion` keep long-running Codex threads aligned with the local project and current Axint version.

Built-in prompts:

- `axint.quick-start` — quick-start guide
- `axint.project-start` — start a project-aware Axint loop
- `axint.context-recovery` — recover after compaction or a restarted thread
- `axint.create-intent` — create a new intent
- `axint.create-widget` — create a new widget
