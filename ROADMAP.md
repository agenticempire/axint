# Axint Roadmap

_Last updated: April 2026 · Current release: [v0.2.2](https://github.com/agenticempire/axint/releases) · 60 days to WWDC 2026_

Axint is the open-source compiler that turns TypeScript `defineIntent()` calls into native Apple App Intents. This roadmap tracks what's shipped, what's next, and where we need help.

We ship small, tight releases. Everything on this page is open for contribution — see [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

---

## Shipped in v0.2.2

- **`axint init` scaffolder** — one command drops a complete Axint project with pinned deps, tsconfig, a starter intent, and an MCP config pre-wired for Cursor, Claude Code, and Windsurf.
- **`--emit-info-plist` / `--emit-entitlements` CLI flags** — wired through to the generator, so the Quick Start in the README actually works.
- **Stage 4 validator (`--sandbox`)** — builds generated Swift in an SPM sandbox on macOS. Gives every intent a "swift build passes" badge before it ever touches Xcode.
- **`axint templates` command** — list and print bundled templates from the CLI without touching the MCP.
- **Logo and brand assets** — official SVG mark in `docs/assets/`.

## Shipped in v0.2.1

- **Package rename**: `axint` → `@axintai/compiler` with npm provenance.
- Vendored compiler in the website sync'd to the published package.

## Shipped in v0.2.0

- Real TypeScript AST parser (replaced the v0.1.x regex walker).
- Numeric type fidelity: `param.int`, `param.double`, `param.float` → `Int`, `Double`, `Float`.
- Return-type inference — `perform()` bodies emit `some IntentResult & ReturnsValue<T>`.
- `emitInfoPlist` / `emitEntitlements` options on `CompilerOptions` (wired to CLI in v0.2.2).
- `axint_scaffold`, `axint_list_templates`, `axint_template` MCP tools.
- Ten reference templates: messaging, productivity, health, commerce, smart home.
- Intent-level metadata (`entitlements`, `infoPlistKeys`, `isDiscoverable`).
- New validator rules AX107–AX109; new parser diagnostics AX006–AX008.
- `ios26` / `macos26` target options ready for WWDC.

## Shipped in v0.1.x

- Core type system and IR, parser, generator, validator with 12 diagnostic codes.
- CLI (`compile`, `validate`, `--json`), MCP server (`axint_compile`, `axint_validate`).
- 117 tests with snapshot + security coverage (98%+).
- In-browser playground on [axint.ai](https://axint.ai).

---

## In Progress — WWDC 2026 sprint

### Python SDK (v0.3.0)
Python parity for `defineIntent()`: a libcst-based parser, a decorator API, and full MCP parity. The IR is already language-agnostic — Python plugs in alongside TypeScript.

_Status: in flight · Target: v0.3.0 · ETA: April 22_

### swift-format integration (v0.3.0)
Pipe every generated Swift file through Apple's `swift-format` with the default style. Free credibility and alignment with Apple's own codebase.

_Status: in flight · Target: v0.3.0 · ETA: April 15_

### WWDC API adapter pipeline (v0.3.0)
Nightly CI that diffs Apple's App Intents headers. The goal: a v0.3.x release within 72 hours of the WWDC 2026 keynote with every new surface area adapted.

_Status: scaffolded · Target: v0.3.x · ETA: within 72h of June 8_

### Public docs site — docs.axint.ai (v0.3.0)
Astro Starlight docs with one page per concept, live playground embeds, and a searchable API reference.

_Status: scaffolding · Target: v0.3.0 · ETA: May 6_

---

## Help Wanted

Good places to jump in. Comment on the linked issue or open a new one describing what you'd like to build — we'll scope it with you.

### Xcode project codegen
Generate a complete `.xcodeproj` alongside the Swift file so `axint init` bootstraps a runnable App Intents target end-to-end.

### VS Code extension
Inline diagnostics from the Axint compiler, hover documentation for `defineIntent()` parameters, and snippet completions for common intent shapes.

### GitHub template repo (`axint-starter`)
A template repository that new contributors can clone for a 30-second setup: TypeScript config, a starter intent, and CI wired up.

### `--watch` mode
Long-lived compiler process that re-runs on file changes for iterative development, with incremental re-validation.

### Additional intent templates
Beyond the core five, we'd love templates for: fitness tracking, journaling, recipe import, RSS / article saving, and home automation scenes.

---

## Planned

### Swift → TypeScript reverse compiler
Read an existing Swift App Intent and emit the equivalent Axint TypeScript. Lets teams migrate legacy App Intents into the Axint authoring loop.

_Target: v0.3.0_

### Axint Cloud (hosted compilation)
A hosted compile + preview service so teams without a Mac or Xcode can ship App Intents. Source stays on-device; only the TypeScript source is sent to the API.

_Target: v0.4.0 · Commercial tier_

### Type system expansion
Support for Apple's full type hierarchy: `IntentParameter<Measurement<Unit>>`, `PersonEntity`, `FileEntity`, and custom `AppEntity` subclasses with snapshot-based identity.

_Target: v0.3.0_

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
