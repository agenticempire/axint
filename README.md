<p align="center">
  <img src="docs/assets/axint-logo.svg" alt="Axint — The open-source compiler that transforms AI agent definitions into native Apple App Intents" width="120" />
</p>

<h1 align="center">Axint</h1>

<p align="center">
  <strong>The open-source compiler that transforms AI agent definitions into native Apple App Intents. TypeScript in, Swift out.</strong>
</p>

<p align="center">
  <a href="https://axint.ai">Website</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="docs/">Documentation</a> ·
  <a href="docs/ERRORS.md">Error Codes</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/agenticempire/axint/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/agenticempire/axint/ci.yml?branch=main&label=CI" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/axint"><img src="https://img.shields.io/npm/v/axint.svg?color=cb3837" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/axint"><img src="https://img.shields.io/npm/dm/axint.svg?color=cb3837" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/coverage-98%25-brightgreen" alt="Coverage" />
  <img src="https://img.shields.io/badge/tests-117%20passing-brightgreen" alt="Tests" />
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-3178c6" alt="TypeScript" /></a>
  <a href="https://github.com/agenticempire/axint"><img src="https://img.shields.io/github/stars/agenticempire/axint?style=social" alt="GitHub Stars" /></a>
</p>

<p align="center">
  <em>If you build AI agents and want them to work natively on Apple devices — this is for you.</em>
</p>

---

<!-- TODO: Replace with actual GIF once generated with scripts/generate-demo.sh -->
<!-- <p align="center"><img src="docs/assets/axint-demo.gif" alt="Axint demo: TypeScript → CLI → Swift" width="700" /></p> -->

## What is Axint?

Apple is opening Siri, Shortcuts, and App Intents to third-party agents. But there's no clean way to get from an AI agent's TypeScript definition to a native Swift App Intent that actually runs on-device.

**Axint is that bridge.**

```
TypeScript Agent Definition  →  Axint  →  Native Swift App Intent
```

Define what your agent can do in TypeScript. Axint compiles it into production-ready Swift with proper `@Parameter` decorators, `AppIntent` conformance, type marshaling, and Siri/Shortcuts metadata — ready to ship.

## Why We Built Axint

We were building AI agents that needed to run natively on Apple devices. The App Intents framework is powerful, but writing Swift boilerplate for every agent action is slow, error-prone, and disconnected from the TypeScript where agent logic actually lives. We wanted one source of truth — define the intent once in TypeScript, get production Swift automatically. Axint is the tool we wished existed.

## Why Axint?

- **Write once, target Apple.** Define intents in TypeScript. Get native Swift that passes App Store review.
- **MCP-native.** Ships as an MCP server. AI coding tools (Claude Code, Cursor, Windsurf) call Axint automatically — your users never read docs.
- **Validation built in.** Catches broken type marshaling, missing `@Parameter` wrappers, non-PascalCase names, and 10+ other common mistakes with clear error codes and fix suggestions.
- **Open source.** Apache 2.0. Fork it, extend it, contribute back.

## Axint vs. Hand-Written Swift

| | Axint | Hand-Written Swift |
|---|---|---|
| **Lines of code** | 12 lines of TypeScript | 30+ lines of boilerplate Swift |
| **Time to first intent** | 30 seconds | 10–15 minutes |
| **Type marshaling** | Automatic (`param.date()` → `Date`) | Manual (easy to mistype) |
| **Validation** | 12 checks with fix suggestions | None (find bugs at runtime) |
| **AI-tool integration** | Built-in MCP server | Manual setup |
| **Siri metadata** | Auto-generated | Hand-written |
| **Refactoring** | Change TS, recompile | Change Swift in every file |

> **Requirements:** Node.js 22+ · macOS / Linux / Windows

## Quick Start

```bash
# Install globally
npm install -g axint

# Or use without installing
npx axint compile my-intent.ts --stdout

# Compile a TypeScript intent → Swift App Intent
axint compile my-intent.ts --stdout

# Output to a directory
axint compile my-intent.ts --out ios/Intents/

# Validate without generating
axint validate my-intent.ts

# Machine-readable JSON output
axint compile my-intent.ts --json
```

### Define an Intent

```typescript
// intents/calendar.ts
import { defineIntent, param } from "axint";

export default defineIntent({
  name: "CreateEvent",
  title: "Create Calendar Event",
  description: "Creates a new event in the user's calendar",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    duration: param.duration("Event duration", { default: "1h" }),
    location: param.string("Location", { required: false }),
  },
  perform: async ({ title, date, duration, location }) => {
    return { success: true, eventId: "..." };
  },
});
```

### Compiled Output

```swift
// CreateEventIntent.swift
// Generated by Axint — https://github.com/agenticempire/axint
// Do not edit manually. Re-run `axint compile` to regenerate.

import AppIntents

struct CreateEventIntent: AppIntent {
    static let title: LocalizedStringResource = "Create Calendar Event"
    static let description: IntentDescription = IntentDescription("Creates a new event in the user's calendar")

    @Parameter(title: "Title", description: "Event title")
    var title: String

    @Parameter(title: "Date", description: "Event date")
    var date: Date

    @Parameter(title: "Duration", description: "Event duration")
    var duration: Measurement<UnitDuration> = "1h"

    @Parameter(title: "Location", description: "Location")
    var location: String?

    func perform() async throws -> some IntentResult {
        // TODO: Implement your intent logic here
        return .result()
    }
}
```

### Try It Locally

```bash
git clone https://github.com/agenticempire/axint.git
cd axint && npm install && npm run build
node dist/cli/index.js compile examples/calendar-assistant.ts --stdout
```

## Use with AI Coding Tools (MCP)

Axint ships as an MCP server. When a developer tells their AI assistant "build me a Siri action," the AI calls Axint automatically:

```json
// Add to your MCP config (~/.config/claude/mcp.json)
{
  "servers": {
    "axint": {
      "command": "axint-mcp",
      "args": []
    }
  }
}
```

**Available MCP tools:**

| Tool | Description |
|------|-------------|
| `axint_compile` | Compile TypeScript intent source → Swift App Intent |
| `axint_validate` | Validate an intent definition and get diagnostics |

## Supported Types

| TypeScript | Swift | Example |
|---|---|---|
| `param.string()` | `String` | `param.string("Event title")` |
| `param.number()` | `Int` | `param.number("Count", { default: 5 })` |
| `param.boolean()` | `Bool` | `param.boolean("Notify", { required: false })` |
| `param.date()` | `Date` | `param.date("When")` |
| `param.duration()` | `Measurement<UnitDuration>` | `param.duration("How long")` |
| `param.url()` | `URL` | `param.url("Link")` |

## Error Diagnostics

Axint provides developer-friendly error messages inspired by the Rust compiler:

```
  error[AX100]: Intent name "sendMessage" must be PascalCase (e.g., "CreateEvent")
    --> src/intents/messaging.ts
    = help: Rename to "SendMessage"

  warning[AX105]: Intent has 12 parameters. Apple recommends 10 or fewer.
    --> src/intents/complex.ts
    = help: Consider splitting into multiple intents
```

See [docs/ERRORS.md](docs/ERRORS.md) for the full error code reference.

## Project Structure

```
axint/
├── src/
│   ├── core/          # Parser, generator, validator, compiler, IR types
│   ├── sdk/           # defineIntent() API and param helpers (exported from `axint`)
│   ├── mcp/           # MCP server (axint_compile, axint_validate)
│   ├── cli/           # CLI tool (Commander.js)
│   └── templates/     # Intent template registry
├── tests/             # Vitest tests (117 tests · 98% coverage)
├── examples/          # Example intent definitions
├── scripts/           # Build and demo scripts
└── docs/
    ├── ERRORS.md      # Full error code reference
    └── assets/        # Logo, demo GIF
```

## Roadmap

- [x] Core type system and IR (Intermediate Representation)
- [x] Parser: extract `defineIntent()` calls from TypeScript source
- [x] Swift code generator with `@Parameter` decorators and `AppIntent` conformance
- [x] Validator with error codes (AX001–AX202) and fix suggestions
- [x] CLI: `axint compile` and `axint validate` with `--json` output
- [x] MCP server: `axint_compile` and `axint_validate` tools
- [x] 117 tests with snapshot testing and security coverage (98%+)
- [x] Release workflow with automated npm publish
- [ ] App Intent template library (messaging, productivity, health, commerce)
- [ ] GitHub Template Repo (`axint-starter`) for 30-second onboarding
- [ ] Xcode integration and live preview
- [ ] `--watch` mode for iterative development
- [ ] Axint Cloud (hosted compilation — no Mac or Xcode required)

## Troubleshooting

**"No defineIntent() call found"** — Make sure your file contains `defineIntent({...})`. The parser looks for this exact function call. See error code [AX001](docs/ERRORS.md#ax001--no-defineintent-call-found).

**"Intent name must be PascalCase"** — Swift structs use PascalCase (e.g., `CreateEvent`, not `createEvent`). Axint appends `Intent` automatically, so `CreateEvent` becomes `CreateEventIntent.swift`.

**`npm run test:coverage` fails** — Run `npm install` to ensure `@vitest/coverage-v8` is installed.

**Global install permission issues** — Use `npx axint` instead, or install locally: `npm install axint --save-dev`

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

**Good places to start:**
- Browse [issues labeled `good first issue`](https://github.com/agenticempire/axint/labels/good%20first%20issue)
- Add a new intent template for a common use case
- Improve documentation or add examples

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built by <a href="https://agenticempire.com">Agentic Empire</a><br/>
  <a href="https://axint.ai">axint.ai</a>
</p>
