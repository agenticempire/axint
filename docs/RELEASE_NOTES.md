# Release Notes

## 2026-04-29 — Agent-aware run loop and first-use wow fixture

This release wave makes Axint feel more like a project brain for Apple-native agents instead of a set of separate commands.

### Added

- `axint init --apple-project`
  - Initializes Axint inside an existing Apple/Xcode project.
  - Writes the project start pack and installs the local multi-agent brain in one command.
- `axint run --agent <agent>`
  - Starts the run with the active host lane: `codex`, `claude`, `cursor`, `cowork`, `xcode`, or `all`.
  - Returns host-safe repair guidance instead of generic “try this” instructions.
- `axint.agent.*`
  - Installs `.axint/agent.json`, project context, local file claims, and a coordination ledger.
  - Gives Codex, Claude, Cursor, Xcode, and humans one shared local truth layer.
- `axint memory index`
  - Writes `.axint/memory/latest.json` and `.axint/memory/latest.md` from project context, latest run proof, latest repair packet, and source-free learning packets.
  - Gives agents a compact project memory after context compaction or when multiple tools are working in the same project.
- `examples/wow/composer-blocker`
  - A small SwiftUI interaction-repair fixture where an invisible overlay blocks a composer text field.
  - Includes a focused UI-test failure log so Axint can demonstrate project-aware diagnosis without private dogfooding notes.

### Improved

- `axint.run` now embeds the active agent profile in markdown, JSON, and repair-prompt output.
- `axint.run` now accepts MCP-style CLI aliases such as `--cwd`, `--modified`, `--modified-files`, and `--project-name` so fallback commands work when MCP transport is closed.
- `axint.run` now writes privacy-safe Cloud learning packets from Cloud Check signals to `.axint/feedback`.
- Compact JSON keeps the important verdict, diagnostics, artifact paths, agent lane, and next moves visible while still omitting source by default.
- The repair prompt now includes the host lane, local brain status, file-claim guidance, and the smallest proof loop to rerun next.
- Direct Cloud Check no longer treats prose-only SwiftUI behavior notes as runtime proof. View/app checks stay at `evidence_required` until build, UI-test, runtime, or `axint run` evidence is supplied.
- Swift validation adds `AX767` for non-`@ViewBuilder` `some View` helpers that declare locals but forget an explicit `return`.
- Generation self-audit adds `AX855` so existing-app UI generation refuses to invent a requested project token namespace that is not present in the supplied context.

### Why it matters

The first-use story is now clearer:

1. Point Axint at an existing Apple project.
2. Let Axint index the app and install the local project brain.
3. Ask Codex, Claude, Cursor, Xcode, or terminal for the same repair loop.
4. Run focused proof and keep the result in `.axint/run/latest.*`.

## 2026-04-20 — Xcode repair loop and Apple coverage expansion

This release wave sharpens the Xcode workflow and expands Apple-native Swift coverage in places where generic coding assistants usually feel soft.

### Added

- `latest.check.json` / `latest.check.md`
  - Every compile, watch, and validate-swift run now emits a lightweight Axint Check verdict next to the richer Fix Packet
  - The summary leads with pass / needs review / fail, top findings, and the next step instead of dropping straight into raw packet detail
- `axint xcode check`
  - Reads the latest Xcode-side Axint Check from DerivedData or a plugin work directory
  - Can print markdown, raw JSON, or the AI repair prompt directly
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
  - `AX117` — probable HealthKit entitlement shorthand instead of the real Apple entitlement key
  - `AX118` — probable HealthKit plist shorthand instead of Apple's real usage-description keys
- New safe repair coverage:
  - insert missing Apple framework imports
  - inject missing `TimelineProvider` stubs
  - inject missing `appShortcuts` into `AppShortcutsProvider`
  - rewrite `lazy var` inside actors to `var`
  - rewrite `Task.detached {}` to `Task {}`

### Improved

- Compile, watch, and validate-swift now share one repair-artifact emission path, so the lightweight verdict summary and the full packet stay in lockstep instead of drifting across CLI surfaces
- Xcode docs now explain the `build -> packet -> fix -> rerun` loop directly
- Xcode docs now also explain the `build -> check -> packet -> fix -> rerun` loop so the Apple workflow starts with the simple verdict before it expands into repair detail
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
- The compiler now keeps a real Cloud HealthKit failure as a regression test, so shorthand entitlement/plist mistakes stay actionable instead of drifting back to generic warnings

### Why it matters

The goal is not just “more errors.”

The goal is a tighter Apple-native repair loop:

1. Build or validate
2. Read one repair packet
3. Hand the prompt to your AI tool or use it directly in Xcode
4. Rerun until the result is clean
