# Axint for Zed

Use Axint inside Zed's AI panel via context servers.

## Setup

Add to your Zed settings (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "axint": {
      "command": {
        "path": "npx",
        "args": ["-y", "@axintai/compiler@0.3.4", "axint-mcp"]
      }
    }
  }
}
```

The five Axint tools will appear in Zed's AI assistant automatically.

Requires Zed 0.160+ with context server support.
