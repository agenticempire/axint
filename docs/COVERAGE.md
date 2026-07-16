# Coverage Snapshot

This page is the quickest way to understand what Axint currently covers in Apple-native generation, validation, and repair.

## What Axint covers today

- Intent parsing, validation, and Swift generation
- SwiftUI view parsing, validation, and generation
- WidgetKit widget parsing, validation, and generation
- App-surface parsing, validation, and generation
- Swift build diagnostics for:
  - missing framework imports
  - missing App Intent wrappers
  - TimelineProvider requirements
  - App Shortcuts provider requirements
  - Swift 6 isolation and concurrency hazards
  - Live Activities / ActivityKit repair cases
  - HealthKit entitlement and privacy usage-description mismatches
  - iOS 27 `@State` macro initializer changes
  - SwiftUI document protocol and concurrency migration
  - visible `TabView` selection requirements
  - text-selection gesture conflicts
  - toolbar minimization and text-field style migrations
  - Foundation Models Private Cloud sampling behavior
  - Background Assets migration from On Demand Resources

## Canonical proof sources

- [`../metrics.json`](../metrics.json) is the machine-readable snapshot for counts
- [`ERRORS.md`](./ERRORS.md) is the full diagnostic registry
- [`FIX_PACKET.md`](./FIX_PACKET.md) is the repair-contract spec for CLI, MCP, and Xcode flows
- [`APPLE_27_COMPATIBILITY.md`](./APPLE_27_COMPATIBILITY.md) maps current Apple beta changes to implemented checks
- [`ACCESSIBILITY_LABELS.md`](./ACCESSIBILITY_LABELS.md) describes common-task evidence for App Store accessibility declarations
- [`MCP_2026_COMPATIBILITY.md`](./MCP_2026_COMPATIBILITY.md) documents dual-era hosted MCP support
- [`../benchmarks/brownfield/README.md`](../benchmarks/brownfield/README.md) publishes the 38-case precision, recall, and abstention gate
- [`../extensions/xcode/README.md`](../extensions/xcode/README.md) is the Xcode workflow guide
- [`../tests/examples/compile.test.ts`](../tests/examples/compile.test.ts) proves the bundled examples still compile across the supported Apple surfaces

## How to refresh the snapshot

Run:

```bash
npm run metrics:emit
```

That updates the committed metrics snapshot so the current totals for diagnostics, tests, MCP tools, and Xcode fix rules stay aligned.

## Current coverage lens

Think of the coverage in four layers:

1. Compiler surfaces
   Intents, views, widgets, and apps that Axint generates directly from structured input.

2. Swift validator surfaces
   Existing Apple-native Swift that Axint can inspect for concrete App Intents, WidgetKit, SwiftUI, concurrency, and ActivityKit failures.

3. Safe repair rules
   Mechanical rewrites that Axint can apply with high confidence, such as missing imports, missing protocol stubs, and safe concurrency rewrites.

4. App Store and platform release proof
   Accessibility declarations, App Store Connect metadata migrations, current
   SDK compatibility, and hosted MCP protocol parity.

5. Fix Packet / AI handoff
   The repair artifact that normalizes verdict, diagnostics, next steps, and the AI-ready fix prompt across CLI, MCP, and Xcode.

## Trust rule

Axint should never bluff.

If the current Swift validator cannot recognize a supported Apple-native surface, the Fix Packet now drops to low confidence instead of pretending the file is fully covered.

iOS 27 release-note heuristics are advisory and non-blocking until compiler,
test, or runtime evidence confirms them.
