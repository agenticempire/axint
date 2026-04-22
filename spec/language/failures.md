# Canonical Failures Corpus

The failures corpus is the set of deliberately broken `.axint` inputs that every author-side diagnostic code (`AX001`–`AX113`) must have an entry for. Each entry pins the input, the exact diagnostic record the compiler emits, and the one-edit repair. The corpus is what the benchmark's repair bucket (`benchmark.md` §Repair) draws from, what the diagnostic-protocol test suite regressions against, and what a new agent repair-loop learns from.

It also enforces a contract: a new diagnostic code cannot ship without a corpus entry. If the compiler can emit it, the corpus shows what triggers it and what fixes it.

## What an entry contains

Each entry lives under `spec/language/examples/failures/<ax-code>/` and has exactly five files. No more, no less.

| File              | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `broken.axint`    | The minimal `.axint` source that triggers this code and only this code. |
| `diagnostic.json` | The exact diagnostic record the compiler emits, matching the schema in `diagnostic-protocol.md`. Used as the gold output for protocol tests. |
| `fixed.axint`     | The repaired file, identical to `broken.axint` outside the repair span. |
| `repair.diff`     | Unified diff `broken.axint` → `fixed.axint`. Must be ≤3 lines changed — any entry that requires more is a sign the diagnostic or the repair is too broad. |
| `notes.md`        | One paragraph. Why this is the canonical form of this failure, what near-variants are *not* canonical, and what the fix demonstrates about the fix kind. |

"Minimal" means the surrounding `.axint` is the smallest valid-except-for-this-error file. An `AX107` entry is a valid intent with one param whose only flaw is a non-null default on an optional — nothing else in the file is redundant or decorative.

"And only this code" means a fresh `axint check --format=json` on `broken.axint` returns exactly one diagnostic. Multi-error test files have their place in the benchmark's authoring corpus; they do not belong here. The failures corpus is one-to-one with codes.

## Layout

```
spec/language/examples/failures/
  ax001-empty-file/
    broken.axint
    diagnostic.json
    fixed.axint
    repair.diff
    notes.md
  ax003-missing-title/
    ...
  ax007-clause-out-of-order/
    ...
  ax021-display-unknown-property/
    ...
  ax107-optional-with-default/
    ...
```

Directory names are `<ax-code>-<kebab-case-summary>`. The summary is the phrase a developer would grep for, not the full diagnostic message.

## Representative entries

Six entries written in full, one per fix kind from `diagnostic-protocol.md`. The rest of the 29 author-side codes follow the same shape.

### AX003 — missing title (`insert_required_clause`)

`broken.axint`:

```
intent SendMessage {
  description: "Send a message to a recipient"
  param recipient: string {
    description: "Who to send to"
  }
}
```

`diagnostic.json`:

```json
{
  "schemaVersion": 1,
  "code": "AX003",
  "severity": "error",
  "message": "Intent is missing a title clause",
  "file": "broken.axint",
  "span": { "start": { "line": 2, "column": 3 }, "end": { "line": 2, "column": 3 } },
  "fix": {
    "kind": "insert_required_clause",
    "targetSpan": { "start": { "line": 2, "column": 3 }, "end": { "line": 2, "column": 3 } },
    "suggestedEdit": { "text": "title: \"\"\n  " }
  }
}
```

`fixed.axint` fills in `title: "Send Message"` on the inserted line. `notes.md` notes that the suggested edit is a scaffold (`✱`), not a finished string — the agent supplies the human-readable title.

### AX107 — optional param with non-null default (`remove_field`)

`broken.axint`:

```
intent MarkUrgent {
  title: "Mark Urgent"
  description: "Flag an item as urgent"
  param urgent: boolean? {
    description: "Mark as urgent"
    default: true
  }
}
```

`diagnostic.json`:

```json
{
  "schemaVersion": 1,
  "code": "AX107",
  "severity": "error",
  "message": "Optional param has a non-null default",
  "file": "broken.axint",
  "span": { "start": { "line": 6, "column": 5 }, "end": { "line": 6, "column": 18 } },
  "fix": {
    "kind": "remove_field",
    "targetSpan": { "start": { "line": 6, "column": 5 }, "end": { "line": 6, "column": 18 } },
    "suggestedEdit": { "text": "" }
  }
}
```

`repair.diff` is a one-line deletion. `notes.md` notes that the alternative fix (drop `?` from the type) is *not* the canonical repair — the semantics of optional-with-default are contradictory, and the remove-field path preserves the author's intent that the param is optional.

### AX113 — invalid SF Symbol (`replace_literal`)

`broken.axint`:

```
entity Trail {
  display {
    title: name
    image: "trail-icon"
  }
  property id: string { description: "Identifier" }
  property name: string { description: "Trail name" }
  query: id
}
```

`diagnostic.json`:

```json
{
  "schemaVersion": 1,
  "code": "AX113",
  "severity": "error",
  "message": "Display image is not a valid SF Symbol",
  "file": "broken.axint",
  "span": { "start": { "line": 4, "column": 12 }, "end": { "line": 4, "column": 25 } },
  "fix": {
    "kind": "replace_literal",
    "targetSpan": { "start": { "line": 4, "column": 12 }, "end": { "line": 4, "column": 25 } },
    "suggestedEdit": { "text": "\"figure.hiking\"" },
    "candidates": ["figure.hiking", "figure.walk", "map"]
  }
}
```

The compiler synthesized the top pick from the SF Symbol catalog's fuzzy match. `candidates` carries the runner-ups so the agent can override if the top pick is wrong in context.

### AX005 — unknown type (`change_type`)

`broken.axint`:

```
intent SetTimer {
  title: "Set Timer"
  description: "Start a timer"
  param length: timespan {
    description: "Timer length"
  }
}
```

`diagnostic.json`:

```json
{
  "schemaVersion": 1,
  "code": "AX005",
  "severity": "error",
  "message": "Unknown type 'timespan'",
  "file": "broken.axint",
  "span": { "start": { "line": 4, "column": 17 }, "end": { "line": 4, "column": 25 } },
  "fix": {
    "kind": "change_type",
    "targetSpan": { "start": { "line": 4, "column": 17 }, "end": { "line": 4, "column": 25 } }
  }
}
```

No `suggestedEdit` — the correct type depends on intent (`duration`, `int`, an enum). `notes.md` enumerates the three plausible replacements and explains why each is wrong for this particular intent, ending with `duration` as the right answer.

### AX100 — intent name not PascalCase (`rename_identifier`)

`broken.axint`:

```
intent sendMessage {
  title: "Send Message"
  description: "Send a message"
}
```

`diagnostic.json`:

```json
{
  "schemaVersion": 1,
  "code": "AX100",
  "severity": "error",
  "message": "Intent name must be PascalCase",
  "file": "broken.axint",
  "span": { "start": { "line": 1, "column": 8 }, "end": { "line": 1, "column": 19 } },
  "fix": {
    "kind": "rename_identifier",
    "targetSpan": { "start": { "line": 1, "column": 8 }, "end": { "line": 1, "column": 19 } },
    "suggestedEdit": { "text": "SendMessage" }
  }
}
```

Pure mechanical transform, `suggestedEdit` is complete (`✅`).

### AX021 — display references unknown property (`replace_identifier`)

`broken.axint`:

```
entity Trail {
  display {
    title: label
  }
  property name: string { description: "Trail name" }
  property region: string { description: "Trail region" }
  query: string
}
```

`diagnostic.json`:

```json
{
  "schemaVersion": 1,
  "code": "AX021",
  "severity": "error",
  "message": "Display field names a property that doesn't exist on the entity",
  "file": "broken.axint",
  "span": { "start": { "line": 3, "column": 12 }, "end": { "line": 3, "column": 17 } },
  "fix": {
    "kind": "replace_identifier",
    "targetSpan": { "start": { "line": 3, "column": 12 }, "end": { "line": 3, "column": 17 } },
    "suggestedEdit": { "text": "name" },
    "candidates": ["name", "region"]
  }
}
```

Classic identifier-replacement case. The compiler's top pick is the closest-string-distance declared property; `candidates` carries the full set so an agent whose semantic intent was `region` can override without guessing.

## Coverage

Every author-side code in `diagnostics.md` has a corpus entry. The table below is the canonical coverage map — if a PR adds a new code, it must add a row here and ship the directory in the same commit.

| Code   | Directory                                 | Fix kind                     |
|--------|-------------------------------------------|------------------------------|
| AX001  | `ax001-empty-file/`                       | `insert_required_clause`     |
| AX002  | `ax002-missing-name/`                     | `replace_identifier`         |
| AX003  | `ax003-missing-title/`                    | `insert_required_clause`     |
| AX004  | `ax004-missing-description/`              | `insert_required_clause`     |
| AX005  | `ax005-unknown-type/`                     | `change_type`                |
| AX007  | `ax007-clause-out-of-order/`              | `remove_field` †             |
| AX015  | `ax015-entity-missing-display/`           | `insert_required_clause`     |
| AX016  | `ax016-display-missing-title/`            | `insert_required_clause`     |
| AX017  | `ax017-entity-missing-query/`             | `insert_required_clause`     |
| AX018  | `ax018-unknown-query-kind/`               | `replace_literal`            |
| AX019  | `ax019-entity-no-properties/`             | `insert_required_clause`     |
| AX020  | `ax020-unknown-entity-ref/`               | `replace_identifier`         |
| AX021  | `ax021-display-unknown-property/`         | `replace_identifier`         |
| AX022  | `ax022-unknown-options-provider/`         | `replace_identifier`         |
| AX023  | `ax023-summary-unknown-param/`            | `replace_identifier`         |
| AX100  | `ax100-intent-not-pascal/`                | `rename_identifier`          |
| AX101  | `ax101-empty-title/`                      | `replace_literal`            |
| AX102  | `ax102-empty-description/`                | `replace_literal`            |
| AX103  | `ax103-duplicate-param/`                  | `rename_identifier`          |
| AX104  | `ax104-empty-field-description/`          | `replace_literal`            |
| AX105  | `ax105-param-not-camel/`                  | `rename_identifier`          |
| AX106  | `ax106-default-type-mismatch/`            | `replace_literal`            |
| AX107  | `ax107-optional-with-default/`            | `remove_field`               |
| AX108  | `ax108-intent-no-params/`                 | `insert_required_clause`     |
| AX109  | `ax109-switch-missing-default/`           | `insert_required_clause`     |
| AX110  | `ax110-entity-not-pascal/`                | `rename_identifier`          |
| AX111  | `ax111-property-not-camel/`               | `rename_identifier`          |
| AX112  | `ax112-query-property-no-descriptions/`   | `insert_required_clause`     |
| AX113  | `ax113-invalid-sf-symbol/`                | `replace_literal`            |

Generator bugs (`AX200`–`AX202`) and registry errors (`AX600`) are not in the corpus — they are not author-side failures. They are covered by the compiler's own regression tests.

† AX007 is context-sensitive — see [`diagnostic-protocol.md` §AX007 fix-kind resolution](./diagnostic-protocol.md#ax007-fix-kind-resolution). This corpus entry pins the clause-out-of-order sub-case, which emits `remove_field`. The unknown-field-keyword and malformed-type-syntax sub-cases share the code but emit `rename_identifier` / `remove_field` / `change_type` depending on which one fires. The corpus rule is one entry per code, not per sub-case — the entry above is the representative form of AX007 for CI and benchmark purposes. Adding sub-case entries becomes worthwhile only if implementation proves they drift from each other in practice.

## Maintenance contract

Three rules, enforced by CI:

1. **Every code in `diagnostics.md` has a matching directory.** CI walks `spec/language/examples/failures/` and compares the code prefixes against `diagnostics.md`. Missing or orphaned entries fail the build.

2. **Every `broken.axint` triggers exactly its code.** CI runs `axint check --format=json` on every `broken.axint` and diffs the output against that directory's `diagnostic.json`. Any divergence fails the build. Extra diagnostics, a different code, a different span — all failures.

3. **Every `fixed.axint` is clean.** CI runs `axint check` on every `fixed.axint`. Any diagnostic fails the build. This catches the case where someone "fixes" an entry in a way that introduces a new error.

A fourth soft rule, not CI-enforced but watched: `repair.diff` should be ≤3 lines changed. An entry that needs more is a signal that either the diagnostic is imprecise (it should have fired on a narrower span) or the repair is not canonical.

## How this feeds the benchmark

`benchmark.md` §Repair pulls six tasks (`R1`–`R6`) directly from this corpus. Each benchmark repair task reuses the corresponding `broken.axint` as its starting point and the corresponding `fixed.axint` as the reference target. The benchmark harness only has to add the agent-facing prompt and the repair-loop wiring; the broken input, the expected diagnostic, and the repair are already pinned here.

This means a diagnostic regression — the compiler starts emitting a different span, or a different fix kind, for an existing failure — shows up in both the corpus CI and the benchmark delta on the next run. The two signals are redundant on purpose. The corpus catches changes in the diagnostic protocol's output; the benchmark catches changes in how agents perform against that output.

## What this corpus is not

- **Not a tutorial.** The examples are minimal and surgical. `examples/` has the canonical demonstration files for showing authors what a well-written `.axint` looks like.
- **Not a fuzz corpus.** Every entry is a human-written minimal case. Fuzz coverage is the parser's own property tests, not this directory.
- **Not a multi-error corpus.** By construction, one code per entry. Multi-error files are the benchmark's authoring bucket, not here.
- **Not versioned by model.** The corpus is the compiler's output contract. Agent behavior against the corpus is measured in the benchmark; the corpus itself is model-agnostic.
