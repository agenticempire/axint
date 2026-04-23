# Axint — Claude Desktop Extension

Compile TypeScript into native Apple App Intents, directly from Claude Desktop.

## Install

Double-click the `.mcpb` file, or drag it onto Claude Desktop.

## What It Does

Axint gives Claude 11 MCP tools plus three built-in prompts for working with Apple-native capabilities:

- **Scaffold** — Describe what you want, get a TypeScript intent file
- **Compile** — Turn TypeScript into production-ready Swift
- **Validate** — Catch issues before you touch Xcode
- **Fix Packet** — Read the latest Fix Packet for an AI repair loop
- **List Templates** — Browse bundled reference templates
- **Get Template** — Pull a complete working example
- **Feature** — Generate a complete feature package from a description
- **Suggest** — Suggest Apple-native features for a domain
- **Schema Compile** — Minimal JSON → Swift (token-saving mode)
- **Swift Validate** — Validate existing Swift against build-time rules
- **Swift Fix** — Auto-fix mechanical Swift errors
- **Quick-Start** — Built-in quick-start prompt
- **Create Intent** — Built-in prompt for creating a new intent
- **Create Widget** — Built-in prompt for creating a new widget

## Example

> "Create an App Intent that lets users send a message to a contact"

Claude scaffolds the TypeScript, compiles it to Swift, and hands you a file ready for your Xcode project.

## Privacy

Axint runs entirely on your machine. No data leaves your device. The compiler processes TypeScript locally and emits Swift — nothing is sent to any server.

See the [LICENSE](https://github.com/agenticempire/axint/blob/main/LICENSE) for details.

## Links

- [axint.ai](https://axint.ai)
- [GitHub](https://github.com/agenticempire/axint)
- [Apache-2.0 License](https://github.com/agenticempire/axint/blob/main/LICENSE)
