# Changelog

All notable changes to Axint will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/) and the format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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

[Unreleased]: https://github.com/agenticempire/axint/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/agenticempire/axint/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/agenticempire/axint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/agenticempire/axint/releases/tag/v0.1.0
