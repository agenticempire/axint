# Non-goals

What the language deliberately refuses to express, and where to go instead.

## No imports

v1 is single-file. If you need an entity, declare it in the same file as the intent that uses it. If two intents share an entity, declare the entity in both files — the redundancy is cheap, and the resulting Swift is deduplicated by the generator.

If you need cross-file composition, use the TypeScript or Python surface.

## No expressions

No arithmetic, no string concatenation, no conditionals, no comparisons. The one interpolation form is `${paramName}` inside a `summary` template string, which looks up a declared param by name. Nothing else.

A default value is a literal, not an expression. `default: 100` is valid; `default: 50 * 2` is not.

## No user-defined functions or types

No `func`, no `struct`, no `class`, no type aliases, no generics, no protocols. The only types available are the eight primitives, declared entities, declared enums, and the array/optional modifiers over those.

If you want abstraction, use TypeScript.

## No perform / implementation body

A `.axint` file declares the shape of an App Intent. It does not implement `perform()`. The generated Swift contains a stub that calls into an implementation resolved at link time — typically a Swift Package target provided by the app author, or a generated bridge to the TS/Python runtime via Axint's IPC layer.

If you want to write the `perform` logic in TypeScript and have Axint bridge it, use the TS surface directly. The `.axint` surface is strictly declarative.

## No inline Swift

There is no `raw` or `swift { ... }` escape hatch. If you need Swift, you have three options, in order of preference:

1. Use the TS surface's `customResultType` to point at a Swift type you author separately.
2. `axint eject` your file to TypeScript and modify from there.
3. Edit the generated Swift directly and stop using the DSL for this intent.

The language does not try to be a thin wrapper over Swift. It is a target-agnostic declaration that happens to compile to Swift today.

## No macros

No compile-time metaprogramming. No generation-time substitution beyond the `${paramName}` rule in summary templates. If you find yourself wanting a macro, you have outgrown the DSL — move to the TS surface.

## No significant whitespace

A formatter will indent consistently. The parser ignores indentation. You can write an entire intent on one line if you want — the validator won't complain (though the formatter will fix it).

## No multiple intents per file (v1 convention)

The grammar allows multiple `intent` declarations per file. The v1 convention is one intent per file, with supporting entities declared above it. This is a convention the formatter and the `axint init` template enforce — not a grammar rule. Advanced authors can put several intents in one file; the compiler emits one Swift file per intent regardless.

## No views, widgets, or apps

v1 ships `intent` and `entity` only. Views, widgets, and apps stay on the TS and Python surfaces until v0.5.0. The vocabulary for those surfaces (`@State`, `@Binding`, `@Environment`, `WindowGroup`, `Settings`, timeline providers) is large enough that it needs its own grammar pass. Doing it badly would contaminate v1.

When v0.5.0 ships, the top-level decls `view`, `widget`, and `app` become available. The grammar described here does not change for existing intent and entity forms.

## No enums beyond flat string cases

v1 enums are flat: `enum Priority { low medium high }`. No associated values, no raw values, no methods, no conformances. They compile to Swift `enum Priority: String, AppEnum` with one case per identifier.

If you need associated values, use the TS surface.

## No schema extensions

No `extends`, no `mixin`, no trait composition. Each entity and each intent is self-contained. If two entities share ten properties, write the ten properties twice. The validator will tell you when the shapes drift — which is usually what you want.

## Future composition story

Several non-goals above are v1 scope decisions, not permanent language limits. They are called out here so a v0.5 or v0.6 can relax them without a breaking grammar change.

**Shared entities across files (v0.5 target).** The v1 rule is single-file: declare the entity next to the intent that uses it. This is correct for a first release — it keeps resolution trivial and the round-trip invariant easy to prove. But real apps re-use the same entity across dozens of intents, and asking authors to duplicate `entity Contact` into every file gets annoying fast. The v0.5 path is a minimal `use` clause at the top of a file:

```
use Contact from "./entities/contact.axint"
use Trail, Region from "./entities/trail.axint"

intent OpenTrail { ... }
```

No wildcard imports. No renaming. No transitive resolution through third-party packages. A `use` clause names one or more entities from a relative path, and the resolver inlines those entities' IR into the importing file at compile time. The resulting IR is still single-file shape — the composition happens entirely at the parser/resolver layer, so every downstream stage (validator, generator, round-trip) sees the same IR shape it sees today.

This is additive: v1 `.axint` files remain valid under v0.5 with no changes, because they don't have `use` clauses. The reserved keyword `use` is the only piece we need to hold back in v1's lexer to keep the door open.

**Shared enums follow the same pattern.** `use Priority from "./enums/priority.axint"` lowers to the same IR-inlining resolver.

**Intent packages (v0.6 target, speculative).** If and only if `use` proves insufficient, a later version may introduce a package manifest (`axint.toml` or similar) that lets the CLI resolve `use Contact from @myorg/shared-entities`. This is explicitly out of v0.5 scope — we ship relative-path imports first, learn what breaks, then decide whether a package system earns its complexity.

**What stays non-goal forever.** Expressions, user-defined functions, user-defined types beyond entities/enums, inline Swift, macros, and significant whitespace remain permanent non-goals. The grammar never grows those. If an author needs them, they have the TS and Python surfaces.

## What this list buys

Every non-goal here is a production the parser doesn't need, a branch the validator doesn't need, a codegen path the generator doesn't need, and a failure mode an agent can't trigger. The cost of excluding all of this is near zero: the TS surface is already rich enough that power users have somewhere to go. The value is a DSL that fits in a single prompt.
