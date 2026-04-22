# Diagnostics

v1 ships with zero new diagnostic codes. Every validation path a `.axint` file can hit already has an AX code from the TS/Python surfaces. This document catalogs which codes fire, in which parser stage, and what triggers them.

## Parser stage — lexing and syntax

These fire before validation, while tokenizing or parsing the file.

| Code   | Severity | Trigger in `.axint`                                            |
|--------|----------|----------------------------------------------------------------|
| AX001  | error    | File contains no top-level declarations. A file with only comments, or an empty file, fails. A file with only `enum` declarations is valid. |
| AX002  | error    | An `intent` or `entity` declaration is missing a name.         |
| AX003  | error    | An `intent` is missing a `title` clause.                       |
| AX004  | error    | An `intent` is missing a `description` clause.                 |
| AX005  | error    | A `param` or `property` uses an unknown type.                  |
| AX007  | error    | A clause or token the parser does not recognize at its position — covers unknown field keyword inside an `intent-body` or `entity-body` (e.g. `titel: "..."`), a clause declared out of the fixed order, or a type syntax form the parser does not recognize (e.g. generics). |
| AX015  | error    | An `entity` is missing a `display` block.                      |
| AX016  | error    | An `entity` `display` block is missing `title`.                |
| AX017  | error    | An `entity` is missing a `query` clause.                       |
| AX018  | error    | An `entity` `query` uses an unknown kind.                      |
| AX019  | error    | An `entity` has zero `property` declarations.                  |
| AX020  | error    | A `param` references an entity not declared in the file.       |
| AX021  | error    | A `display` field names a property that doesn't exist.         |
| AX022  | error    | A `param options: dynamic` names a provider that cannot be resolved at bundle time. Note: this is a build-time concern, not an authoring-surface dependency. The `.axint` file itself remains single-file; provider resolution happens when the CLI assembles the bundle from `.axint` + sibling TS/Python files. |
| AX023  | error    | A `summary` template references a param that doesn't exist on the intent. |

Note: the parser reuses the same AX015–AX023 range the TS parser uses for entity errors. The surface is different, the errors are the same.

## Validator stage — semantic checks

After the parser produces IR, the same `IRIntent` and `IREntity` validators the TS surface runs are run against the DSL-produced IR. No DSL-specific logic.

| Code   | Severity | Trigger                                                        |
|--------|----------|----------------------------------------------------------------|
| AX100  | error    | Intent name is not `PascalCase`.                               |
| AX101  | error    | Intent `title` is empty.                                       |
| AX102  | error    | Intent `description` is empty.                                 |
| AX103  | error    | Intent has duplicate param names.                              |
| AX104  | error    | Param or entity property is missing its `description` field, or the description string is empty. The grammar requires the field; the validator rejects an empty string. |
| AX105  | error    | Param name is not `camelCase`.                                 |
| AX106  | error    | Param `default` value type does not match the declared type.   |
| AX107  | error    | Optional param has a non-null default — contradictory.         |
| AX108  | warning  | Intent has no params (allowed but unusual).                    |
| AX109  | error    | `summary` `switch` has no `default` and the param type is not exhaustively covered. |
| AX110  | error    | Entity name is not `PascalCase`.                               |
| AX111  | error    | Entity property name is not `camelCase`.                       |
| AX112  | error    | Entity `query: property` but no property has `description`.    |
| AX113  | error    | Entity `display.image` is not a valid SF Symbol or asset name. |

## Generator stage — Swift emission

These should not fire against a well-formed IR from the parser. If any of these triggers, there is a bug in the DSL → IR lowering.

| Code   | Severity | Trigger                                                        |
|--------|----------|----------------------------------------------------------------|
| AX200  | error    | Generator received an unknown IR type kind.                    |
| AX201  | error    | Generator could not synthesize a required conformance.         |
| AX202  | error    | Generator tried to emit a platform-specific type unsupported on the target. |

The DSL parser has a property test ensuring every IR it produces is well-formed relative to the IR type schema in `src/core/types.ts`. If the generator emits AX200+, the parser test suite has a gap.

## Registry / bundle

| Code   | Severity | Trigger                                                        |
|--------|----------|----------------------------------------------------------------|
| AX600  | error    | A `.axint` file is publishable to the registry and the bundle hash does not match. |

This only fires during `axint publish`. Authoring a `.axint` file never triggers AX600.

## What does *not* need new codes

- Recursive `summary` structures: if an inner `summary when` references a missing param, AX023 fires with a nested path.
- Entity references in `returns`: same AX020 path as param entity references.
- Enum case references in `summary switch case`: validated by the same literal-type checker that enforces `default` values. If `case purple:` appears under a `switch priority` where `Priority` is `{ low medium high }`, the validator rejects it with AX106 — the same "literal does not match declared type" code used for defaults, because semantically that is the same class of error (a literal the type can't accept).

## Agent fix-path expectation

For each diagnostic above, an agent receiving the error should be able to fix the file by editing one line or one block. Example:

```
# AX107: Optional param has a non-null default — contradictory.
param urgent: boolean? {
  description: "Mark as urgent"
  default: true    # ← remove this line, or change type to `boolean`
}
```

The validator emits the line and column. The fix is a single-line edit. That is the agent-first criterion #4 in `principles.md`.
