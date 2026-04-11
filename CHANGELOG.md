# Changelog

All notable changes to Axint will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/) and the format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.3.0] — 2026-04-10

Entity support, editor extensions, Python bridge fixes, and a cleanup pass across every surface.

### Added

- **`defineEntity()` and `param.entity()` SDK helpers** — first-class entity authoring in TypeScript with `EntityQuery` generation and `displayRepresentation` support.
- **`param.dynamicOptions()` SDK helper** — declare parameters with runtime option suggestions (codegen support landing in v0.3.1).
- **Editor extensions** for Claude Code, Claude Desktop, VS Code, Cursor, and Windsurf — each ships as a ready-to-install package under `extensions/`.
- **Python SDK (`axintai`) v0.1.0a1** — Python parity with the TypeScript authoring surface. `define_intent()` + `param.*` produce the same language-agnostic IR the TS compiler emits, so a Python-authored intent compiles to byte-identical Swift.
- **`--format` and `--strict-format` CLI flags on `axint compile`** — pipe generated Swift through Apple's `swift-format` before writing to disk.

### Fixed

- **Profile and org READMEs** referenced the defunct unscoped `axint` npm package instead of `@axintai/compiler`.
- **`npx axint compile`** in the main README used the wrong package name (unscoped `axint` is 404).
- **SPM build plugin** passed `--json` which prevented file writes, used wrong output filenames, and invoked `npx` without `-p @axintai/compiler`.
- **Python IR bridge** serialized `infoPlistKeys` as a flat string list but the TS compiler expected `Record<string, string>`.
- **`--from-ir` CLI flag** only accepted a single IR object but the Python CLI emits arrays.
- **`dynamic-playlist` template** used `param.dynamicOptions()` and `customResultType` which the codegen didn't support yet — simplified to standard param types.
- **CONTRIBUTING.md** Discord link was dead.
- **ROADMAP.md** claimed v0.3.0 was current when npm had 0.2.2.

## [0.2.2] — 2026-04-09

The "the README doesn't lie anymore" release. Every flag the docs promised, every scaffolder the tutorials assumed, every badge that was pointing at the wrong package — all fixed in one tight pass.

### Added

- **`axint init [dir]`** — zero-config project scaffolder. Drops `package.json`, `tsconfig.json`, a starter intent from any bundled template, a pre-wired `.vscode/mcp.json`, and an `ios/Intents/` target directory. 30-second setup from a fresh clone.
- **`--emit-info-plist` and `--emit-entitlements` CLI flags** — the underlying `CompilerOptions` existed in 0.2.0 but were never surfaced on the CLI. Now they are, and they write `<Name>.plist.fragment.xml` / `<Name>.entitlements.fragment.xml` next to the Swift file exactly the way the README has always claimed.
- **`--sandbox` flag on `compile` and `validate`** — stage 4 validation. Drops generated Swift into a deterministic SPM sandbox and runs `swift build` to prove it compiles before you ever touch Xcode. macOS-only, reuses the `.build/` cache across runs (cold 4s, warm 1.2s on M-series).
- **`axint templates [name]`** — list or print bundled intent templates straight from the CLI, with `--json` for machine-readable output.
- **Sandbox module (`src/core/sandbox.ts`)** — reusable `sandboxCompile()` API for programmatic stage-4 validation in tests, CI, and the future Xcode extension.
- **Logo SVG** — official mark at `docs/assets/logo.svg`, also used by the README header, axint.ai favicon, and npm package page.

### Fixed

- **README npm badge** points at `@axintai/compiler` instead of the unscoped `axint`.
- **README test count** synced to the real vitest output (117, not 124).
- **ROADMAP.md** no longer claims "Current release: v0.1.1" — it now tracks v0.2.2 and the WWDC 2026 sprint.
- **Logo reference** no longer points at a file that didn't exist.

### WWDC 2026 Sprint

Shipped as part of the 60-day run to June 8:

- Python SDK (in flight, v0.3.0)
- swift-format integration (in flight, v0.3.0)
- WWDC API adapter pipeline (scaffolded)
- docs.axint.ai public docs site (scaffolding)

## [0.2.1] — 2026-04-09

### Changed

- **Package rename**: `axint` → `@axintai/compiler`. The unscoped name on npm is permanently deprecated — update your install command to `npm install -g @axintai/compiler`. All imports and MCP configs follow the scoped name going forward.
- **Website vendored compiler** sync'd to v0.2.1 source.

### Fixed

- npm provenance enabled on the scoped package.

## [0.2.0] — 2026-04-09

The "it's a real compiler now" release. Everything the v0.1.x vision pointed at, shipped behind the same public API.

### Added

- **Real TypeScript AST parser**: replaced the v0.1.x regex matcher with a walker built on the `typescript` compiler API. Handles shorthand properties, method definitions, arrow/function expressions, nested literals, and reports source line numbers on every error.
- **Numeric type fidelity**: `param.int`, `param.double`, and `param.float` now map to Swift `Int`, `Double`, and `Float` respectively. No more collapsing every number into `Int`.
- **Return-type inference**: the compiler walks the top-level `perform()` body, finds the first `return` statement, and emits a matching `some IntentResult & ReturnsValue<T>` signature so generated Swift returns real values instead of `.result()`.
- **Info.plist emission**: `emitInfoPlist` option (CLI flag, MCP arg, and `CompilerOptions`) generates a ready-to-merge `<plist>` fragment from the intent's declared `infoPlistKeys`.
- **Entitlements emission**: `emitEntitlements` option generates a matching `.entitlements` fragment from the intent's `entitlements` array.
- **`axint_scaffold` MCP tool**: AI assistants can now call one tool to generate a complete starter intent file from a name, description, domain, and parameter list — no more guessing the SDK surface.
- **`axint_list_templates` / `axint_template` MCP tools**: exposes the bundled reference templates over MCP so Claude Code, Cursor, etc. can fetch a working starting point in a single call.
- **Ten reference templates**: `send-message`, `create-event`, `book-ride`, `get-directions`, `play-track`, `create-note`, `log-expense`, `log-workout`, `set-thermostat`, `place-order`. Every one compiles cleanly with `axint compile`.
- **Intent-level metadata**: `entitlements`, `infoPlistKeys`, and `isDiscoverable` are now first-class fields on `defineIntent()` and flow through the IR into codegen.
- **New validator rules**: AX107 (duplicate parameter name, error), AX108 (malformed entitlement identifier, warning), AX109 (non-standard Info.plist key prefix, warning).
- **New parser diagnostics**: AX006 (`params` must be an object literal), AX007 (parameter value must be a `param.*` call), AX008 (missing description argument).
- **Apple target additions**: `ios26` and `macos26` targets for `CompilerOptions`, ready for the WWDC 2026 App Intents surface.

### Changed

- **SDK**: `param` is now built from a typed factory, which means `param.int`, `param.double`, `param.float`, `param.string`, `param.boolean`, `param.date`, `param.duration`, and `param.url` all share identical configuration semantics. `param.number` is preserved as a deprecated alias for `param.int` and will be removed in v1.0.0.
- **`compileSource`**: now accepts `CompilerOptions` as an optional third argument, matching `compileFile`. Parser errors are captured as diagnostics instead of raised as exceptions, so MCP clients get a clean error list.
- **Generator output**: the emitted Swift file now imports `Foundation`, uses a typed `ReturnsValue<T>` return when the IR knows the type, and includes a sensible Swift default literal for the placeholder return value.
- **Dependencies**: `handlebars` removed (unused since v0.1.0), `typescript` promoted from devDependency to production dependency (required by the new AST parser).

### Fixed

- Parser no longer silently swallows malformed `params` blocks — each error case now emits a dedicated diagnostic with a source line and a suggested fix.

### Backwards Compatibility

- `param.number(...)` still parses and still produces a Swift `Int` — existing v0.1.x intent files continue to compile unchanged.
- `defineIntent()` accepts every field v0.1.x accepted.
- The CLI surface (`axint compile`, `axint validate`) is unchanged; `--emit-info-plist` and `--emit-entitlements` are purely additive flags.

## [0.1.1] — 2026-04-08

### Fixed

- Build hygiene: `.gitignore` now excludes `tests/.tmp-compiler-tests/`

## [0.1.0] — 2026-04-07

### Added

- **Core compiler pipeline**: parse TypeScript `defineIntent()` calls into an Intermediate Representation (IR), validate against Apple App Intents constraints, and generate idiomatic Swift
- **CLI**: `axint compile <file>` and `axint validate <file>` commands with colored, Rust-inspired diagnostics
- **MCP server**: `axint_compile` and `axint_validate` tools for AI coding assistants (Claude Code, Cursor, Windsurf)
- **SDK**: `defineIntent()` API with type-safe `param.string()`, `param.number()`, `param.boolean()`, `param.date()`, `param.duration()`, `param.url()` helpers
- **Validation**: 12 diagnostic codes (AX001–AX005 parser, AX100–AX106 IR, AX200–AX202 Swift) with actionable suggestions
- **Security**: `escapeSwiftString()` prevents code injection in generated Swift string literals
- **Testing**: 117 tests at 98%+ coverage — parser, generator, validator, compiler, types, SDK, templates, security edge cases, and injection resistance
- **CI/CD**: GitHub Actions with typecheck, lint, test, build, and CLI verification
- Apache 2.0 license, Code of Conduct, Security Policy, Contributing Guide

### Technical Details

- Node.js 22+ (ESM-only)
- 3 production dependencies: `@modelcontextprotocol/sdk`, `commander`, `handlebars`
- tsup for builds with separate CLI/MCP/library entry points
- Vitest with snapshot testing and V8 coverage

[Unreleased]: https://github.com/agenticempire/axint/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/agenticempire/axint/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/agenticempire/axint/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/agenticempire/axint/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/agenticempire/axint/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/agenticempire/axint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/agenticempire/axint/releases/tag/v0.1.0
