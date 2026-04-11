# Axint — Claude Code Plugin

Compile TypeScript intent definitions into native Apple App Intents. Define once in TypeScript, get production-ready Swift for Siri, Shortcuts, and Spotlight.

## Install

```
/plugin install axint
```

Or add the marketplace:

```
/plugin marketplace add agenticempire/axint
```

## What You Get

Five MCP tools available in Claude Code:

- `axint_scaffold` — Generate a new intent from a description
- `axint_compile` — Compile TypeScript → Swift
- `axint_validate` — Check for issues before building
- `axint_list_templates` — Browse 12+ pre-built intent patterns
- `axint_template` — Pull a specific template

## Quick Start

Ask Claude to create an intent:

> "Create an App Intent that lets users log a workout with type, duration, and calories"

Claude will scaffold the TypeScript, compile it to Swift, and give you a file ready to drop into Xcode.

## Links

- [axint.ai](https://axint.ai) — Docs and playground
- [GitHub](https://github.com/agenticempire/axint) — Source and issues
- [Templates](https://github.com/agenticempire/axint/tree/main/src/templates) — All built-in templates

## License

Apache-2.0
