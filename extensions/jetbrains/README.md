# Axint for JetBrains IDEs

Use Axint inside WebStorm, IntelliJ IDEA, or any JetBrains IDE with AI Assistant.

## Setup

1. Open **Settings → Tools → AI Assistant → MCP Servers**
2. Click **+ Add** and paste the config from `mcp.json`:

```json
{
  "mcpServers": {
    "axint": {
      "command": "npx",
      "args": ["-y", "@axintai/compiler", "axint-mcp"]
    }
  }
}
```

3. Restart the AI Assistant. The five Axint tools are now available in chat.

Tested with WebStorm 2025.2+ and IntelliJ 2025.2+.
