# Axint for Xcode

Axint integrates with Xcode in four ways: as an MCP server for agentic coding, as an SPM build plugin for compile-time generation, as a [native Source Editor Extension](./source-editor-extension) for in-editor quickfixes, and via the `axint xcode setup` command for one-step configuration.

## Quick Setup (recommended)

```bash
npx -y -p @axint/compiler axint xcode setup
```

This detects your Xcode version, configures Claude Code and Codex to use Axint as an MCP server, and verifies the connection. Run `axint xcode verify` afterward to confirm everything works.

## MCP for Xcode Agentic Coding

Xcode 26.3+ supports agentic coding with external agents via MCP. Axint adds specialized Apple-native feature generation on top of Xcode's built-in workspace/build/test tools.

**What Xcode's MCP gives agents:** file ops, build, test, preview, diagnostics.
**What Axint adds:** validated App Intent, SwiftUI view, WidgetKit widget generation with entitlements, Info.plist fragments, and XCTest scaffolds.

### For Claude Code

```bash
claude mcp add --transport stdio axint -- npx -y @axint/compiler axint-mcp
```

### For Codex CLI

```bash
codex mcp add axint -- npx -y @axint/compiler axint-mcp
```

### Remote MCP (no local Node.js required)

```json
{
  "mcpServers": {
    "axint": {
      "url": "https://mcp.axint.ai/mcp"
    }
  }
}
```

### For any MCP-compatible agent

```json
{
  "mcpServers": {
    "axint": {
      "command": "npx",
      "args": ["-y", "@axint/compiler", "axint-mcp"]
    }
  }
}
```

## Tools Available

Once connected, agents gain 10 specialized tools plus 3 built-in prompts:

| Tool | What it does |
|------|-------------|
| `axint.feature` | Generate a complete Apple-native feature package from a description |
| `axint.suggest` | Suggest Apple-native features for an app domain |
| `axint.scaffold` | Generate a starter TypeScript intent file |
| `axint.compile` | Compile TypeScript → validated Swift |
| `axint.validate` | Validate without code generation |
| `axint.schema.compile` | Compile minimal JSON → Swift (token-optimized) |
| `axint.swift.validate` | Validate existing Swift against Axint's build-time rules |
| `axint.swift.fix` | Auto-fix mechanical Swift validator errors |
| `axint.templates.list` | List bundled reference templates |
| `axint.templates.get` | Get a specific template's source |

Built-in prompts:

| Prompt | What it does |
|------|-------------|
| `axint.quick-start` | Get a quick-start guide for the current project |
| `axint.create-intent` | Start a new intent from guided parameters |
| `axint.create-widget` | Start a new widget from guided parameters |

### Composition with Xcode MCP

The recommended workflow for agents:

1. Call `axint.suggest` to discover what features to add
2. Call `axint.feature` to generate the complete feature package
3. Use Xcode's `XcodeWrite` to place each file in the project
4. Use Xcode's `BuildProject` to verify the build passes
5. Use Xcode's `RenderPreview` to check the UI

## SPM Build Plugin (compile-time)

Add Axint to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/agenticempire/axint", from: "0.3.9"),
],
targets: [
    .target(
        name: "YourApp",
        plugins: [.plugin(name: "AxintCompilePlugin", package: "axint")]
    ),
]
```

Place `.ts` intent files in your target's source directory. Xcode runs the Axint compiler at build time and generates Swift files automatically.

## Example Prompts

Once Axint is connected to your Xcode agent workflow, try:

- "Use axint.suggest to recommend Apple-native features for this app"
- "Use axint.feature to add a Siri action for logging water intake"
- "Use axint.feature to create a home screen widget showing daily step count"
- "Use axint.feature to add Spotlight search for saved recipes"
