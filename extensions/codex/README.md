# Axint for OpenAI Codex

Use Axint inside OpenAI Codex to generate native Swift App Intents from TypeScript.

## Setup

Add to your Codex MCP configuration:

```json
{
  "mcpServers": {
    "axint": {
      "command": "npx",
      "args": ["-y", "@axintai/compiler@0.3.4", "axint-mcp"]
    }
  }
}
```

Codex will discover the five Axint tools automatically:

- `axint_scaffold` — generate a TypeScript intent from a description
- `axint_compile` — compile TypeScript → Swift
- `axint_validate` — validate and return diagnostics
- `axint_list_templates` — list pre-built templates
- `axint_template` — get a template's full source
