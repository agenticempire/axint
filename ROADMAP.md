# Axint Roadmap

_Last updated: April 2026 · Current release: [v0.3.8](https://github.com/agenticempire/axint/releases) · 52 days to WWDC 2026_

Axint is the open-source compiler that turns TypeScript definitions into native Apple platform code — App Intents, SwiftUI views, WidgetKit widgets, and full app scaffolds. This roadmap tracks what's shipped, what's next, and where we need help.

We ship small, tight releases. Everything on this page is open for contribution — see [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

---

## Shipped

### v0.3.4

- **Remote MCP endpoint** — Cloudflare Worker serving the compiler over HTTP for Smithery and hosted MCP clients.
- **MCP registry metadata** — `server.json`, Dockerfile, tool annotations, and dot-notation tool names for Glama/Smithery/Pulsemcp quality scores.

### v0.3.3

- **Python MCP server** (`axint-mcp-py`) — parity with the TS MCP server's core compile/validate/template flow over stdio.
- **Smithery listing** — MCP HTTP transport for the Smithery registry.
- **402 tests** — jumped from 249 to 402 with validator, diagnostics, and generator edge case coverage. The suite has continued to grow since then.
- **Type safety overhaul** — replaced all unsafe `as` casts with narrowing type guards across the parser and generator.
- **defineView() + defineWidget() + defineApp()** — three new compilation surfaces shipped end-to-end.
- **Architecture docs** (`ARCHITECTURE.md`) and shared parser utilities extraction.

### v0.3.0

- **Xcode SPM build plugin** (`spm-plugin/`) — `AxintCompilePlugin` and `AxintValidatePlugin` for `swift build` and Xcode builds. Discovers `axint` via `npx` or `PATH`.
- **`axint eject`** (`src/core/eject.ts`) — generates standalone Swift with zero Axint dependency. Strips regeneration markers, adds Apple documentation references. Optional XCTest scaffold generation. 12 tests.
- **EntityQuery + DynamicOptionsProvider** — initial SDK support (`defineEntity()`, `param.entity()`, `param.dynamicOptions()`), IR types (`entityQuery`, `dynamicOptions`, `IREntity`), validator rules AX110–AX113, and two new templates (`search-tasks`, `dynamic-playlist`). Dynamic options inner type extraction and property-based entity query codegen shipped in v0.3.2.
- **WWDC API adapter pipeline** (`scripts/wwdc-diff.ts`) — nightly CI scanning Apple SDK headers for API changes with priority-ranked adapter recommendations and auto GitHub issue creation on detected changes.
### v0.2.2

- **`axint init` scaffolder** — one command drops a complete Axint project with pinned deps, tsconfig, a starter intent, and an MCP config pre-wired for Cursor, Claude Code, and Windsurf.
- **`--emit-info-plist` / `--emit-entitlements` CLI flags** — wired through to the generator, so the Quick Start in the README actually works.
- **Stage 4 validator (`--sandbox`)** — builds generated Swift in an SPM sandbox on macOS. Gives every intent a "swift build passes" badge before it ever touches Xcode.
- **`axint templates` command** — list and print bundled templates from the CLI without touching the MCP.
- **Logo and brand assets** — official SVG mark in `docs/assets/`.

### v0.2.1

- **Package rename**: `axint` → `@axint/compiler` (originally `@axintai`, migrated April 2026) with npm provenance.
- Vendored compiler in the website sync'd to the published package.

### v0.2.0

- Real TypeScript AST parser (replaced the v0.1.x regex walker).
- Numeric type fidelity: `param.int`, `param.double`, `param.float` → `Int`, `Double`, `Float`.
- Return-type inference — `perform()` bodies emit `some IntentResult & ReturnsValue<T>`.
- `emitInfoPlist` / `emitEntitlements` options on `CompilerOptions` (wired to CLI in v0.2.2).
- Legacy underscore MCP aliases alongside the current dotted tool names.
- Ten reference templates: messaging, productivity, health, commerce, smart home.
- Intent-level metadata (`entitlements`, `infoPlistKeys`, `isDiscoverable`).
- New validator rules AX107–AX109; new parser diagnostics AX006–AX008.
- `ios26` / `macos26` target options ready for WWDC.

### v0.1.x

- Core type system and IR, parser, generator, validator with 12 diagnostic codes.
- CLI (`compile`, `validate`, `--json`), MCP server foundations, and the original parser/generator/validator loop.
- 117 tests with snapshot + security coverage (98%+).
- In-browser playground on [axint.ai](https://axint.ai).

---

## Priority — v0.3.x (Target: late May 2026)

Remaining v0.3.0-scope features and polish before the public launch.

### 1. Template registry with `axint init --template`

Expand beyond the current 10 templates to 25+. Pre-built intents for every common pattern: messaging, health, commerce, smart home, media playback, navigation, file management, search, journaling, RSS, fitness tracking, home automation scenes. `axint init --template messaging` should produce a working intent in 5 seconds.

_Status: foundation shipped in v0.2.2 · Target: v0.3.0 · Impact: medium_

### 7. swift-format integration

Pipe every generated Swift file through Apple's `swift-format` with the default style. Free credibility and alignment with Apple's own codebase.

_Status: in flight · Target: v0.3.0 · Impact: medium_

### 8. Public docs site — docs.axint.ai

Astro Starlight docs with one page per concept, live playground embeds, and a searchable API reference.

_Status: scaffolding · Target: v0.3.0 · Impact: medium_

---

## Shipped — v0.3.x

### VS Code / Cursor extension

MCP-backed extension (`extensions/vscode/`) exposes the Axint MCP server to VS Code's AI features. Works with GitHub Copilot in agent mode and any VS Code AI feature that supports MCP.

_Status: shipped · v0.3.0_

### `--watch` mode

Long-lived compiler process with 150ms debounce, inline error reporting, optional `--swift-build` for live recompilation, and `--format` for swift-format integration.

_Status: shipped · v0.3.0_

### `defineView()` + `defineWidget()` + `defineApp()` compilation

Full SwiftUI view, WidgetKit widget, and app scaffold compilation pipelines — parser, validator, generator, and MCP schema mode for all four surfaces. 91 diagnostic codes across five validators.

_Status: shipped · v0.3.2_

### Python SDK

Python parity for all four surfaces with a dataclass-based IR, decorator API, and cross-language compilation via `compileFromIR()`. Python and TypeScript produce byte-identical Swift output.

_Status: shipped · v0.3.2_

### MCP registry presence

Remote MCP endpoint on Cloudflare Workers, `server.json` metadata, Dockerfile for inspection, tool annotations, and dot-notation tool names. Listed on Smithery, Glama, and Pulsemcp.

_Status: shipped · v0.3.4_

### Audience positioning refresh

README, landing page, and all copy rewritten to lead with the "compression layer for AI agents on Apple" positioning. Token proof section on axint.ai with real compression ratios.

_Status: shipped · v0.3.2_

---

## Planned — v0.4.0+

### Swift → TypeScript reverse compiler

Read an existing Swift App Intent and emit the equivalent Axint TypeScript. Solves the cold-start problem for teams with existing codebases — import what you have, then author new intents in TypeScript going forward.

_Target: v0.4.0_

### Type system expansion

Full support for Apple's type hierarchy: `IntentParameter<Measurement<Unit>>`, `PersonEntity`, `FileEntity`, custom `AppEntity` subclasses with snapshot-based identity, and `IntentDialog` for conversational intents.

_Target: v0.4.0_

### GitHub template repo (`axint-starter`)

A template repository that new contributors can clone for a 30-second setup: TypeScript config, a starter intent, and CI wired up.

_Target: v0.4.0_

---

## Principles

Every change on this roadmap is measured against four rules:

1. **Sub-millisecond compile** — the browser playground compiles on every keystroke. If a feature breaks that, it doesn't ship.
2. **Idiomatic Swift output** — the generated code has to look like what a senior Apple engineer would write by hand.
3. **Zero telemetry** — no data leaves the user's device unless they explicitly invoke a remote service themselves.
4. **Apache 2.0, no CLA** — every line stays forkable, vendorable, and shippable inside commercial products.

---

## Release Cadence

- **Patch** (0.x.y): bug fixes and diagnostic improvements — as needed, typically weekly.
- **Minor** (0.y.0): new features from this roadmap — roughly every 4–6 weeks.
- **Major** (x.0.0): breaking changes to the `defineIntent()` API — only when absolutely necessary, with a migration guide.

---

## Get Involved

- **GitHub Discussions** — [github.com/agenticempire/axint/discussions](https://github.com/agenticempire/axint/discussions) for architecture questions and feature ideas
- **Issues** — [github.com/agenticempire/axint/issues](https://github.com/agenticempire/axint/issues) for bug reports and "help wanted" items
Your name in the CHANGELOG, forever.
