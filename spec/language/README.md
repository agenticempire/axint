# Axint App-Definition Language — Specification

Axint adds a compact declarative authoring surface for App Intents and App Entities that compiles 1:1 into the existing IR and validated Swift. That is the whole pitch. It is not a general-purpose programming language, not a replacement for the TypeScript or Python surfaces, and not an attempt to grow a new ecosystem. It is a capture mechanism — a low-entropy syntax that agents can write, read, diff, and correct in a single prompt — pointed at the same compiler, the same diagnostics, and the same validated Swift output everything else already targets.

The existing TS and Python SDKs remain the primary authoring surfaces. The app-definition language is a third surface sitting next to them. All three lower to the same `IRIntent` / `IREntity` nodes, so every intent written in any surface is fungible with every intent written in every other surface.

This directory is the specification. The language itself ships as part of `@axint/compiler` starting in `v0.4.0-alpha`, behind an experimental flag.

## Status

- **Version:** draft 1 (pre-implementation)
- **Scope v1:** `intent`, `entity`, and `enum` declarations. An enum is a closed set of named cases used as a param type. Files may contain any combination of the three; a file with only enums is valid and compiles to the enum's Swift form with no intent output.
- **IR target:** existing `IRIntent`, `IREntity`, and the inline `enum` IR form — no new IR nodes
- **Diagnostics v1:** reuses existing `AX001`–`AX113` and `AX200`–`AX202` codes — no new codes
- **File extension:** `.axint`
- **Reserved for later:** additional top-level surfaces (`view`, `widget`, `app`) and cross-file composition (`use`, `from`) — deferred to v0.5.0+. User-defined functions, types beyond `entity` and `enum`, and macros are permanent non-goals (see [`non-goals.md`](./non-goals.md)).

## Contents

- [`why-agents.md`](./why-agents.md) — the thesis: smallest valid search space, measured on seven metrics
- [`principles.md`](./principles.md) — design principles and the seven agent-first criteria
- [`grammar.md`](./grammar.md) — lexical rules and full EBNF
- [`parser-recovery.md`](./parser-recovery.md) — single-pass recovery contract: one parse, all diagnostics
- [`keywords.md`](./keywords.md) — keyword and type catalog
- [`ir-mapping.md`](./ir-mapping.md) — every production mapped to an IR node
- [`non-goals.md`](./non-goals.md) — what the language deliberately refuses to express
- [`diagnostics.md`](./diagnostics.md) — which AX codes a `.axint` file can trigger
- [`diagnostic-protocol.md`](./diagnostic-protocol.md) — machine-readable diagnostic schema and fix-kind taxonomy
- [`benchmark.md`](./benchmark.md) — 20-task agent benchmark matrix across `.axint`, TS, Python, and raw Swift
- [`failures.md`](./failures.md) — canonical broken-input corpus, one entry per author-side AX code
- [`examples/`](./examples) — canonical `.axint` files with paired Swift outputs

## Versioning

The spec ships three version lines. Most releases touch one; they bump independently.

| Line                         | Lives in                           | Bumps when                                                                                   |
|------------------------------|------------------------------------|----------------------------------------------------------------------------------------------|
| Language spec                | this directory                     | Grammar, keyword set, IR mapping, or field-order rules change                                  |
| Diagnostic protocol          | `schemaVersion` in `diagnostic-protocol.md` (pinned to `1`) | JSON record shape, the closed fix-kind set, or `Fix` object fields change       |
| Parser recovery boundaries   | `parser-recovery.md`               | The closed four-point boundary set gains or loses a recovery point                            |

Diagnostic wording changes bump nothing.

## One rule above everything else

> The language is not the product. The language is the capture mechanism.

Every decision in this spec is evaluated against that frame. If a feature makes the surface richer but harder for an agent to emit correctly, it does not ship. The compiler's IR, the validator, and the Swift generator are the product. The language exists so a model can hand us a single file and we can hand back a working Apple feature.
