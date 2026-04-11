# Axint Roadmap

_Last updated: April 2026 · Current release: [v0.2.2](https://github.com/agenticempire/axint/releases) · 60 days to WWDC 2026_

Axint is the open-source compiler that turns TypeScript `defineIntent()` calls into native Apple App Intents and MCP tool servers. This roadmap tracks what's shipped, what's next, and where we need help.

We ship small, tight releases. Everything on this page is open for contribution — see [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

---

## Shipped

### v0.3.0

- **Xcode SPM build plugin** (`spm-plugin/`) — `AxintPlugin` Swift Package with `BuildToolPlugin` that auto-compiles `.ts` intents during `swift build` and Xcode builds. Discovers `axint` via `npx` or `PATH`.
- **`axint eject`** (`src/core/eject.ts`) — generates standalone Swift with zero Axint dependency. Strips regeneration markers, adds Apple documentation references. Optional XCTest scaffold generation. 12 tests.
- **EntityQuery + DynamicOptionsProvider** — full IR support (`entityQuery`, `dynamicOptions` types, `IREntity` interface), parser (`defineEntity()`, `param.entity()`, `param.dynamicOptions()`), generator (AppEntity structs, EntityQuery conformances, intent donations), validator (rules AX110–AX114), and two new templates (`search-tasks`, `dynamic-playlist`).
- **WWDC API adapter pipeline** (`scripts/wwdc-diff.ts`) — nightly CI scanning Apple SDK headers for API changes with priority-ranked adapter recommendations and auto GitHub issue creation on detected changes.
- **Launch kit** (`launch/`) — HN post draft, Twitter thread, beta-tester seeding plan, Discord channel layout, pre-launch → launch-day → post-launch checklist.

### v0.2.2

- **`axint init` scaffolder** — one command drops a complete Axint project with pinned deps, tsconfig, a starter intent, and an MCP config pre-wired for Cursor, Claude Code, and Windsurf.
- **`--emit-info-plist` / `--emit-entitlements` CLI flags** — wired through to the generator, so the Quick Start in the README actually works.
- **Stage 4 validator (`--sandbox`)** — builds generated Swift in an SPM sandbox on macOS. Gives every intent a "swift build passes" badge before it ever touches Xcode.
- **`axint templates` command** — list and print bundled templates from the CLI without touching the MCP.
- **Logo and brand assets** — official SVG mark in `docs/assets/`.

### v0.2.1

- **Package rename**: `axint` → `@axintai/compiler` with npm provenance.
- Vendored compiler in the website sync'd to the published package.

### v0.2.0

- Real TypeScript AST parser (replaced the v0.1.x regex walker).
- Numeric type fidelity: `param.int`, `param.double`, `param.float` → `Int`, `Double`, `Float`.
- Return-type inference — `perform()` bodies emit `some IntentResult & ReturnsValue<T>`.
- `emitInfoPlist` / `emitEntitlements` options on `CompilerOptions` (wired to CLI in v0.2.2).
- `axint_scaffold`, `axint_list_templates`, `axint_template` MCP tools.
- Ten reference templates: messaging, productivity, health, commerce, smart home.
- Intent-level metadata (`entitlements`, `infoPlistKeys`, `isDiscoverable`).
- New validator rules AX107–AX109; new parser diagnostics AX006–AX008.
- `ios26` / `macos26` target options ready for WWDC.

### v0.1.x

- Core type system and IR, parser, generator, validator with 12 diagnostic codes.
- CLI (`compile`, `validate`, `--json`), MCP server (`axint_compile`, `axint_validate`).
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

## Priority — v0.3.x (post-WWDC)

### VS Code / Cursor extension

Inline diagnostics from the Axint compiler, hover documentation for `defineIntent()` parameters, snippet completions for common intent shapes, and one-click compile. Meet developers where they already work.

_Status: not started · Target: v0.3.x_

### `--watch` mode

Long-lived compiler process that re-runs on file changes for iterative development, with incremental re-validation.

_Status: not started · Target: v0.3.x_

### Audience positioning refresh

Lead with AI agent developers (TS/Python devs building MCP tools) as the primary audience. iOS developers who hate boilerplate are the secondary audience — they find Axint through the Xcode plugin, not through the MCP story. Rewrite README hero, landing page, and all copy to reflect this.

_Status: not started · Target: v0.3.x_

---

## Planned — v0.4.0+

### Python SDK

Python parity for `defineIntent()`: a libcst-based parser, a decorator API, and full MCP parity. The IR is already language-agnostic — Python plugs in alongside TypeScript. This is a multi-week project done right; shipping it half-baked would hurt credibility more than shipping it later.

_Target: v0.4.0_

### Swift → TypeScript reverse compiler

Read an existing Swift App Intent and emit the equivalent Axint TypeScript. Solves the cold-start problem for teams with existing codebases — import what you have, then author new intents in TypeScript going forward.

_Target: v0.4.0_

### Type system expansion

Full support for Apple's type hierarchy: `IntentParameter<Measurement<Unit>>`, `PersonEntity`, `FileEntity`, custom `AppEntity` subclasses with snapshot-based identity, and `IntentDialog` for conversational intents.

_Target: v0.4.0_

### Axint Cloud (hosted compilation)

A hosted compile + preview service so teams without a Mac or Xcode can ship App Intents. Source stays on-device; only the TypeScript source is sent to the API.

_Target: v0.4.0 · Commercial tier_

### GitHub template repo (`axint-starter`)

A template repository that new contributors can clone for a 30-second setup: TypeScript config, a starter intent, and CI wired up.

_Target: v0.4.0_

---

## Principles

Every change on this roadmap is measured against four rules:

1. **Sub-millisecond compile** — the browser playground compiles on every keystroke. If a feature breaks that, it doesn't ship.
2. **Idiomatic Swift output** — the generated code has to look like what a senior Apple engineer would write by hand.
3. **Zero telemetry** — no data leaves the user's device unless they explicitly call the (future) Cloud API.
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
- **Email** — [hello@axint.ai](mailto:hello@axint.ai) for partnership and commercial questions

Your name in the CHANGELOG, forever.
