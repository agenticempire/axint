# Changelog

All notable changes to Axint will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/) and the format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.4.15] — 2026-04-29

### Added

- **`axint mcp recover`** — prints a same-thread recovery packet when an MCP client hits `Transport closed`, including version proof, project path, context-recovery commands, and the CLI fallback run loop.
- **Xcode runner-health classification** — `axint run` now separates UI automation startup failures and hosted macOS test-runner hangs from real app assertion failures.
- **`AX768` same-target Swift member validation** — when changed Swift files include a declaring type and a consumer, Axint warns on direct member mistakes such as `profile.detail` when the known type does not expose that member.
- **Public page DSL manifest support** — `.axint` language files can now parse, lower, and print safe `page` / `module` declarations for host-rendered public project/profile surfaces.

### Changed

- **Cloud Check pending-proof handling** now downgrades build-only evidence when behavior text says UI/runtime proof is still pending, so agents cannot claim runtime fixes from prose alone.
- **Focused test timeout guidance** now respects existing `--only-testing` selectors and tells agents to clean up/retry runner infrastructure instead of asking for another focused test when no assertion executed.

## [0.4.10] — 2026-04-27

### Added

- **Guarded Xcode run loop** — `axint.xcode.guard` and workflow prompts now keep Xcode agents inside the Axint loop across planning, writing, pre-build, pre-commit, and finish checkpoints.

### Changed

- **Workflow check next actions** — `axint.workflow.check` now returns the next concrete Axint action even when the checkpoint is ready, so agents do not treat the check itself as the only required Axint step.
- **Stage transitions** now advance cleanly from context recovery to suggestion, feature generation, guarded writes, build evidence, pre-commit validation, and finish-state guardrails.

## [0.4.9] — 2026-04-26

### Added

- **Axint rehydration contract** — `axint.session.start` now refreshes `.axint/AXINT_REHYDRATE.md` alongside the session token, operating memory, docs context, and project contract so Xcode/Claude/Codex agents can recover Axint after new chats and context compaction.
- **Workflow drift detection** — `axint.workflow.check` now detects compaction, stale MCP, missing Axint, and long-drift language in agent notes, then blocks progress until the agent runs the Axint recovery loop.
- **Semantic generation hardening** — feature, component, and suggestion flows now lean on semantic planning and self-audit diagnostics instead of narrow domain templates.

### Changed

- Project start packs, MCP prompts, doctor checks, README proof surfaces, and local docs memory now point agents at the rehydration-first workflow.
- `axint.swift.fix` uses the multipass fixer path through MCP so mechanical fixes can converge without reintroducing duplicate declarations.

## [0.4.6] — 2026-04-25

### Added

- **`axint.status` MCP tool** — reports the exact running MCP server version, package path, uptime, tool count, and Xcode restart/update instructions so agents can prove which Axint process they are connected to.

### Changed

- **Xcode startup prompts** now tell agents to call `axint.status` before editing code and stop if the running MCP server is older than expected.
- **`axint xcode verify`** now treats a missing `axint.status` tool as an old MCP server and prints the update/restart path.

## [0.4.5] — 2026-04-24

### Added

- **Cloud Check coverage and confidence** — `axint.cloud.check` now reports what it checked, what still needs Xcode/runtime evidence, and how much confidence an agent should place in the result.
- **SwiftUI accessibility propagation diagnostic** — new `AX736` warning for container `.accessibilityIdentifier(...)` patterns that can hide nested control identifiers in UI tests.
- **Observation navigation diagnostic** — new `AX735` warning for `@ObservationIgnored` navigator/router state inside `@Observable` coordinators.

### Changed

- **Cloud Check repair prompts** now include validator coverage details and avoid implying that a clean static check proves there is no runtime/UI bug.
- **Xcode setup prompts** now tell agents to work in short validation checkpoints and report Axint validator gaps when Xcode/tests fail after a clean static check.

### Fixed

- **`AX731` weak-capture parsing** now accepts `Task { @MainActor [weak self] in ... }` while still warning on `Task { @MainActor in self... }`.
- **Cloud Check validator parity** is covered by regression tests so Swift validator findings such as `AX731` surface through the Cloud Check MCP path.

## [0.3.9] — 2026-04-16

CLI ergonomics, VSCode cloud handoff, and an MCP server refactor.

### Added

- **Compression ratio after compile** — `axint compile` prints `TS lines → Swift lines (ratio)` so authors can eyeball how their intent expanded. Skipped for `--from-ir` and `--stdout` runs. Labels as "Compression" or "Expansion" depending on which side is larger.
- **Cloud handoff in the VSCode extension** — send the active intent to the cloud compiler from the command palette; the extension opens the resulting Swift side-by-side with your TS source.
- **`swift.validate` and `swift.fix`** on the hosted MCP worker so remote MCP clients can lint and auto-fix generated Swift without running the CLI locally.
- **Good-first-issue template** for new contributors.

### Changed

- **MCP server split** into `manifest`, `prompts`, and `schema-compile` modules — the old 900-line monolith is now three focused files. Tool surface and behavior are unchanged.
- **`axint add` accepts bare `namespace/slug`** in addition to `@namespace/slug`. The registry web URLs drop the leading `@`, so a copy-paste from the browser now works.
- **Release workflow** no longer hard-fails when a version has already been published to npm, PyPI, or GitHub releases — reruns are idempotent.

### Fixed

- **`axint add` install response parsing** — the API returns a flat shape (`ts_source`, `swift_output` at the root), the CLI was destructuring `data.version.swift_output` and writing `undefined` to disk. Install now writes the correct Swift output.

## [0.3.8] — 2026-04-15

Xcode agentic coding support, Swift validator, and the `axint.feature` tool.

### Added

- **`axint.feature`** — new MCP tool that takes a natural-language feature description and returns a full intent, view, or widget scaffold. Designed for Xcode-hosted AI assistants that want to go from idea to compilable Swift in one turn.
- **Swift validator** with Swift 6 concurrency rules and Live Activities checks. Runs as part of `axint compile` and is exposed as its own MCP tool.
- **`axint doctor`** — environment diagnostic command. Prints Swift toolchain, Node version, Python (if installed), MCP server status, and registry connectivity.
- **Xcode Source Editor Extension** — right-click a `.intent.ts` file in Xcode and compile it without leaving the editor.
- **Dot-notation prompt demo** so hosted MCP clients can preview the guided feature-authoring flow before wiring it up.

### Changed

- **Namespace cleanup across the CLI, SPM plugins, and lockfile** — the final `axintai` references from the old unscoped name are gone. Everything is on `@axint/compiler` (npm) and `axintai` (PyPI, for the Python SDK only).
- **Dependabot disabled** — upstream version drift on the generator fixture packages was producing more noise than signal.
- **Version references aligned** across `package.json`, `pyproject.toml`, docs, and `server.json`.

## [0.3.7] — 2026-04-14

Dot-notation MCP tools and prompts.

### Added

- **`axint.compile`, `axint.validate`, `axint.eject`, `axint.explain`** — dot-notation tool names that work alongside the existing `axint_compile` / `axint_validate` / etc. Hosted clients that prefer dotted namespaces (Smithery, Glama) now index cleanly.
- **MCP prompts** — three guided prompts (`new-intent`, `new-view`, `new-widget`) that walk an LLM through authoring a surface from a plain-English brief.
- **Enriched tool parameter descriptions** — every MCP input now has a docstring-style description, which measurably lifts Glama quality scores.

## [0.3.5] — 2026-04-13

MCP tool annotations and parameter descriptions.

### Added

- **Tool annotations** on every MCP tool (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so agents can reason about side effects.
- **Enriched parameter descriptions** across the MCP server to improve tool-use accuracy.

## [0.3.4] — 2026-04-13

MCP registry hardening and remote transport support.

### Added

- **Remote MCP endpoint** — Cloudflare Worker serving the Axint MCP server over HTTP transport for Smithery and other hosted MCP clients.
- **`server.json` and registry markers** — machine-readable MCP server metadata for automated registry verification (Glama, Smithery, Pulsemcp).
- **Dockerfile** for MCP server inspection and containerized deployments.
- **Glama quality badge** in README.
- **Dot-notation MCP tools** (`axint.compile`, `axint.validate`, etc.) alongside the existing `axint_compile` names, with enriched parameter descriptions and tool annotations.

### Fixed

- **`server.json` description** trimmed to fit registry character limits.
- **MCP tool descriptions** rewritten for better indexing on Glama and Smithery quality scores.

## [0.3.3] — 2026-04-12

Massive internal hardening pass: test coverage jump (249 → 402), Python SDK parity, and Smithery listing.

### Added

- **Python MCP server** — full CLI parity with the TypeScript MCP server. `axintai-mcp` serves all six tools over stdio.
- **MCP HTTP transport** for Smithery registry listing.
- **153 new tests** (249 → 402) covering validator edge cases, diagnostics, generator corner cases, and type guard paths.
- **Type guard replacements** — all unsafe `as` casts in the parser and generator replaced with narrowing type guards.
- **Shared parser utilities** extracted from surface-specific parsers into `src/core/parser-utils.ts`.
- **Architecture docs** (`ARCHITECTURE.md`) — full compiler pipeline walkthrough.
- **Xcode SPM build plugin support** documentation and integration.
- **defineView(), defineWidget(), defineApp()** — three new compilation surfaces with parsers, validators, generators, and schema mode support.
- **MCP server test suite** — 30 tests covering all 6 tools.

### Fixed

- **Entity resolution and serialization bugs** in the parser utils layer.
- **Type safety holes** in the MCP server and parser — closed a namespace bypass.
- **Codegen bugs** for entity queries and dynamic options.
- **CLI test assertions** aligned to new output format.
- **Python SDK** — fixed mypy errors across the package, fixed broken TOML (`bare 0` replaced with `pyyaml` dep).
- **Registry references** removed from the public repo and added to `.gitignore`.

## [0.3.2] — 2026-04-10

Security hardening, compiler fixes, and the first PyPI publish.

### Added

- **Python SDK on PyPI** — `pip install axintai` now works. v0.1.0, Apache 2.0, published from the release workflow.
- **Registry rate limiting** — IP-based rate limiting (120 req/min global, 10/min auth, 30/hr publish) with 10 MB publish payload cap.
- **Registry XSS mitigation** — markdown link rendering now blocks `javascript:`, `data:`, and `vbscript:` URI schemes.
- **Authenticated GitHub API proxy** on axint.ai — `/api/github` route with 5-minute edge cache, bumps from 60 to 5,000 req/hr.

### Fixed

- **`eject --format` flag** was accepted but never wired to `formatSwift()`. `ejectIntent()` is now async and runs swift-format when `--format` is passed.
- **`param.dynamicOptions()` inner type** was hardcoded to `string`. Now recursively extracts the actual param type from the second argument.
- **Property-based entity queries** now generate `EntityPropertyQuery` conformance with `QueryProperties`, comparators, and `SortingOptions` instead of a placeholder comment.
- **Custom result types** now emit a compilable return stub instead of a bare TODO comment.
- **Registry search pagination** uses a separate `COUNT(*)` query for accurate totals.
- **Version strings** synced to 0.3.2 across axint.ai, README, ROADMAP, and CHANGELOG.

### Removed

- **PEM key** from `trading-engine/` (security risk, should never have been committed).

## [0.3.0] — 2026-04-10

Entity support, editor extensions, Python bridge fixes, and a cleanup pass across every surface.

### Added

- **`defineEntity()` and `param.entity()` SDK helpers** — first-class entity authoring in TypeScript with `EntityQuery` generation and `displayRepresentation` support.
- **`param.dynamicOptions()` SDK helper** — declare parameters with runtime option suggestions (codegen support landing in v0.3.1).
- **Editor extensions** for Claude Code, Claude Desktop, VS Code, Cursor, and Windsurf — each ships as a ready-to-install package under `extensions/`.
- **Python SDK (`axintai`) v0.1.0a1** — Python parity with the TypeScript authoring surface. `define_intent()` + `param.*` produce the same language-agnostic IR the TS compiler emits, so a Python-authored intent compiles to equivalent Swift.
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

[Unreleased]: https://github.com/agenticempire/axint/compare/v0.4.15...HEAD
[0.4.15]: https://github.com/agenticempire/axint/compare/v0.4.14...v0.4.15
[0.3.4]: https://github.com/agenticempire/axint/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/agenticempire/axint/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/agenticempire/axint/compare/v0.3.0...v0.3.2
[0.3.0]: https://github.com/agenticempire/axint/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/agenticempire/axint/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/agenticempire/axint/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/agenticempire/axint/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/agenticempire/axint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/agenticempire/axint/releases/tag/v0.1.0
