# Axint Roadmap

_Last updated: June 2026 · Current release: <!-- metrics:roadmap-release:start -->[v0.4.32](https://github.com/agenticempire/axint/releases/tag/v0.4.32)<!-- metrics:roadmap-release:end -->_

Axint is the Apple-native execution layer for AI coding agents. The open-source package gives agents a smaller contract for Apple surfaces, emits ordinary Swift, validates Apple-specific rules, writes Fix Packets, and coordinates proof loops across CLI, MCP, Xcode, Registry, and Cloud-facing workflows.

The thesis is simple: agents can write code, but Apple-native software needs proof. Axint turns agent output into validated, repairable, inspectable Apple work.

<!-- metrics:roadmap-snapshot:start -->Current compiler snapshot: v0.4.32 · 36 MCP tools + 5 prompts · 49 templates · 217 diagnostic codes · 1426 tests.<!-- metrics:roadmap-snapshot:end -->

---

## Shipped Now

### Execution and repair loop

- `axint run` coordinates session recovery, workflow checks, Swift validation, Cloud Check, `xcodebuild build`, focused tests, full test runs, runtime proof, and durable `.axint/run` artifacts.
- `axint repair` indexes existing Apple projects, classifies build/UI/runtime evidence, ranks likely files, and returns the smallest patch/proof loop.
- Fix Packets give agents a shared repair contract through `latest.check.*` for quick verdicts and `latest.*` for full repair instructions.
- Passing focused UI tests are reconciled with Cloud Check so stale warnings do not override real proof.
- Failing Xcode tests are extracted into compact failure summaries with test name, file, line, assertion, likely source area, and next repair direction.

### Compiler and Apple coverage

- TypeScript, Python, JSON schema mode, and preview `.axint` inputs compile into Apple-native Swift.
- Supported surfaces include App Intents, SwiftUI views, WidgetKit widgets, app scaffolds, plist fragments, entitlements, and Apple metadata.
- The validator covers 214 diagnostic codes across compiler, intent, view, widget, app, Swift build, SwiftUI, accessibility, concurrency, and Live Activity rules.
- The suite currently tracks 1372 tests across TypeScript and Python paths.

### Agent distribution

- 36 MCP tools and 5 prompts expose compile, validate, activate, repair, suggest, feature generation, project packs, memory, docs context, workflow gates, run status, run cancel, telemetry controls, feedback packets, and template access.
- MCP marketplace bundles now start directly through `node dist/mcp/index.js` and ship clearer runtime tool descriptions for security/quality scanners.
- Agent lanes distinguish Xcode-hosted work from Codex, Claude, Cursor, Cowork, VS Code, Windsurf, and other clients so routine edits use the active client's native patch lane while Axint handles proof.
- Same-thread upgrades let agents update Axint without losing the current project conversation.

### First-use and templates

- `create-axint-app` / `axint create` generates the Apple Day Agent starter: multiple App Intent contracts, generated Swift, plist and entitlement fragments, agent prompts, proof artifacts, and an interactive local proof preview.
- 46 bundled templates and 58 live Registry packages give agents reusable starting points instead of asking them to hallucinate every Apple surface from scratch.

### Privacy-safe learning and adoption proof

- Source-free telemetry records command class, MCP tool name, version, coarse host hint, OS family, Node major, CI flag, and anonymous install ID so Axint can understand which install paths actually work.
- Source-free feedback packets capture diagnostic codes, issue class, redacted evidence, and likely Axint ownership without sending source code, prompts, generated Swift, file names, file paths, credentials, or machine IDs.
- Users can inspect or disable these paths with `axint telemetry status`, `axint telemetry opt-out`, `axint feedback status`, and `axint feedback opt-out`.
- Fresh installs can prove first real value with `axint activate` or the `axint.activate` MCP tool, so Pulse can separate setup/server-start events from activation.

---

## Current Priorities

### 1. Make the first run undeniable

Goal: the first command should create a real, inspectable Apple-native capability with proof, not a generic scaffold.

- Improve `create-axint-app` templates with more realistic app shells and generated Swift examples.
- Add a "Built with Axint" gallery that links each demo to source contract, generated Swift, proof packet, and install command.
- Add more end-to-end example repos for App Intent, SwiftUI widget, menu bar app, and existing-project repair flows.
- Keep `npm run install:gauntlet` green before release: local dist activation, packed fresh install activation, and create-axint-app launchpad creation.

### 2. Make existing-product repair feel senior

Goal: Axint should act like a senior Apple engineer watching the loop.

- Expand UI repair classifiers for blocked taps, invisible overlays, scroll/hittability failures, state drift, navigation regressions, and accessibility identifier mismatches.
- Improve `.xcresult` parsing and attach focused failure context directly to repair packets.
- Keep agent-facing output compact by default while preserving full logs and source artifacts on disk.

### 3. Make MCP marketplaces score Axint correctly

Goal: every marketplace should understand Axint as a low-risk, useful, well-documented MCP server.

- Keep runtime dependencies minimal.
- Keep tool descriptions explicit: behavior, purpose, inputs, effects, and usage guidance.
- Maintain Glama, Smithery, MCP Registry, and other marketplace metadata from the same version truth.

### 4. Expand Apple surface coverage

Goal: cover the annoying Apple edges that make agents break.

- Richer `IntentDialog` support.
- More Apple parameter and entity types.
- App Shortcuts catalog generation.
- Control Widgets and Live Activities starter coverage.
- Better Swift 6 actor isolation and concurrency repair rules.

### 5. Improve Registry composition

Goal: agents should compose from trusted Apple-native packages before writing everything from scratch.

- Better Registry search and package selection inside `axint.registry.search`.
- Higher-quality first-party packages with proof, generated Swift, and demo prompts.
- Source-code ingestion and candidate package extraction for future Registry contribution workflows.

### 6. Keep public truth synchronized

Goal: README, docs, package metadata, MCP metadata, website, org profile, and marketplace listings should always agree.

- Continue running `versions:check`, `metrics:check`, `docs:check`, and downstream public-truth sync before releases.
- Keep npm, PyPI, GitHub Releases, `server.json`, docs, and websites on the same version.
- Treat stale public numbers as release blockers.

---

## Contribution Areas

The best open-source contributions right now are:

- new Apple templates with tests
- validator rules for real Swift/App Intent failures
- smaller reproductions for existing-product repair bugs
- docs that make agent setup easier
- MCP marketplace metadata improvements
- examples that prove one Apple capability end to end
- issue reports with `.axint/run/latest.md` or source-free feedback packets

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, release gates, and PR expectations.

---

## Principles

1. **Ordinary Swift output** - generated code should be inspectable, ejectable, and shippable without runtime lock-in.
2. **Proof beats vibes** - a clean static check is useful, but Xcode/build/test/runtime evidence decides whether work is done.
3. **Small agent contracts** - agents should send compact definitions or schema payloads, not walls of fragile Swift.
4. **Repair packets, not guessing** - when something fails, Axint should return a concrete repair contract.
5. **Privacy by default** - telemetry and feedback are source-free, inspectable, and opt-out.
6. **Apache-2.0 core** - the compiler, SDKs, CLI, MCP server, templates, tests, and editor integrations stay forkable and shippable.

---

## Release Cadence

- **Patch** (`0.x.y`): diagnostics, repair quality, templates, metadata, marketplace compatibility, and bug fixes.
- **Minor** (`0.y.0`): new Apple surfaces, larger API additions, or major workflow improvements.
- **Breaking changes**: only when required, with migration notes and compatibility guidance.

Intentional releases should move npm and PyPI together, refresh MCP metadata, publish a GitHub Release, and sync public proof surfaces before launch or promotion.
