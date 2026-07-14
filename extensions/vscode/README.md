# Axint for VS Code

Agents can write Swift. Axint makes them prove it.

Axint is the proof and repair layer for Apple coding agents. The VS Code
extension previews generated Swift, validates the current file, exposes repair
diagnostics in Problems, browses bundled templates, and connects compatible
agents to the Axint MCP server.

## Install

Search for "Axint" in the VS Code Extensions view, or run:

```text
ext install agenticempire.axint
```

## Commands

- **Axint: Preview Swift for Current File** compiles the active Axint source and opens generated Swift beside it.
- **Axint: Validate Current File** runs the compiler and validator, then publishes diagnostics to Problems.
- **Axint: Browse Bundled Templates** opens the installed release's template catalog.
- **Axint: Open Current File in Cloud** explicitly sends the active TypeScript or Python source to Axint Cloud for a shareable report.
- **Axint: Open Registry** opens `registry.axint.ai`.
- **Axint: Open Docs** opens `docs.axint.ai`.

The MCP connection adds the installed Axint tool and prompt surface for
generation, validation, repair, proof orchestration, and project context. Call
`axint.status` and `axint.activate` after connecting to verify the runtime.

## Editor workflow

1. Open an Axint TypeScript file.
2. Run **Axint: Preview Swift for Current File**.
3. Review generated Swift and any Problems diagnostics.
4. Run **Axint: Validate Current File** after edits.
5. Use Cloud only when a shareable hosted report is appropriate.
6. Run `axint prove --dir /path/to/MyApp` from the project when you need Xcode build and test evidence.

Local preview and validation run through `@axint/compiler`. The Cloud command is
an explicit hosted action, not part of the default local workflow.

## Requirements

- VS Code 1.102 or later
- Node.js 22+

The extension runs `npx -y -p @axint/compiler axint-mcp` for MCP and
`npx -y -p @axint/compiler axint compile ... --json` for editor commands. No
global install is required.

## Links

- [axint.ai](https://axint.ai)
- [Documentation](https://docs.axint.ai)
- [GitHub](https://github.com/agenticempire/axint)

Apache-2.0 licensed.
