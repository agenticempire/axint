# Release Notes

## 2026-04-20 — Xcode repair loop and Apple coverage expansion

This release wave sharpens the Xcode workflow and expands Apple-native Swift coverage in places where generic coding assistants usually feel soft.

### Added

- `axint xcode packet`
  - Reads the latest Fix Packet from Xcode DerivedData or a plugin work directory
  - Can print markdown, raw JSON, the AI repair prompt, or the packet path
- New Swift diagnostics:
  - `AX716` — missing `import AppIntents`
  - `AX717` — missing `import WidgetKit`
  - `AX718` — missing `import SwiftUI`
  - `AX719` — AppIntent inputs missing `@Parameter`
- New intent-validation diagnostics:
  - `AX114` — HealthKit entitlement declared without matching privacy usage descriptions
  - `AX115` — HealthKit privacy usage descriptions declared without the HealthKit entitlement
  - `AX116` — privacy usage description is empty or still placeholder copy
- New safe repair coverage:
  - insert missing Apple framework imports
  - inject missing `TimelineProvider` stubs
  - inject missing `appShortcuts` into `AppShortcutsProvider`
  - rewrite `lazy var` inside actors to `var`
  - rewrite `Task.detached {}` to `Task {}`

### Improved

- Xcode docs now explain the `build -> packet -> fix -> rerun` loop directly
- Fix Packets now carry a low-confidence signal for Swift files that Axint does not recognize as supported Apple-native surfaces
- Fix Packets now read like a structured Apple repair brief instead of a flat error dump:
  - `What broke`
  - `Why it matters`
  - `Make this change`
  - generated artifact hints for Swift, plist, and entitlements when available
- Metrics now expose Xcode fix rule counts and names so coverage can be tracked more explicitly
- Intent validation now catches a common App Review / HealthKit setup failure before you leave the compiler loop
- The bundled examples are now part of the proof surface: they compile in CI, and the HealthKit example shows the same entitlement + privacy contract the validator enforces
- The Python SDK now accepts real Info.plist usage-description copy, ships a HealthKit example, and mirrors the HealthKit/privacy diagnostics that landed in TypeScript

### Why it matters

The goal is not just “more errors.”

The goal is a tighter Apple-native repair loop:

1. Build or validate
2. Read one repair packet
3. Hand the prompt to your AI tool or use it directly in Xcode
4. Rerun until the result is clean
