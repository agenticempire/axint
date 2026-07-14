# Axint App-Definition Language Specification

The `.axint` language is an experimental, compact authoring surface for agents.
It captures declarative Apple feature shape with a small grammar, then lowers to
the same intent and entity IR contracts used elsewhere in Axint. It is not a
general-purpose language, a Swift replacement, or the primary Axint product.

The proof and repair runtime remains the product boundary. The language is one
optional way to create structured input for that system.

## Status

**Implemented experimental surface.** The first parser implementation shipped
in `v0.4.0-alpha` and is present in the current package.

Implemented today:

- lexer and token model
- recovery-aware parser with structured diagnostics
- canonical formatter exposed through `axint format`
- lowering for `intent`, `entity`, and `enum` declarations
- lowering for safe `page` manifests and host-rendered modules
- parser, lowering, printer, round-trip, and broken-input corpus tests
- canonical `.axint` and paired Swift examples for the intent/entity subset

Current boundaries:

- The parser, formatter, and lowering APIs do not require an experimental flag.
- Direct `.axint` input is not yet wired through the main `axint compile` command.
- `view`, `widget`, and `app` declarations remain specification-only future work.
- Cross-file composition with `use` and `from` remains specification-only.
- User-defined functions, arbitrary types, macros, and embedded application logic are permanent non-goals.
- The model-based four-surface benchmark is a proposed protocol, not an implemented release gate.

The TypeScript and Python SDKs remain the production authoring surfaces. Their
capabilities are not implied by the `.axint` implementation status, and vice
versa.

## Implemented data path

```text
.axint source
  -> tokenize
  -> parse with recovery
  -> canonical format or lower
  -> IRIntent / IREntity / enum IR / IRPublicPage
```

Intent IR can be passed to the existing `compileFromIR()` API. That is an API
composition point, not yet a dedicated end-to-end `.axint` CLI compile path.

## Contents

- [`why-agents.md`](./why-agents.md) states the design hypothesis and measurable criteria.
- [`principles.md`](./principles.md) defines the agent-first design principles.
- [`grammar.md`](./grammar.md) contains the lexical rules and EBNF.
- [`parser-recovery.md`](./parser-recovery.md) defines single-pass recovery boundaries.
- [`keywords.md`](./keywords.md) catalogs keywords and primitive types.
- [`ir-mapping.md`](./ir-mapping.md) maps productions to implemented or proposed IR.
- [`non-goals.md`](./non-goals.md) records deliberate exclusions.
- [`diagnostics.md`](./diagnostics.md) maps language failures to AX diagnostics.
- [`diagnostic-protocol.md`](./diagnostic-protocol.md) defines machine-readable diagnostics.
- [`benchmark.md`](./benchmark.md) preserves the proposed model benchmark design.
- [`failures.md`](./failures.md) describes the broken-input corpus.
- [`examples/`](./examples) contains canonical sources and paired outputs.

## Versioning

The specification tracks three independently changing contracts:

| Contract | Source | Changes when |
| --- | --- | --- |
| Language grammar | this directory | Grammar, keyword, mapping, or field-order rules change |
| Diagnostic protocol | `schemaVersion` in `diagnostic-protocol.md` | JSON shape, fix kinds, or fix fields change |
| Parser recovery | `parser-recovery.md` | The recovery boundary set changes |

Diagnostic wording alone does not change a contract version.

## One rule above everything else

> The language is not the product. The language is the capture mechanism.

Features belong here only when they reduce authoring ambiguity without creating
new unsupported states in the compiler or proof loop.
