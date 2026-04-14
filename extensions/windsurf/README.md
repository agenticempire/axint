# Axint — Windsurf Integration

Compile TypeScript into native Apple App Intents from Windsurf.

## Install

### Option 1: Config file

Copy the MCP config to your Windsurf config directory:

**macOS / Linux:**
```bash
cp mcp_config.json ~/.codeium/windsurf/mcp_config.json
```

**Windows:**
```powershell
copy mcp_config.json %USERPROFILE%\.codeium\windsurf\mcp_config.json
```

If you already have an `mcp_config.json`, merge the `axint` entry into your existing `mcpServers` object.

After editing the config, fully quit and reopen Windsurf.

### Option 2: Windsurf MCP Marketplace

Click the MCP icon in the Cascade panel and search for "Axint".

## What You Get

Thirteen tools available in Windsurf's Cascade:

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
