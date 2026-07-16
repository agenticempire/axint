# Axint Roadmap

_Last updated: July 2026 · Current release: <!-- metrics:roadmap-release:start -->[v0.6.0](https://github.com/agenticempire/axint/releases/tag/v0.6.0)<!-- metrics:roadmap-release:end -->_

**Agents can write Swift. Axint makes them prove it.**

Axint is the proof and repair layer for Apple coding agents. It checks the Swift an agent wrote, runs real Xcode build and test evidence, reconciles static findings with Apple tooling, and returns signed proof with the exact repairs to make next. The compiler, SDKs, MCP server, Registry, Team features, and Cloud all support that shared proof contract.

<!-- metrics:roadmap-snapshot:start -->Current verified snapshot: 36 MCP tools + 5 prompts · 53 templates · 235 diagnostic codes · 1512 tests.<!-- metrics:roadmap-snapshot:end -->

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
- The validator covers compiler, intent, view, widget, app, Swift build, SwiftUI, accessibility, concurrency, Live Activity, and repair-loop rules.
- iOS 27 beta 3 migration coverage includes the `@State` macro, SwiftUI
  documents, visible tab selection, text-selection gestures, toolbar and text
  field API changes, Background Assets, Foundation Models sampling, CoreAI
  model compatibility, Siri/App Schema risks, and App Store Connect 4.4.1.
- TypeScript and Python checks are both included in the generated public metrics snapshot above.

### Agent distribution

- The MCP surface exposes compile, validate, activate, repair, suggest, feature generation, project packs, memory, docs context, workflow gates, run status, run cancel, feedback, and template access. Its generated tool and prompt totals are recorded in the snapshot above.
- MCP marketplace bundles now start directly through `node dist/mcp/index.js` and ship clearer runtime tool descriptions for security/quality scanners.
- Agent lanes distinguish Xcode-hosted work from patch-first clients so routine edits use the active client's native write lane while Axint handles proof.
- Same-thread upgrades let agents update Axint without losing the current project conversation.

### First-use and templates

- `create-axint-app` / `axint create` generates the Apple Day Agent starter: multiple App Intent contracts, generated Swift, plist and entitlement fragments, agent prompts, proof artifacts, and an interactive local proof preview.
- Bundled templates and Registry packages give agents reusable starting points instead of asking them to invent every Apple surface from scratch. Their current totals come from the canonical metrics bundle.

### Privacy-safe learning and adoption proof

- Source-free telemetry records command class, MCP tool name, version, coarse host hint, OS family, Node major, CI flag, and anonymous install ID so Axint can understand which install paths actually work.
- Standard product signals classify project lifecycle, delivery target, complexity, feature areas, Apple surfaces, and Registry demand gaps without storing raw searches or project descriptions.
- Enhanced source-free feedback packets correlate diagnostic codes, issue class, redacted evidence, project shape, suggested Axint ownership, deterministic repairs, and proof outcomes without sending source code, generated Swift, credentials, or local paths.
- Users can choose `axint telemetry standard`, opt into `axint telemetry enhanced`, inspect `axint telemetry status`, or disable telemetry and feedback independently. Axint-owned projects use `AXINT_DOGFOOD=1` for explicit internal attribution.
- Fresh installs can prove first real value with `axint activate` or the `axint.activate` MCP tool, so Pulse can separate setup/server-start events from activation.

---

## Current Priorities

### 1. Make the first run undeniable

Goal: the first command should create a real, inspectable Apple-native capability with proof, not a generic scaffold.

- Improve `create-axint-app` templates with more realistic app shells and generated Swift examples.
- Add a "Built with Axint" gallery that links each demo to source contract, generated Swift, proof packet, and install command.
- Add more end-to-end example repos for App Intent, SwiftUI widget, menu bar app, and existing-project repair flows.
- Keep `npm run install:gauntlet` green before release: local dist activation, packed fresh install activation, and create-axint-app launchpad creation.

### 2. Make existing-project repair feel senior

Goal: Axint should provide the evidence and repair context a senior Apple engineer expects from the loop.

- Expand UI repair classifiers for blocked taps, invisible overlays, scroll/hittability failures, state drift, navigation regressions, and accessibility identifier mismatches.
- Improve `.xcresult` parsing and attach focused failure context directly to repair packets.
- Keep agent-facing output compact by default while preserving full logs and source artifacts on disk.

### 3. Make MCP marketplaces score Axint correctly

Goal: every marketplace should understand Axint as a low-risk, useful, well-documented MCP server.

- Keep runtime dependencies minimal.
- Keep tool descriptions explicit: behavior, purpose, inputs, effects, and usage guidance.
- Maintain Glama, Smithery, MCP Registry, and other marketplace metadata from the same version truth.
- Keep legacy and `2026-07-28` stateless protocol checks green against the
  hosted endpoint.

### 4. Expand Apple surface coverage

Goal: cover the annoying Apple edges that make agents break.

- Richer `IntentDialog` support.
- More Apple parameter and entity types.
- App Shortcuts catalog generation.
- Control Widgets and Live Activities starter coverage.
- Better Swift 6 actor isolation and concurrency repair rules.
- Promote the Xcode 27, Swift 6.4, accessibility-label, and versioned App Store
  metadata canaries to strict release gates when their upstream surfaces are
  final.

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
- smaller reproductions for existing-project repair bugs
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
