# Axint for Xcode

Axint integrates with Xcode in two ways: as an SPM build plugin for compile-time generation, and via MCP for AI-assisted coding with Xcode's AI features.

## SPM Build Plugin (compile-time)

Add Axint to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/agenticempire/axint", from: "0.3.0"),
],
targets: [
    .target(
        name: "YourApp",
        plugins: [.plugin(name: "AxintPlugin", package: "axint")]
    ),
]
```

Place `.ts` intent files in your target's source directory. Xcode runs the Axint compiler at build time and generates Swift files automatically.

## MCP for Xcode AI

If your Xcode version supports MCP tool servers, add this to your MCP config:

```json
{
  "mcpServers": {
    "axint": {
      "command": "npx",
      "args": ["-y", "@axintai/compiler@latest", "axint-mcp"]
    }
  }
}
```

This enables Xcode's AI assistant to scaffold, compile, and validate intents directly.
