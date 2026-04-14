<p align="center">
  <img src="docs/assets/logo.svg" alt="Axint" width="96" height="96" />
</p>

<h1 align="center">Axint</h1>

<p align="center">
  <strong>AI agents write 5–15× less code for Apple.</strong>
</p>

<p align="center">
  The open-source compiler that turns <code>defineIntent()</code>, <code>defineView()</code>, <code>defineWidget()</code>, and <code>defineApp()</code> calls<br>
  into native Swift — App Intents for Siri, SwiftUI views, WidgetKit widgets, and full app scaffolds.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@axintai/compiler"><img src="https://img.shields.io/npm/v/@axintai/compiler?color=f05138&label=npm" alt="npm" /></a>
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
  <a href="https://github.com/agenticempire/axint/discussions">Discussions</a>
</p>

---

## The compression layer for AI agents on Apple

AI coding agents pay per token. Apple's API surfaces — App Intents, SwiftUI, WidgetKit — are verbose. A single widget requires a TimelineEntry, a TimelineProvider, an EntryView, and a Widget struct before you've written a line of business logic.

Axint compresses all of that. One TypeScript definition compiles to idiomatic, production-ready Swift with zero boilerplate. An intent compresses ~4×. A view compresses ~4×. A widget compresses **13×**.

```
┌───────────────────────────────────────────┐
│  defineIntent()  defineView()             │  TypeScript / Python / JSON
│  defineWidget()  defineApp()              │
└───────────────────┬───────────────────────┘
                    │  axint compile
          ┌─────────┼─────────┐─────────┐
          ▼         ▼         ▼         ▼
     ┌────────┐ ┌───────┐ ┌────────┐ ┌──────┐
     │ .swift │ │ .swift│ │ .swift │ │.swift│
     │ .plist │ │       │ │        │ │      │
     │ .entl. │ │       │ │        │ │      │
     └────────┘ └───────┘ └────────┘ └──────┘
     App Intent  SwiftUI   WidgetKit   App
     for Siri    View      Widget      Scaffold
```

---

## Why Axint

- **Four Apple surfaces, one compiler.** App Intents, SwiftUI views, WidgetKit widgets, and full app scaffolds all compile from the same pipeline.
- **Real TypeScript AST parser.** Uses the TypeScript compiler API (same as `tsc`), not regex. Full type fidelity and diagnostics with line/column spans.
- **MCP-native with JSON schema mode.** Thirteen tools exposed to any MCP client. The `axint.schema.compile` tool accepts minimal JSON (~20 tokens) and returns compiled Swift — AI agents skip TypeScript entirely and save even more tokens.
- **Native type fidelity.** `int → Int`, `double → Double`, `date → Date`, `url → URL`, `duration → Measurement<UnitDuration>`. Default values and optionality preserved end-to-end.
- **150 diagnostic codes** (`AX000`–`AX999`) with fix suggestions and color-coded output. Intent, entity, view, widget, app, Swift concurrency, and Live Activities validators each have dedicated error ranges.
- **Sub-millisecond compile.** The [axint.ai playground](https://axint.ai/#playground) runs the full compiler in-browser with zero server round-trip.
- **500 tests.** Parser, validator, generator, emit paths, views, widgets, apps, watch mode, sandbox, MCP, Swift concurrency, and Live Activities — all covered.
- **Cross-language IR.** The intermediate representation is language-agnostic JSON. TypeScript, Python, and raw JSON all feed into the same generator. New language frontends plug in without touching the Swift emitter.
- **Apache 2.0, no CLA.** Fork it, extend it, ship it.

---

## Quick start

```bash
npm install -g @axintai/compiler

# Or run without installing
npx @axintai/compiler compile my-intent.ts --stdout
```

### Intent

```typescript
import { defineIntent, param } from "@axintai/compiler";

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
import { defineView, prop, state, view } from "@axintai/compiler";

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
import { defineWidget, entry, view } from "@axintai/compiler";

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
import { defineApp, scene, storage } from "@axintai/compiler";

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

Compile any of them:

```bash
axint compile my-intent.ts --out ios/Intents/
axint compile my-view.ts --out ios/Views/
axint compile my-widget.ts --out ios/Widgets/
axint compile my-app.ts --out ios/App/
```

---

## Watch mode

For iterative development, `axint watch` recompiles on every save:

```bash
axint watch ./intents/ --out ios/Intents/ --emit-info-plist --emit-entitlements
axint watch my-intent.ts --out ios/Intents/ --format --swift-build
```

150ms debounce, inline errors, and optional `swift build` after each successful compile.

---

## MCP server

Axint ships with `axint-mcp`, a Model Context Protocol server for Claude Desktop, Claude Code, Cursor, Windsurf, and any MCP client.

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

Thirteen tools (dotted names — legacy underscore aliases still work):

| Tool                    | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `axint.feature`         | Generate a complete feature package from a description          |
| `axint.suggest`         | Suggest Apple-native features for a given domain                |
| `axint.scaffold`        | Generate a starter TypeScript intent from a description         |
| `axint.compile`         | Full pipeline: TypeScript → Swift + plist + entitlements        |
| `axint.validate`        | Dry-run validation with diagnostics                             |
| `axint.schema.compile`  | Minimal JSON → Swift (token-saving mode for AI agents)          |
| `axint.swift.validate`  | Validate existing Swift against Axint's build-time rules        |
| `axint.swift.fix`       | Auto-fix mechanical Swift errors (concurrency, Live Activities) |
| `axint.templates.list`  | List bundled reference templates                                |
| `axint.templates.get`   | Return the source of a specific template                        |
| `axint.quick-start`     | Get a quick-start guide for Axint                               |
| `axint.create-intent`   | Create a new intent from parameters                             |
| `axint.create-widget`   | Create a new widget from parameters                             |

The schema mode is the key optimization for agents — instead of generating TypeScript and then compiling, agents send ~20 tokens of JSON and get compiled Swift back directly.

---

## Diagnostics

150 diagnostic codes across eight validators:

| Range            | Domain              |
| ---------------- | ------------------- |
| `AX000`–`AX023`  | Compiler / Parser   |
| `AX100`–`AX113`  | Intent              |
| `AX200`–`AX202`  | Swift output        |
| `AX300`–`AX322`  | View                |
| `AX400`–`AX422`  | Widget              |
| `AX500`–`AX522`  | App                 |
| `AX700`–`AX749`  | Swift build rules   |
| `AX720`–`AX735`  | Swift 6 concurrency |
| `AX740`–`AX749`  | Live Activities     |

```
error[AX100]: Intent name "sendMessage" must be PascalCase
  --> src/intents/messaging.ts:5:9
   = help: rename to "SendMessage"
```

See [`docs/ERRORS.md`](docs/ERRORS.md) for the full reference.

---

## Supported type mappings

| TypeScript       | Swift                       | Default value support |
| ---------------- | --------------------------- | --------------------- |
| `string`         | `String`                    | ✓                     |
| `int`            | `Int`                       | ✓                     |
| `double`         | `Double`                    | ✓                     |
| `float`          | `Float`                     | ✓                     |
| `boolean`        | `Bool`                      | ✓                     |
| `date`           | `Date`                      | —                     |
| `duration`       | `Measurement<UnitDuration>` | ✓ (e.g. `"1h"`)      |
| `url`            | `URL`                       | —                     |
| `optional<T>`    | `T?`                        | ✓                     |

---

## Try it in your browser

No install required: **[axint.ai/#playground](https://axint.ai/#playground)** runs the entire compiler in-browser with zero server round-trip.

---

## Requirements

- **Node.js 22+**
- Any OS: macOS, Linux, Windows
- Xcode 15+ (only to ship the generated Swift to an Apple platform)

---

## Project structure

```
axint/
├── src/
│   ├── core/        # Parser, validator, generator, compiler, types, IR
│   ├── sdk/         # defineIntent(), defineView(), defineWidget(), param/prop/state/entry helpers
│   ├── mcp/         # MCP server (13 tools including JSON schema mode)
│   ├── cli/         # axint CLI (compile, watch, validate, eject, init, xcode)
│   └── templates/   # Intent template registry (25 templates)
├── python/          # Python SDK with native Swift codegen
├── extensions/      # Claude Code, Codex, Cursor, Windsurf, Zed, JetBrains, Xcode
├── spm-plugin/      # Xcode SPM build plugin
├── tools/           # swift-syntax helper binary (POC)
├── tests/           # 500 vitest tests
├── examples/        # Example definitions
└── docs/            # Error reference, research, assets
```

---

## Contributing

We review PRs within 48 hours. Good places to start:

- Browse [`good first issue`](https://github.com/agenticempire/axint/issues?q=is%3Aissue+label%3A%22good+first+issue%22) issues
- Add a template for a common use case
- Improve diagnostics with better fix suggestions

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Apache 2.0, no CLA.

---

## Roadmap

See [`ROADMAP.md`](ROADMAP.md). Highlights:

- [x] Four compilation targets: intents, views, widgets, apps
- [x] MCP server with JSON schema mode (6 tools)
- [x] 91 diagnostic codes with fix suggestions
- [x] `--watch` mode with `--swift-build`
- [x] VS Code / Cursor extension
- [x] Python SDK with native Swift codegen
- [x] SPM build plugin for Xcode + Xcode project plugin
- [x] `axint eject` for zero-dependency Swift output
- [x] Cross-language IR bridge (TS, Python, JSON)
- [x] `defineApp()` — full app scaffold compilation
- [ ] `defineExtension()` — app extension compilation
- [ ] Axint Cloud (hosted compilation)

---

## License

[Apache 2.0](LICENSE) — fork it, extend it, ship it. No CLA.

---

<p align="center">
  Built by <a href="https://github.com/agenticempire">Agentic Empire</a> · <a href="https://axint.ai">axint.ai</a>
</p>
