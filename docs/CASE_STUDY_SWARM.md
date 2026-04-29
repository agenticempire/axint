# Swarm Dogfooding Case Study

Status: internal proof draft. Publish only after the matching SWARM screenshots,
run artifacts, and user-approved narrative are ready.

## What Changed

Swarm used Axint during a real frontend hardening pass across SwiftUI product
surfaces. The useful loop was:

1. `axint suggest` recognized existing-product repair instead of suggesting a
   new feature brainstorm.
2. `axint project index` highlighted risky SwiftUI surfaces such as Home,
   Breakaway, Discover, Chat, composer, and route/test files.
3. `axint run` bundled Swift validation, Cloud Check, Xcode build, focused UI
   tests, full-suite proof, repair prompts, run artifacts, and feedback packets.
4. The agent could not stop at the first passing focused test because Axint kept
   the broader proof loop visible.

## Before

- Agents could treat static validation as enough and stop too early.
- Failing Xcode UI details lived inside `.xcresult` or long logs.
- Cloud Check could sound too confident from prose-only UI evidence.
- MCP transport failures forced agents to manually infer CLI fallback commands.

## After This Sprint

- `axint run` extracts failing test names, assertions, files, lines,
  identifiers, likely causes, and repair hints.
- Direct Cloud Check no longer treats prose-only SwiftUI layout evidence as
  ready to ship.
- Runtime state-transition hangs point toward heavy SwiftUI animations,
  pinned headers, and collection recomputation.
- `axint run` accepts MCP-style CLI aliases such as `--cwd`,
  `--modified-files`, and `--project-name`.
- A local `.axint/memory/latest.*` index keeps project context, proof, repair,
  and source-free learning packets together.

## Proof Points To Capture Before Publishing

- One failing UI run where Axint names the failing test and repair hint.
- One passing run artifact after the repair.
- One privacy-safe learning packet with `source_not_included`.
- One screenshot or screen recording showing the final repaired Swarm surface.

## Public Story

Axint made the agent better at Apple-native repair work. It did not replace
developer taste or Xcode proof. It made the loop harder to fake and easier to
finish: understand the surface, patch the smallest area, run proof, learn from
the failure shape, and keep going until the evidence is real.

