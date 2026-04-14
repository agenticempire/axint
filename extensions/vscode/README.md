# Axint — VS Code Extension

Compile TypeScript into native Apple App Intents from VS Code. Uses the Model Context Protocol to give Copilot and other AI assistants access to the Axint compiler.

## Install

Search for "Axint" in the VS Code Extensions view, or:

```
ext install agenticempire.axint
```

## What It Does

Registers an MCP server that exposes six tools to VS Code's AI features:

- **axint_scaffold** — Generate a new intent from a description
- **axint_compile** — Compile TypeScript to Swift
- **axint_validate** — Check for issues
- **axint_compile_from_schema** — Compile minimal JSON directly to Swift (intents, views, widgets)
- **axint_list_templates** — Browse pre-built patterns
- **axint_template** — Pull a complete working example

Works with GitHub Copilot in agent mode and any VS Code AI feature that supports MCP.

## Requirements

- VS Code 1.102 or later
- Node.js 22+

The extension runs `npx @axint/compiler axint-mcp` under the hood — no global install needed.

## Links

- [axint.ai](https://axint.ai)
- [GitHub](https://github.com/agenticempire/axint)

## License

Apache-2.0
