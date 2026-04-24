# Axint — VS Code Extension

Compile TypeScript into native Apple capabilities from VS Code. Axint now does more than register MCP: it can preview generated Swift, validate the current file, browse bundled templates, and jump directly into the registry and docs.

## Install

Search for "Axint" in the VS Code Extensions view, or:

```
ext install agenticempire.axint
```

## What It Does

Registers the Axint MCP server so VS Code agents can call the same ten tools
and three built-in prompts available in the CLI integrations.

It also adds command-palette workflows for:

- **Axint: Preview Swift for Current File** — compile the active Axint source and open generated Swift beside it
- **Axint: Validate Current File** — run the compiler/validator and surface diagnostics in Problems
- **Axint: Browse Bundled Templates** — explore built-in Axint templates from inside VS Code
- **Axint: Open Current File in Cloud** — send the active TypeScript or Python source into Axint Cloud for a shareable validation report
- **Axint: Open Registry** — jump straight to `registry.axint.ai`
- **Axint: Open Docs** — open `docs.axint.ai`

Key tools:

- **axint.feature** — Generate a complete Apple-native feature package
- **axint.compile** — Compile TypeScript to Swift
- **axint.validate** — Check for issues
- **axint.schema.compile** — Compile minimal JSON directly to Swift
- **axint.templates.list** — Browse pre-built patterns
- **axint.templates.get** — Pull a complete working example
- **axint.swift.validate** / **axint.swift.fix** — Verify and repair Swift output

Works with GitHub Copilot in agent mode and any VS Code AI feature that supports MCP.

## Editor Workflow

1. Open an Axint TypeScript file.
2. Run `Axint: Preview Swift for Current File` from the command palette.
3. Axint compiles the file with `@axint/compiler`, shows diagnostics in Problems, and opens generated Swift in a split editor.
4. Use `Axint: Validate Current File` for a fast validation-only pass while editing.
5. Use `Axint: Open Current File in Cloud` when you want a shareable Cloud report, saved baseline, or a handoff into the private validation workflow.

This gives you a tighter `edit -> compile -> inspect Swift -> open Cloud report` loop without leaving VS Code.

## Requirements

- VS Code 1.102 or later
- Node.js 22+

The extension runs `npx -y -p @axint/compiler axint-mcp` under the hood for MCP, and `npx -y -p @axint/compiler axint compile ... --json` for editor commands. No global install needed.

## Links

- [axint.ai](https://axint.ai)
- [GitHub](https://github.com/agenticempire/axint)

## License

Apache-2.0
