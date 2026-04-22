# Diagnostic Protocol

Every diagnostic the compiler emits against a `.axint` file is machine-readable and repair-oriented. A diagnostic does not just tell an agent *what* is wrong — it tells the agent *where* to edit, *what kind* of edit, and, when possible, *exactly what* to write. This turns criterion #4 in `principles.md` ("easy to correct") and metrics #4–#5 in `why-agents.md` (turns to green, lines per repair) from aspirations into a protocol.

Human-readable diagnostics still ship — they are the default output of `axint check` and what a developer sees in an editor. The machine-readable form is additive, emitted under `axint check --format=json`.

## The diagnostic record

Every diagnostic is a JSON object of this shape:

```json
{
  "schemaVersion": 1,
  "code": "AX021",
  "severity": "error",
  "message": "Display field names a property that doesn't exist on the entity.",
  "file": "intents/trail.axint",
  "span": {
    "start": { "line": 5, "column": 12 },
    "end":   { "line": 5, "column": 17 }
  },
  "fix": {
    "kind": "replace_identifier",
    "targetSpan": {
      "start": { "line": 5, "column": 12 },
      "end":   { "line": 5, "column": 17 }
    },
    "suggestedEdit": { "text": "name" },
    "candidates": ["name", "region"]
  }
}
```

Top-level fields:

| Field            | Type                                  | Required | Meaning                                                            |
|------------------|---------------------------------------|----------|--------------------------------------------------------------------|
| `schemaVersion`  | integer                               | yes      | Pinned to `1` in v1. Consumers must check and reject unknown versions. |
| `code`           | string                                | yes      | `AX###`. One of the codes in `diagnostics.md`.                      |
| `severity`       | `"error"` \| `"warning"`              | yes      | Matches the catalog in `diagnostics.md`.                            |
| `message`        | string                                | yes      | Human-readable. One sentence. No trailing period convention.        |
| `file`           | string                                | yes      | Path relative to the project root.                                  |
| `span`           | `Span`                                | yes      | Where the problem is. Used for editor highlighting.                  |
| `fix`            | `Fix` \| `null`                       | yes      | `null` when there is no principled author-side fix (compiler/registry codes). |

## Spans

```ts
type Position = { line: number; column: number }  // both 1-indexed
type Span     = { start: Position; end: Position } // end is exclusive
```

Line and column are 1-indexed. `end` is exclusive — `{start:(5,12), end:(5,17)}` covers five characters on line 5 starting at column 12. A zero-width span (`start == end`) denotes an insertion point, used by the insert-class fix kinds below.

Spans always point at the narrowest meaningful range. For an identifier error, the span is the identifier, not the enclosing clause. For a missing clause, the span is the empty range at the point the clause would appear.

## Fix kinds

Six kinds. Closed set — the TypeScript union type is exhaustive and the compiler emits a `never` default. Adding a new kind is a minor version bump of `schemaVersion`.

| Kind                      | What it does                                                                  | Canonical triggers                                           |
|---------------------------|-------------------------------------------------------------------------------|--------------------------------------------------------------|
| `insert_required_clause`  | Insert a missing required clause or block.                                    | AX001, AX003, AX004, AX015, AX016, AX017, AX019, AX109, AX112 |
| `remove_field`            | Delete a field that is syntactically valid but contradictory, unknown, or out of order. | AX107, AX007 (see §AX007 below)                      |
| `replace_literal`         | Replace a literal value with another of the correct type or from a closed set. | AX101, AX102, AX106, AX113                                    |
| `change_type`             | Change a declared type annotation to match the surrounding constraint.         | AX005, AX007 (see §AX007 below)                              |
| `rename_identifier`       | Rename an identifier to match a naming convention, resolve a duplicate, or correct a close-match typo. | AX100, AX103, AX105, AX110, AX111, AX007 (see §AX007 below) |
| `replace_identifier`      | Rewrite an identifier reference to point at a different declaration that exists. | AX002, AX018, AX020, AX021, AX022, AX023                    |

The kind is a hint about the *shape* of the edit. It does not replace the `suggestedEdit.text` field — it tells the agent what class of mistake this is, which is useful for repair priority, for training, and for cases where the text field is absent and the agent has to synthesize the edit itself.

### AX007 fix-kind resolution

AX007 is the one code that maps to more than one fix kind. The code itself is narrow — "parser saw a token it doesn't expect at this position" — but it fires on three distinct parser-position errors, and the repair shape differs per sub-case. The parser knows which sub-case it is at emission time, so the emitted `fix.kind` is deterministic.

| Sub-case                                                 | Fix kind               | Example and repair                                                                                  |
|----------------------------------------------------------|------------------------|-----------------------------------------------------------------------------------------------------|
| Unknown field keyword, close match to a valid one         | `rename_identifier`    | `titel: "..."` → the compiler emits `rename_identifier` with `suggestedEdit.text: "title"`          |
| Unknown field keyword, no close match                     | `remove_field`         | `frobnicate: 42` inside an `intent-body` → delete the line (`suggestedEdit.text: ""`)               |
| Clause declared out of the fixed order                    | `remove_field`         | `description` before `title` → delete the out-of-order line; the next `axint check` fires AX003/AX004 with `insert_required_clause` at the correct position. Two passes, each a single-line edit. |
| Malformed type syntax (generics, unrecognized form)       | `change_type`          | `param foo: Map<string, int>` → change to a supported primitive, entity, or array form              |

The closed fix-kind set does not grow to accommodate AX007. The code stays overloaded on purpose — the parser's notion of "this token doesn't belong here" is one concept, even if the repair shape splits. The two axes (codes describe what went wrong, fix kinds describe what shape the repair takes) are intentionally orthogonal. Agents that read `fix.kind` get a single-edit repair path regardless of which sub-case fired.

A later release can split AX007 into three distinct codes if implementation shows the overload is confusing in practice. That is a `schemaVersion` bump and a catalog migration, not a v1 concern.

## The `Fix` object

```ts
type Fix = {
  kind:           FixKind
  targetSpan:     Span
  suggestedEdit?: { text: string }
  candidates?:    string[]
}
```

| Field           | Type        | Required | Meaning                                                              |
|-----------------|-------------|----------|----------------------------------------------------------------------|
| `kind`          | `FixKind`   | yes      | One of the six kinds above.                                          |
| `targetSpan`    | `Span`      | yes      | The exact range the edit replaces. For inserts, a zero-width span at the insertion point. |
| `suggestedEdit` | `{ text }`  | no       | When the compiler can synthesize a complete fix, the replacement text. Applying this text at `targetSpan` resolves the diagnostic. |
| `candidates`    | `string[]`  | no       | For identifier-replacement kinds, the set of valid alternatives. The agent picks one; `suggestedEdit.text`, when present, is the compiler's top pick. |

A `suggestedEdit` is present when:

- The target is a closed set (`replace_literal` for `AX018` query-kind, `AX113` SF Symbol, `replace_identifier` for `AX020`/`AX021`/`AX023` where only one plausible target exists).
- The target is mechanical (`remove_field` for `AX107`: `text: ""`).
- The convention is unambiguous (`rename_identifier` for `AX100`/`AX105`/`AX110`/`AX111`: PascalCase ↔ camelCase is a pure transform).

A `suggestedEdit` is absent when:

- The correct text depends on domain knowledge (`insert_required_clause` for `AX003` missing title: the compiler can insert `title: ""` but the string itself is up to the agent).
- Multiple candidates are equally valid and no heuristic picks one.

In the absent case, the agent synthesizes the text. `kind` and `targetSpan` still narrow the task to a one-line edit.

## Applying an edit

The edit operation is textual, not semantic. Given a diagnostic with `fix.targetSpan = s` and `fix.suggestedEdit.text = t`:

1. Read the source bytes between `s.start` and `s.end`.
2. Replace them with `t`.
3. Rerun `axint check`.

If the diagnostic was the only blocker and the suggested edit is present, the file is now valid. If there are more diagnostics, the agent processes the next one. If the edit introduced a new diagnostic, the agent backs off to the next candidate or asks for help.

The protocol makes no promise that all diagnostics are suggestedEdit-complete in v1. The promise is that every diagnostic has a `kind` and a `targetSpan`, so every fix is local and bounded.

## Catalog

Every code in `diagnostics.md` mapped to its fix kind. Suggested edits marked ✅ where the compiler can synthesize the full text, ✱ where it can only insert a scaffold, and — where the agent must supply the text.

| Code  | Severity | Fix kind                   | Suggested |
|-------|----------|----------------------------|-----------|
| AX001 | error    | `insert_required_clause`   | ✱         |
| AX002 | error    | `replace_identifier`       | —         |
| AX003 | error    | `insert_required_clause`   | ✱         |
| AX004 | error    | `insert_required_clause`   | ✱         |
| AX005 | error    | `change_type`              | —         |
| AX007 | error    | context-sensitive †        | varies    |
| AX015 | error    | `insert_required_clause`   | ✱         |
| AX016 | error    | `insert_required_clause`   | ✱         |
| AX017 | error    | `insert_required_clause`   | ✱         |
| AX018 | error    | `replace_literal`          | ✅        |
| AX019 | error    | `insert_required_clause`   | ✱         |
| AX020 | error    | `replace_identifier`       | ✅        |
| AX021 | error    | `replace_identifier`       | ✅        |
| AX022 | error    | `replace_identifier`       | —         |
| AX023 | error    | `replace_identifier`       | ✅        |
| AX100 | error    | `rename_identifier`        | ✅        |
| AX101 | error    | `replace_literal`          | —         |
| AX102 | error    | `replace_literal`          | —         |
| AX103 | error    | `rename_identifier`        | —         |
| AX104 | error    | `insert_required_clause` \| `replace_literal` | — |
| AX105 | error    | `rename_identifier`        | ✅        |
| AX106 | error    | `replace_literal`          | —         |
| AX107 | error    | `remove_field`             | ✅        |
| AX108 | warning  | `insert_required_clause`   | ✱         |
| AX109 | error    | `insert_required_clause`   | ✱         |
| AX110 | error    | `rename_identifier`        | ✅        |
| AX111 | error    | `rename_identifier`        | ✅        |
| AX112 | error    | `insert_required_clause`   | ✱         |
| AX113 | error    | `replace_literal`          | ✅        |
| AX200 | error    | — (compiler bug)           | —         |
| AX201 | error    | — (compiler bug)           | —         |
| AX202 | error    | — (compiler bug)           | —         |
| AX600 | error    | — (registry, not author-side) | —      |

The codes without an author-side fix (`AX200`–`AX202`, `AX600`) emit `"fix": null`. These surface as tool errors — a compiler bug, a registry mismatch — and the repair path is "file an issue" or "republish," not "edit the file."

† AX007's fix kind depends on the sub-case. See [§AX007 fix-kind resolution](#ax007-fix-kind-resolution) above.

## The agent repair loop

```
while True:
    result = axint_check(file, format="json")
    if result.diagnostics == []:
        break

    d = pick_highest_priority(result.diagnostics)

    if d.fix is None:
        escalate_to_user(d)
        break

    if d.fix.suggestedEdit is not None:
        file = apply_edit(file, d.fix.targetSpan, d.fix.suggestedEdit.text)
    else:
        text = synthesize_text(d.code, d.fix.kind, d.fix.candidates, context=file)
        file = apply_edit(file, d.fix.targetSpan, text)
```

`pick_highest_priority` in v1 is "first-file, first-line, first-column." Diagnostics do not block each other — fixing them in source order converges.

## Versioning

`schemaVersion: 1` is pinned for the life of v1. If the shape of the emitted record changes — new required field, renamed field, new fix kind added to the closed set — the version increments. Consumers must refuse records with a `schemaVersion` they do not recognize rather than silently dropping unknown fields.

The fix-kind set is closed. Adding a new fix kind is a version bump. Changing which AX code maps to which fix kind is a patch — the semantics of an edit don't change, only the label.

## Why this schema and not LSP diagnostics

LSP's `Diagnostic` is a superset shape designed for general-purpose language servers. It carries `code`, `message`, `range`, and a free-form `data` field that every server uses differently. That freedom is precisely what we are trying to remove. The Axint diagnostic protocol is a closed schema built around a closed fix-kind set, because the whole point is that an agent consuming diagnostics from Axint can write repair logic once and have it work against every diagnostic the compiler will ever emit.

The protocol is serializable to LSP — the `code`, `message`, `range`, and a subset of `data` map cleanly — and the `axint-lsp` server does that translation. But the canonical machine-readable form is this document, not LSP.
