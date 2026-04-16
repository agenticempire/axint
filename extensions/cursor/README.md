# Axint — Cursor Integration

Compile TypeScript into native Apple capabilities from Cursor.

## Install

### Option 1: Project-scoped

Copy `mcp.json` to `.cursor/mcp.json` in your project root:

```bash
mkdir -p .cursor
cp mcp.json .cursor/mcp.json
```

### Option 2: Global

Copy to your home directory:

```bash
mkdir -p ~/.cursor
cp mcp.json ~/.cursor/mcp.json
```

### Option 3: Cursor Marketplace

Search for "Axint" in Cursor Settings > Tools & MCP.

## What You Get

Thirteen tools available in Cursor's AI chat:

- `axint.scaffold` — Generate a new intent from a description
- `axint.compile` — Compile TypeScript to Swift
- `axint.validate` — Check for issues
- `axint.templates.list` — Browse pre-built patterns
- `axint.templates.get` — Pull a complete working example
- `axint.feature` — Generate a complete feature package from a description
- `axint.suggest` — Suggest Apple-native features for a domain
- `axint.schema.compile` — Minimal JSON → Swift (token-saving mode)
- `axint.swift.validate` — Validate existing Swift against build-time rules
- `axint.swift.fix` — Auto-fix mechanical Swift errors
- `axint.quick-start` — Quick-start guide
- `axint.create-intent` — Create a new intent
- `axint.create-widget` — Create a new widget

## Requirements

- Node.js 22+

## Links

- [axint.ai](https://axint.ai)
- [GitHub](https://github.com/agenticempire/axint)
