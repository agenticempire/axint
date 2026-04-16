<p align="center">
  <img src="docs/assets/logo.svg" alt="Axint" width="96" height="96" />
</p>

<h1 align="center">Axint</h1>

<p align="center">
  <strong>The Apple-native execution layer for AI agents.</strong>
</p>

<p align="center">
  Context tells agents what to build. Axint makes it shippable on Apple.<br>
  Open-source compiler that turns TypeScript into validated Swift —<br>
  App Intents, SwiftUI views, WidgetKit widgets, and full apps.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@axint/compiler"><img src="https://img.shields.io/npm/v/@axint/compiler?color=f05138&label=npm" alt="npm" /></a>
  <a href="https://github.com/agenticempire/axint/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License" /></a>
  <a href="https://github.com/agenticempire/axint/actions/workflows/ci.yml"><img src="https://github.com/agenticempire/axint/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://glama.ai/mcp/servers/agenticempire/axint"><img src="https://glama.ai/mcp/servers/agenticempire/axint/badges/score.svg" alt="axint MCP server" /></a>
  <a href="https://axint.ai"><img src="https://img.shields.io/badge/playground-axint.ai-7c3aed" alt="Playground" /></a>
</p>

<p align="center">
  <a href="https://axint.ai">Website</a> ·
  <a href="https://axint.ai/#playground">Playground</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#mcp-server">MCP Server</a> ·
  <a href="https://docs.axint.ai">Docs</a> ·
  <a href="https://registry.axint.ai">Registry</a>
</p>

---

## Why Axint

Apple's API surfaces — App Intents, SwiftUI, WidgetKit — are verbose. A single widget needs a TimelineEntry, a TimelineProvider, an EntryView, and a Widget struct before you've written a line of business logic. AI coding agents pay per token, and all that boilerplate adds up fast.

Axint compresses it. One `defineIntent()` call replaces 50–200 lines of Swift. One `defineWidget()` replaces an entire WidgetKit stack. The compiler handles the struct conformances, the `@Parameter` wrappers, the `LocalizedStringResource` literals — everything an agent would otherwise have to generate token by token.

Four surfaces, one pipeline:

```
defineIntent()  →  App Intent for Siri & Shortcuts
defineView()    →  SwiftUI view
defineWidget()  →  WidgetKit widget
defineApp()     →  Full app scaffold
```

The result: agents ship Apple features at 5–15× fewer tokens than hand-written Swift.

---

## Quick start

```bash
npm install -g @axint/compiler

# compile a single file
axint compile my-intent.ts --out ios/Intents/

# or pipe to stdout
npx @axint/compiler compile my-intent.ts --stdout
```

### Intent

```typescript
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateEvent",
  title: "Create Calendar Event",
  description: "Creates a new event in the user's calendar.",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    duration: param.duration("Event duration", { default: "1h" }),
    location: param.string("Location", { required: false }),
  },
});
```

### View

```typescript
import { defineView, prop, state, view } from "@axint/compiler";

export default defineView({
  name: "EventCard",
  props: {
    title: prop.string(),
    date: prop.date(),
  },
  state: {
    isExpanded: state.boolean(false),
  },
  body: [
    view.vstack({ alignment: "leading", spacing: 8 }, [
      view.text("entry.title"),
      view.conditional("isExpanded", [view.text("entry.date")]),
    ]),
  ],
});
```

### Widget

```typescript
import { defineWidget, entry, view } from "@axint/compiler";

export default defineWidget({
  name: "EventCountdown",
  displayName: "Event Countdown",
  description: "Shows time until the next event.",
  families: ["systemSmall", "systemMedium"],
  entry: {
    eventName: entry.string("Untitled"),
    minutesUntil: entry.int(0),
  },
  body: [
    view.vstack({ alignment: "center", spacing: 4 }, [
      view.text("entry.eventName"),
      view.text("entry.minutesUntil"),
    ]),
  ],
});
```

### App

```typescript
import { defineApp, scene, storage } from "@axint/compiler";

export default defineApp({
  name: "WeatherApp",
  scenes: [
    scene.windowGroup("WeatherDashboard"),
    scene.settings("SettingsView", { platform: "macOS" }),
  ],
  appStorage: {
    useCelsius: storage.boolean("use_celsius", true),
    lastCity: storage.string("last_city", "Cupertino"),
  },
});
```

Compile any surface the same way:

```bash
axint compile my-intent.ts --out ios/Intents/
axint compile my-view.ts --out ios/Views/
axint compile my-widget.ts --out ios/Widgets/
axint compile my-app.ts --out ios/App/
```

---

## Watch mode

Recompiles on every save with 150ms debounce, inline errors, and optional `swift build` after each successful compile:

```bash
axint watch ./intents/ --out ios/Intents/ --emit-info-plist --emit-entitlements
axint watch my-intent.ts --out ios/Intents/ --format --swift-build
```

---

## MCP server

Axint ships an MCP server for Claude Desktop, Claude Code, Cursor, Windsurf, and any MCP client.

```json
{
  "mcpServers": {
    "axint": {
      "command": "axint-mcp",
      "args": []
    }
  }
}
```

10 tools + 3 built-in prompts:

| Tool | What it does |
| --- | --- |
| `axint.compile` | Full pipeline: TypeScript → Swift + plist + entitlements |
| `axint.schema.compile` | Minimal JSON → Swift (token-saving mode for agents) |
| `axint.validate` | Dry-run validation with diagnostics |
| `axint.feature` | Generate a complete feature package from a description |
| `axint.suggest` | Suggest Apple-native features for a domain |
| `axint.scaffold` | Generate a starter TypeScript intent from a description |
| `axint.swift.validate` | Validate existing Swift against build-time rules |
| `axint.swift.fix` | Auto-fix mechanical Swift errors (concurrency, Live Activities) |
| `axint.templates.list` | List bundled reference templates |
| `axint.templates.get` | Return the source of a specific template |

Built-in prompts:

| Prompt | What it does |
| --- | --- |
| `axint.quick-start` | Get a quick-start guide |
| `axint.create-intent` | Start a new intent from guided parameters |
| `axint.create-widget` | Start a new widget from guided parameters |

`axint.schema.compile` is the key optimization — agents send ~20 tokens of JSON and get compiled Swift back directly, skipping TypeScript entirely.

---

## Diagnostics

150 diagnostic codes across eight validators with fix suggestions and color-coded output:

| Range | Domain |
| --- | --- |
| `AX000`–`AX023` | Compiler / Parser |
| `AX100`–`AX113` | Intent |
| `AX200`–`AX202` | Swift output |
| `AX300`–`AX322` | View |
| `AX400`–`AX422` | Widget |
| `AX500`–`AX522` | App |
| `AX700`–`AX749` | Swift build rules |
| `AX720`–`AX735` | Swift 6 concurrency |
| `AX740`–`AX749` | Live Activities |

```
error[AX100]: Intent name "sendMessage" must be PascalCase
  --> src/intents/messaging.ts:5:9
   = help: rename to "SendMessage"
```

Full reference: [`docs/ERRORS.md`](docs/ERRORS.md)

---

## Type mappings

| TypeScript | Swift | Default value |
| --- | --- | --- |
| `string` | `String` | ✓ |
| `int` | `Int` | ✓ |
| `double` | `Double` | ✓ |
| `float` | `Float` | ✓ |
| `boolean` | `Bool` | ✓ |
| `date` | `Date` | — |
| `duration` | `Measurement<UnitDuration>` | ✓ (`"1h"`) |
| `url` | `URL` | — |
| `optional<T>` | `T?` | ✓ |

---

## Playground

No install required — [axint.ai/#playground](https://axint.ai/#playground) runs the entire compiler in-browser with zero server round-trip.

---

## Editor extensions

Extensions for [Claude Code](extensions/claude-code), [Codex](extensions/codex), [VS Code / Cursor](extensions/vscode), [Windsurf](extensions/windsurf), [JetBrains](extensions/jetbrains), [Neovim](extensions/neovim), and [Xcode](extensions/xcode).

---

## Project structure

```
axint/
├── src/
│   ├── core/        # Parser, validator, generator, compiler, IR
│   ├── sdk/         # defineIntent(), defineView(), defineWidget(), defineApp()
│   ├── mcp/         # MCP server (10 tools + 3 prompts)
│   ├── cli/         # CLI (compile, watch, validate, eject, init, xcode)
│   └── templates/   # 25 bundled reference templates
├── python/          # Python SDK
├── extensions/      # Editor extensions (9 editors)
├── spm-plugin/      # Xcode SPM build plugin
├── tests/           # 508 vitest tests
├── examples/        # Example definitions
└── docs/            # Error reference, assets
```

---

## What's next

Current priorities — full roadmap in [`ROADMAP.md`](ROADMAP.md):

- `defineExtension()` — app extension compilation
- `IntentDialog` + richer Apple parameter types
- `swift-format` integration for generated output

---

## Contributing

PRs reviewed within 48 hours. Browse [`good first issue`](https://github.com/agenticempire/axint/issues?q=is%3Aissue+label%3A%22good+first+issue%22) to get started, or see [`CONTRIBUTING.md`](CONTRIBUTING.md).

Apache 2.0, no CLA.

---

## Requirements

- Node.js 22+
- Any OS (macOS, Linux, Windows)
- Xcode 15+ to ship the generated Swift

---

## License

[Apache 2.0](LICENSE) — fork it, extend it, ship it.

---
