# Axint — VS Code Extension

Compile TypeScript into native Apple capabilities from VS Code. Uses the Model Context Protocol to give Copilot and other AI assistants access to the Axint compiler.

## Install

Search for "Axint" in the VS Code Extensions view, or:

```
ext install agenticempire.axint
```

## What It Does

Registers the Axint MCP server so VS Code agents can call the same ten tools
and three built-in prompts available in the CLI integrations.

Key tools:

- **axint.feature** — Generate a complete Apple-native feature package
- **axint.compile** — Compile TypeScript to Swift
- **axint.validate** — Check for issues
- **axint.schema.compile** — Compile minimal JSON directly to Swift
- **axint.templates.list** — Browse pre-built patterns
- **axint.templates.get** — Pull a complete working example
- **axint.swift.validate** / **axint.swift.fix** — Verify and repair Swift output

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
