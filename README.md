<p align="center">
  <img src="docs/assets/logo.svg" alt="Axint" width="96" height="96" />
</p>

<h1 align="center">Axint</h1>

<p align="center">
  <strong>Write an App Intent in TypeScript, ship it to Siri.</strong>
</p>

<p align="center">
  The open-source compiler that turns one <code>defineIntent()</code> call into two agent surfaces:<br>
  a native Swift App Intent for Siri — <em>and</em> an MCP tool for Claude, Cursor, and Windsurf.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@axintai/compiler"><img src="https://img.shields.io/npm/v/@axintai/compiler?color=f05138&label=npm" alt="npm" /></a>
  <a href="https://github.com/agenticempire/axint/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License" /></a>
  <a href="https://github.com/agenticempire/axint/actions"><img src="https://img.shields.io/badge/tests-117%20passing-brightgreen" alt="Tests" /></a>
  <a href="https://axint.ai"><img src="https://img.shields.io/badge/playground-axint.ai-7c3aed" alt="Playground" /></a>
  <a href="https://axint.ai/wwdc"><img src="https://img.shields.io/badge/WWDC%202026-60%20days-f05138" alt="WWDC 2026" /></a>
</p>

<p align="center">
  <a href="https://axint.ai">Website</a> ·
  <a href="https://axint.ai/#playground">Playground</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#mcp-server">MCP Server</a> ·
  <a href="https://github.com/agenticempire/axint/discussions">Discussions</a>
</p>

---

## The picks and shovels of Agent Siri

WWDC 2026 is weeks away. Apple is fusing **Model Context Protocol with App Intents** on iOS 26.1 and macOS Tahoe 26.1 — Agent Siri runs a 3B-parameter on-device model that invokes App Intents as tools. Every App Intent you ship today automatically becomes an MCP-addressable capability tomorrow.

Axint is the fastest path from an AI coding tool to a shipped App Intent. **One TypeScript definition. Two agent surfaces. Zero Swift required.**

```
┌──────────────────────────────┐
│  defineIntent({ ... })       │   one TypeScript source
└──────────────┬───────────────┘
               │  axint compile
       ┌───────┴────────┐
       ▼                ▼
┌─────────────┐   ┌──────────────┐
│ .swift      │   │ MCP tool     │
│ .plist      │   │ (Claude,     │
│ .entitl.    │   │  Cursor,     │
│             │   │  Windsurf)   │
└─────────────┘   └──────────────┘
   Siri, Shortcuts,      Your AI
   Spotlight, Agent      coding agent
   Siri, Apple Intel.
```

---

## Why Axint v0.2.0

- **Real TypeScript AST parser.** Not regex. Uses the TypeScript compiler API, same as `tsc`, so you get full type fidelity and proper diagnostics with line/column spans.
- **Native type fidelity.** `int → Int`, `double → Double`, `float → Float`, `date → Date`, `url → URL`, `duration → Measurement<UnitDuration>`, `optional<T> → T?`. Default values and optionality are preserved end-to-end.
- **Return-type-aware `perform()` signatures.** Every generated intent is a drop-in tool for Agent Siri and Shortcuts.
- **Info.plist and .entitlements emit.** Axint writes the `NSAppIntentsDomains` plist fragment and the App Intents entitlement XML alongside your `.swift` file. Drop all three into Xcode and ship.
- **MCP-native.** A bundled `axint-mcp` server exposes `axint_scaffold`, `axint_compile`, and `axint_validate` to any MCP client. Your AI coding agent can read your project, draft a TypeScript intent, compile it, and open a PR — without a human touching Xcode.
- **Rust-grade diagnostics.** 16 diagnostic codes (`AX001`–`AX202`) with fix suggestions and color-coded output.
- **Sub-millisecond compile.** A typical intent compiles in under a millisecond. The [axint.ai playground](https://axint.ai/#playground) runs the full compiler in your browser with zero server round-trip.
- **117 tests.** Parser, validator, generator, and emit paths — all covered.
- **Apache 2.0, no CLA.** Fork it, extend it, ship it.

---

## Quick start

```bash
# Install globally
npm install -g @axintai/compiler

# Or use without installing
npx axint compile my-intent.ts --stdout
```

Create `my-intent.ts`:

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
  perform: async ({ title, date, duration, location }) => {
    return { success: true };
  },
});
```

Compile it:

```bash
axint compile my-intent.ts --out ios/Intents/
```

You get three files ready to drop into Xcode:

```
ios/Intents/
├── CreateEventIntent.swift            # AppIntent struct
├── CreateEventIntent.plist.fragment.xml   # NSAppIntentsDomains
└── CreateEventIntent.entitlements.fragment.xml  # App Intents entitlement
```

---

## Compiled Swift output

```swift
// CreateEventIntent.swift
// Generated by Axint — https://github.com/agenticempire/axint
// Do not edit manually. Re-run `axint compile` to regenerate.

import AppIntents
import Foundation

struct CreateEventIntent: AppIntent {
    static let title: LocalizedStringResource = "Create Calendar Event"
    static let description: IntentDescription = IntentDescription("Creates a new event in the user's calendar.")

    @Parameter(title: "Event title")
    var title: String

    @Parameter(title: "Event date")
    var date: Date

    @Parameter(title: "Event duration")
    var duration: Measurement<UnitDuration> = .init(value: 1, unit: .hours)

    @Parameter(title: "Location")
    var location: String?

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        // TODO: Implement your intent logic here.
        // Parameters available: \(title), \(date), \(duration), \(location)
        return .result(value: "")
    }
}
```

---

## How Axint works

Four passes. Zero Xcode.

1. **Parse** — TypeScript `defineIntent({ ... })` calls are parsed with the real TypeScript compiler API (not regex) into a typed intermediate representation.
2. **Validate** — 16 diagnostic codes (`AX001`–`AX202`) catch invalid App Intent shapes before Swift ever sees them. Return-type inference and default-value sanity checks included.
3. **Generate** — Idiomatic Swift is emitted: `AppIntent` conformance, `@Parameter` decorators, `LocalizedStringResource` titles, return-type-aware `perform()`.
4. **Emit** — An Info.plist XML fragment (for `NSAppIntentsDomains`) and a `.entitlements` XML fragment (for the App Intents entitlement) are written alongside the Swift file.

---

## MCP server

Axint ships with `axint-mcp`, a Model Context Protocol server that exposes the compiler to any MCP-compatible LLM client — Claude Desktop, Claude Code, Cursor, Windsurf, and others.

```json
// ~/.config/claude/mcp.json or equivalent
{
  "mcpServers": {
    "axint": {
      "command": "axint-mcp",
      "args": []
    }
  }
}
```

Three tools are exposed:

| Tool              | What it does                                                               |
| ----------------- | -------------------------------------------------------------------------- |
| `axint_scaffold`  | Generates a TypeScript intent from a natural-language description          |
| `axint_compile`   | Runs the full pipeline and returns `.swift` + `.plist` + `.entitlements`   |
| `axint_validate`  | Dry-run validation with line/column diagnostics                            |

Once connected, your AI coding agent can read a Swift project, draft an intent, compile it, and open a PR — without a human touching Xcode.

---

## Supported Swift type mappings

| TypeScript            | Swift                            | Default value support |
| --------------------- | -------------------------------- | --------------------- |
| `string`              | `String`                         | ✓                     |
| `int`                 | `Int`                            | ✓                     |
| `double`              | `Double`                         | ✓                     |
| `float`               | `Float`                          | ✓                     |
| `boolean`             | `Bool`                           | ✓                     |
| `date`                | `Date`                           | —                     |
| `duration`            | `Measurement<UnitDuration>`      | ✓ (e.g. `"1h"`)       |
| `url`                 | `URL`                            | —                     |
| `optional<T>`         | `T?`                             | ✓                     |

---

## Axint vs. hand-written Swift

|                       | Axint                           | Hand-written Swift              |
| --------------------- | ------------------------------- | ------------------------------- |
| Lines of code         | 12 lines of TypeScript          | 30+ lines of Swift boilerplate  |
| Time to first intent  | ~30 seconds                     | 10–15 minutes                   |
| Type marshaling       | Automatic                       | Manual (easy to mistype)        |
| Info.plist fragment   | Emitted                         | Hand-written                    |
| Entitlements fragment | Emitted                         | Hand-written                    |
| Validation            | 16 diagnostic codes             | Runtime bugs                    |
| MCP integration       | Built-in server                 | Manual setup                    |
| Refactoring           | Change TS, recompile            | Change Swift in every file      |

---

## Diagnostics

Rust-grade error messages with fix suggestions:

```
error[AX100]: Intent name "sendMessage" must be PascalCase
  --> src/intents/messaging.ts:5:9
   |
 5 |   name: "sendMessage",
   |         ^^^^^^^^^^^^^
   = help: rename to "SendMessage"

warning[AX105]: Intent has 12 parameters. Apple recommends 10 or fewer.
  --> src/intents/complex.ts:3:1
   = help: consider splitting into multiple intents
```

See [`docs/ERRORS.md`](docs/ERRORS.md) for the full reference.

---

## Try it in your browser

No install required: **[axint.ai/#playground](https://axint.ai/#playground)** runs the entire compiler in-browser — parser, validator, generator, and emit — with zero server round-trip.

---

## Requirements

- **Node.js 22+**
- Any OS: macOS, Linux, Windows
- Xcode 15+ (only if you want to ship the generated Swift to an Apple platform)
- Target platforms: iOS 17+, iPadOS 17+, macOS 14+; Agent Siri requires iOS 26.1+ / macOS Tahoe 26.1+

---

## Project structure

```
axint/
├── src/
│   ├── core/        # Parser, validator, generator, compiler, emitter, IR
│   ├── sdk/         # defineIntent() API and param helpers
│   ├── mcp/         # MCP server (scaffold, compile, validate)
│   ├── cli/         # axint CLI (Commander.js)
│   └── templates/   # Intent template registry
├── tests/           # 117 vitest tests
├── examples/        # Example intent definitions
└── docs/            # Error reference, contributing, assets
```

---

## Contributing

We review PRs within 48 hours. Good places to start:

- Browse issues labeled [`good first issue`](https://github.com/agenticempire/axint/issues?q=is%3Aissue+label%3A%22good+first+issue%22)
- Add an intent template for a common use case (messaging, health, commerce)
- Improve diagnostics with better fix suggestions
- Help wanted on the Xcode live-preview watch mode

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Apache 2.0, no CLA.

---

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the full plan. Highlights:

- [x] Real TypeScript AST parser (v0.2.0)
- [x] Info.plist and `.entitlements` emit (v0.2.0)
- [x] Return-type-aware `perform()` (v0.2.0)
- [x] MCP scaffold tool (v0.2.0)
- [x] 117-test suite with snapshot coverage (v0.2.0)
- [ ] Intent template library (v0.3.0)
- [ ] `--watch` mode for live Swift preview
- [ ] Xcode build plugin
- [ ] GitHub template repo (`axint-starter`)
- [ ] Axint Cloud (hosted compilation)

---

## License

[Apache 2.0](LICENSE) — fork it, extend it, ship it. No CLA.

---

<p align="center">
  Built by <a href="https://agenticempire.co">Agentic Empire</a> · <a href="https://axint.ai">axint.ai</a>
</p>
