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

Thirteen MCP tools available in Claude Code:

- `axint.scaffold` — Generate a new intent from a description
- `axint.compile` — Compile TypeScript → Swift
- `axint.validate` — Check for issues before building
- `axint.templates.list` — Browse 12+ pre-built intent patterns
- `axint.templates.get` — Pull a specific template
- `axint.feature` — Generate a complete feature package from a description
- `axint.suggest` — Suggest Apple-native features for a domain
- `axint.schema.compile` — Minimal JSON → Swift (token-saving mode)
- `axint.swift.validate` — Validate existing Swift against build-time rules
- `axint.swift.fix` — Auto-fix mechanical Swift errors
- `axint.quick-start` — Quick-start guide
- `axint.create-intent` — Create a new intent
- `axint.create-widget` — Create a new widget

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
