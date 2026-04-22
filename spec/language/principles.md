# Design Principles

## The capture mechanism frame

Axint already has two authoring surfaces: TypeScript (`@axint/compiler`) and Python (`axint` on PyPI). Both compile to the same IR. Both produce identical Swift. The app-definition language is a third surface with one specific job: be the surface an agent reaches for by default.

TypeScript and Python carry ambient cognitive load — imports, async functions, builder calls, helper overloads, language idioms. An agent emitting a TS intent must keep a mental model of the surrounding TS runtime. A `.axint` file has no runtime. It declares data. That is the entire advantage.

## Seven agent-first criteria

Every grammar production must satisfy all seven:

1. **Predictable.** Given the same intent, ten different agents should produce textually identical or near-identical files. If the grammar admits ten valid stylistic variants, the grammar is wrong.

2. **Low-entropy.** One obvious way to express each concept. No expressions, no interpolation rules except the one in summary templates, no inline computation, no escape hatches for "just this once."

3. **Easy to parse.** A single-pass recursive-descent parser should handle the entire grammar without backtracking. If the parser needs lookahead greater than one token, the grammar needs simplifying.

4. **Easy to correct.** When the validator emits a diagnostic, the agent should be able to fix the file by editing one line. No file-wide restructuring. Within a declaration, the grammar fixes field order (title → description → meta → params → summary → returns → entitlements → infoPlistKeys) so a "clause out of order" error always points at a single misplaced block. At the file level, the only order rule is convention: entities appear above intents that reference them.

5. **Easy to teach in one prompt.** The full language — every keyword, every production — must fit in 200 lines of prompt context. If it doesn't, the language is too big.

6. **Easy to diff.** Declarations are line-oriented where possible. Renaming a param or changing a description changes one line. No multi-line restructuring for semantic edits.

7. **Easy to format.** A formatter written in an afternoon should produce canonical output. No significant whitespace. No alignment rules. Braces close on their own line. Done.

## What this rules out

- User-defined functions, types, or macros
- Expressions of any kind outside string literals
- Template interpolation except in `summary` strings, where `${paramName}` references a declared param
- Conditionals, loops, or control flow
- Imports (v1 is single-file; entities used by an intent are declared in the same file)
- Inline Swift escape hatches (if you need Swift, use the TS surface's `customResultType`)
- Metaprogramming of any kind

## What this rules in

- Declaration of `intent`, `entity`, and `enum`
- Declaration of parameters, their types, their descriptions, their defaults, their optionality
- Declaration of entity properties and display representations
- Declaration of parameterSummary in simple, `when`, and `switch` forms
- Declaration of entitlements and Info.plist keys required by an intent
- Declaration of dynamic options providers by name (provider implementations live in the TS or Python surface)

## The no-user-abstractions rule

v1 has no mechanism for user-defined abstractions. No functions, no types beyond the built-in primitives and declared entities, no macros, no extensions. This is deliberate. Abstractions are where grammars go to die: every new abstraction is new entropy for an agent, new syntax for the parser, new surface area for the validator, new room for mistakes.

If a user wants abstraction, they have TypeScript and Python already. The `.axint` surface is for declaring the finite, well-known shape of an App Intent. That shape is enumerated by Apple's `AppIntents` framework. It is not infinite. It does not need user extension.

## The migration contract

A `.axint` file is always lowerable to its equivalent TS file with no loss. The `axint eject` command will emit the TS form. This is not a promise about tooling. It is a design constraint: every grammar production must have a faithful TS representation, and the IR round-trips in both directions. If a production cannot round-trip, it does not ship in v1.
