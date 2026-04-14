# Axint for OpenAI Codex

Use Axint inside OpenAI Codex to generate native Swift App Intents from TypeScript.

## Setup

Add to your Codex MCP configuration:

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

Codex will discover the thirteen Axint tools automatically:

- `axint.scaffold` — generate a TypeScript intent from a description
- `axint.compile` — compile TypeScript → Swift
- `axint.validate` — validate and return diagnostics
- `axint.templates.list` — list pre-built templates
- `axint.templates.get` — get a template's full source
- `axint.feature` — generate a complete feature package from a description
- `axint.suggest` — suggest Apple-native features for a domain
- `axint.schema.compile` — minimal JSON → Swift (token-saving mode)
- `axint.swift.validate` — validate existing Swift against build-time rules
- `axint.swift.fix` — auto-fix mechanical Swift errors
- `axint.quick-start` — quick-start guide
- `axint.create-intent` — create a new intent
- `axint.create-widget` — create a new widget
