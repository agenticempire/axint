# Axint Roadmap

_Last updated: April 2026 · Current release: [v0.1.1](https://github.com/agenticempire/axint/releases)_

Axint is the open-source compiler that turns TypeScript `defineIntent()` calls into native Apple App Intents. This roadmap tracks what's shipped, what's next, and where we need help.

We ship small, tight releases. Everything on this page is open for contribution — see [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

---

## Shipped in v0.1.1

- Core type system and IR (Intermediate Representation)
- Parser: extracts `defineIntent()` calls from TypeScript source
- Swift code generator with `@Parameter` decorators and `AppIntent` conformance
- Validator with 15 diagnostic codes (AX001–AX202) and fix suggestions
- CLI: `axint compile` and `axint validate` with `--json` output
- MCP server: `axint_compile` and `axint_validate` tools for Claude Desktop, Claude Code, Cursor, and Windsurf
- 117 tests with snapshot testing and security coverage (98%+)
- Release workflow with automated npm publish
- In-browser playground on [axint.ai](https://axint.ai) (pure TypeScript, zero server round-trip)

---

## In Progress

### Enum & entity resolvers
Custom Swift types, query resolvers, and disambiguation flows so intents can reference app entities (contacts, playlists, workouts) with the full App Intents entity machinery.

_Status: design → implementation · Target: v0.2.0_

### App Intent template library
Canonical templates for the five most common intent categories: messaging, productivity, health, commerce, smart home. Each template ships as an importable TypeScript helper with a validated Swift output.

_Status: scoping · Target: v0.2.0_

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
