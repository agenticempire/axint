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

Five tools available in Windsurf's Cascade:

- `axint_scaffold` — Generate a new intent from a description
- `axint_compile` — Compile TypeScript to Swift
- `axint_validate` — Check for issues
- `axint_list_templates` — Browse pre-built patterns
- `axint_template` — Pull a complete working example

## Requirements

- Node.js 22+

## Links

- [axint.ai](https://axint.ai)
- [GitHub](https://github.com/agenticempire/axint)
