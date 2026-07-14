# Axint for Claude Desktop

Agents can write Swift. Axint makes them prove it.

Axint is the proof and repair layer for Apple coding agents. This extension
connects Claude Desktop to the installed Axint MCP server for Swift validation,
repair planning, proof orchestration, project context, and optional generation.

## Install

Double-click the `.mcpb` file, or drag it onto Claude Desktop.

## What it does

- **Check** generated or existing Swift with evidence-aware diagnostics.
- **Repair** failures through compact Fix Packets and exact next actions.
- **Run** project-aware checks and Xcode-facing proof loops.
- **Generate** App Intents, SwiftUI views, widgets, templates, and feature packages when a smaller contract helps.
- **Coordinate** project context, memory, run status, and source-free feedback packets.

After installation, call `axint.status` and `axint.activate` to verify the MCP
server and compiler are connected.

## Example

> Check the Swift I changed, identify what still needs Apple-tooling evidence,
> and give me the smallest repair and rerun plan.

Axint returns structured findings and the next proof step. On a Mac project,
finish the loop with `axint prove --dir /path/to/MyApp`.

## Privacy

The default compiler, validation, and proof paths run locally. Axint does not
upload project source unless the user explicitly chooses a hosted Cloud action.
Source-free telemetry and feedback have inspectable opt-out controls documented
in the [security policy](https://github.com/agenticempire/axint/blob/main/SECURITY.md).

## Links

- [axint.ai](https://axint.ai)
- [Documentation](https://docs.axint.ai)
- [GitHub](https://github.com/agenticempire/axint)
- [Apache-2.0 License](https://github.com/agenticempire/axint/blob/main/LICENSE)
