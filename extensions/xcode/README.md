# Axint for Xcode

Axint integrates with Xcode in five ways: as an Xcode 27 agent plugin, as an MCP server for agentic coding, as an SPM build plugin for compile-time generation, as a [native Source Editor Extension](./source-editor-extension) for in-editor quickfixes, and via the `axint xcode setup` command for one-step configuration.

## Quick Setup (recommended)

```bash
npx -y -p @axint/compiler axint xcode setup
```

This detects your Xcode version, configures Claude Code and Codex to use Axint as an MCP server, and verifies the connection. Run `axint xcode verify` afterward to confirm everything works.

If you are using Xcode's built-in Intelligence panel with Claude Agent, use the
setup command above instead of pasting the raw MCP command into the chat. Xcode
starts agents with a restricted `PATH`, so Axint writes a Claude Agent config
with absolute Node and Axint MCP paths:

```text
~/Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/.claude.json
```

After setup, restart the Xcode agent session and ask:

```text
What MCP servers are available?
```

You should see both `xcode-tools` and `axint`.

## Xcode 27 Agent Plugin

Xcode 27 can load agent plugins that bundle skills, MCP servers, and tool metadata. Axint ships a public plugin package at [`agent-plugin/plugin.json`](./agent-plugin/plugin.json) so Xcode agents can discover the Axint MCP server with branded tool names and an Apple Intelligence proof skill.

The plugin points Xcode at the npm package:

```json
{
  "mcpServers": {
    "axint": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@axint/compiler", "axint-mcp"]
    }
  }
}
```

Use the bundled `apple-intelligence-proof` skill when building App Intents schemas, Foundation Models features, previews, localization flows, or any Xcode 27 Apple Intelligence surface. It requires `axint.swift.validate`, `axint.cloud.check`, AppIntentsTesting proof for schema-backed App Intents, and focused Xcode build/test evidence before the agent can call a feature demo-ready.

## MCP for Xcode Agentic Coding

Xcode 26.3+ supports agentic coding with external agents via MCP. Axint adds specialized Apple-native feature generation on top of Xcode's built-in workspace/build/test tools.

**What Xcode's MCP gives agents:** file ops, build, test, preview, diagnostics.
**What Axint adds:** validated App Intent, SwiftUI view, WidgetKit widget generation with entitlements, Info.plist fragments, and XCTest scaffolds.

### For Claude Code

```bash
claude mcp add --transport stdio axint -- npx -y -p @axint/compiler axint-mcp
```

### For Codex CLI

```bash
codex mcp add axint -- npx -y -p @axint/compiler axint-mcp
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
      "args": ["-y", "-p", "@axint/compiler", "axint-mcp"]
    }
  }
}
```

## Tools Available

Once connected, agents gain the current 35-tool Axint MCP surface plus five built-in prompts:

- Project and session tools: `axint.status`, `axint.upgrade`, `axint.doctor`, `axint.session.start`, `axint.project.pack`, `axint.project.index`, `axint.project.syncVersion`
- Apple generation tools: `axint.feature`, `axint.suggest`, `axint.scaffold`, `axint.compile`, `axint.schema.compile`
- Proof and repair tools: `axint.validate`, `axint.swift.validate`, `axint.swift.fix`, `axint.fix-packet`, `axint.cloud.check`, `axint.repair`, `axint.run`
- Xcode and workflow tools: `axint.xcode.guard`, `axint.xcode.write`, `axint.workflow.check`, `axint.run.status`, `axint.run.cancel`
- Context and ecosystem tools: `axint.context.memory`, `axint.context.docs`, `axint.registry.search`, `axint.templates.list`, `axint.templates.get`, `axint.feedback.create`, `axint.tokens.ingest`

Built-in prompts:

| Prompt                | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `axint.quick-start`   | Get a quick-start guide for the current project |
| `axint.create-intent` | Start a new intent from guided parameters       |
| `axint.create-widget` | Start a new widget from guided parameters       |

### Composition with Xcode MCP

The recommended workflow for agents:

1. Call `axint.session.start`, then `axint.status`, so the agent proves the running version before editing.
2. Call `axint.project.index` or `axint.context.memory` when working inside an existing app.
3. Use `axint.suggest` or `axint.repair` to choose a generation or patch-first plan.
4. Generate or patch through the host-appropriate tool lane, then run `axint.swift.validate` and `axint.cloud.check`.
5. Finish with `axint.run`, focused Xcode build/test proof, and the latest Fix Packet if anything fails.

## SPM Build Plugin (compile-time)

Add Axint to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/agenticempire/axint", from: "0.4.35"),
],
targets: [
    .target(
        name: "YourApp",
        plugins: [.plugin(name: "AxintCompilePlugin", package: "axint")]
    ),
]
```

Place `.ts` intent files in your target's source directory. Xcode runs the Axint compiler at build time and generates Swift files automatically.

### Read the latest Xcode Fix Packet

Both Axint Xcode plugins emit a Fix Packet into the plugin work directory inside DerivedData:

- `AxintCompilePlugin` writes a per-file packet for generated Swift
- `AxintValidatePlugin` writes a validator packet for Swift repair loops

You do not need to hunt through DerivedData manually. Use:

```bash
axint xcode packet
```

That prints the latest packet as markdown. Useful variations:

```bash
axint xcode packet --kind validate --format prompt
axint xcode packet --kind compile --format json
axint xcode packet --format path
```

This makes the Xcode loop much smoother:

1. Build in Xcode
2. Run `axint xcode packet --kind validate --format prompt`
3. Paste the prompt into your AI tool or use it as a manual repair checklist
4. Rebuild until the packet drops to `pass`

## Example Prompts

Once Axint is connected to your Xcode agent workflow, try:

- "Use axint.suggest to recommend Apple-native features for this app"
- "Use axint.feature to add a Siri action for logging water intake"
- "Use axint.feature to create a home screen widget showing daily step count"
- "Use axint.feature to add Spotlight search for saved recipes"
