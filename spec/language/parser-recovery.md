# Parser Recovery

A `.axint` parser runs once and returns every diagnostic it can find in one pass. A file with three broken declarations produces three diagnostics, not one. This doc specifies how the parser gets there — the fixed set of recovery boundaries it resyncs at, and the contract that recovery never invents meaning the source didn't have.

The motivation is metric #4 in `why-agents.md` — turns to green. If an agent has to rerun the compiler to discover each error serially, the repair loop is O(n) in the number of mistakes. Reporting all errors per parse makes it O(1). The grammar is restricted enough (`principles.md`, criterion #3) that a single-pass recursive-descent parser can resync at a small closed set of points without guessing.

## The contract

1. **One parse, all diagnostics.** The parser never aborts on the first error. It emits a diagnostic, resyncs at the nearest documented boundary, and continues.
2. **Recovery is structural, not semantic.** The parser resyncs at tokens — not at inferred meaning. It does not guess what the author "meant" and continue as if that were the source.
3. **Resynced regions produce no downstream diagnostics.** Once the parser skips bytes to reach a recovery point, it does not emit further syntax errors for the skipped range. The original diagnostic covers it.
4. **Recovery is idempotent.** Running the parser twice on the same file produces the same diagnostic set in the same order.

## Recovery boundaries

The closed set. Four points. The parser resyncs at whichever comes first:

| Boundary                            | Used at                                      |
|-------------------------------------|----------------------------------------------|
| `}` closing the enclosing block     | Inside an `intent`, `entity`, `enum`, `display`, `entitlements`, `infoPlistKeys`, or nested `summary` block |
| Next top-level keyword at column 1  | Between top-level declarations               |
| Next field-starting keyword inside a block | Between fields in an `intent-body`, `entity-body`, `param-body`, `property-body`, `display-block`, or `switch-body` |
| End of line                         | Inside a single-line field like `title: "..."` or `description: "..."` |

Closed set. The parser resyncs at one of these four points and nowhere else. Adding a new recovery boundary is a grammar change and a version bump.

### Top-level keywords

`intent`, `entity`, `enum`. When the parser is recovering at the file level, it scans forward for one of these three tokens appearing at column 1 and resumes parsing from there.

### Field-starting keywords

Inside an `intent-body`: `title`, `description`, `domain`, `category`, `discoverable`, `donateOnPerform`, `param`, `summary`, `returns`, `entitlements`, `infoPlistKeys`.

Inside an `entity-body`: `display`, `property`, `query`.

Inside a `param-body` or `property-body`: `description`, `default`, `options`.

Inside a `display-block`: `title`, `subtitle`, `image`.

Inside a `switch-body`: `case`, `default`.

The parser only accepts these as recovery points when they appear in a position the grammar expects them — a stray `title` keyword inside a `switch-body` is not a valid recovery point for an `intent-body`. This is enforced by context: the parser tracks which block it is recovering inside and matches only against that block's field set.

### End of line

Only used for single-line fields (`title: "..."`, `description: "..."`, `domain: "..."`, etc.). If the right-hand side of `:` is malformed, the parser emits a diagnostic spanning the malformed region and resumes at the next newline. Multi-line constructs (blocks, `summary switch`, nested blocks) never use end-of-line recovery — they use `}` or the next field keyword.

## What gets skipped

Between the point of the error and the recovery boundary, the parser discards tokens without further parsing. No AST nodes are constructed for the skipped region. No diagnostics are emitted from inside it. If the skipped region contained a structurally valid nested block that the parser would otherwise have descended into, that block is still skipped — recovery does not second-guess its own boundary.

This means a malformed top-level declaration can hide a valid declaration nested inside it. That is acceptable. The agent fixes the outer error, reruns, and sees the inner error on the next pass. The alternative — reparsing the skipped region hoping for salvage — reintroduces the O(n) repair loop this whole contract exists to prevent.

## Worked examples

### Example 1: two broken intents

```
intent SendMessage {
  titel: "Send Message"                # AX007: unknown field "titel"
  description: "Send a message"
  param recipient: string {
    description: "Who to send to"
  }
}

intent OpenTrail {
  title: "Open Trail"
  # missing description — AX003
  param trail: Trail {
    description: "Trail to open"
  }
}
```

One parse. Two diagnostics. `AX007` at `SendMessage`, span on `titel`. `AX003` at `OpenTrail`, zero-width span after `title:`. Recovery #1 at the next field-starting keyword (`description`). Recovery #2 at the `}` closing `OpenTrail`.

### Example 2: malformed field recovers at end of line

```
intent Foo {
  title: @@@broken@@@                  # AX101: invalid string literal
  description: "A valid description"
}
```

One diagnostic. `AX101`, span on `@@@broken@@@`. Recovery at end of line. The next line (`description: "..."`) parses normally. No cascade errors.

### Example 3: unclosed block falls through to top-level keyword

```
intent Foo {
  title: "Foo"
  description: "Missing close brace"

intent Bar {
  title: "Bar"
  description: "Next intent"
}
```

One diagnostic at the point `intent Bar` is encountered: `AX001` "unexpected `intent` inside intent-body, expected `}`", with a fix of `insert_required_clause` inserting `}` before the `intent` token. Recovery at the top-level keyword `intent`. `Bar` parses cleanly.

The diagnostic's `targetSpan` is the zero-width insertion point before `intent Bar`. The `suggestedEdit.text` is `"}\n"`. Applying the edit resolves the diagnostic in one edit.

### Example 4: `summary switch` with a malformed case

```
intent Foo {
  title: "Foo"
  description: "..."
  param mode: string { description: "..." }
  summary switch mode {
    case: "missing case value"           # AX007: case requires a literal
    case "b": "valid"
    default: "fallback"
  }
}
```

One diagnostic. Recovery at the next `case` keyword. The `case "b"` branch and `default` branch both parse. The file is invalid for one reason, not three.

## What recovery is not

The parser does not:

- **Correct typos.** `titel` is an unknown field, not a misspelled `title`. The validator's `rename_identifier` fix kind can offer `title` as a candidate — that is an author-side suggestion, not a parser-side interpretation.
- **Insert missing braces silently.** A missing `}` is always a diagnostic. Recovery uses the next top-level keyword to bound the damage, but the author still has to add the brace.
- **Reorder fields.** If `description` appears before `title`, that is `AX007` clause-out-of-order. The parser doesn't swap them.
- **Guess intent from adjacent tokens.** If the parser can't decide whether a block is inside an `intent-body` or an `entity-body`, it doesn't guess — it resyncs at the nearest enclosing `}` and reports the structural error.

## Interaction with the diagnostic protocol

Every error the parser emits has a `code`, a `severity`, a `span`, and a `fix` per `diagnostic-protocol.md`. Recovery does not degrade the diagnostic — a syntax error at line 5 still carries the same protocol payload as a semantic error at line 20. The protocol is uniform across parse-time and validate-time.

The protocol's first-file, first-line, first-column priority order is what the parser emits in. The order is natural — the parser walks the file top-to-bottom and emits as it goes. Agents consuming the JSON output process diagnostics in the order they appear.

## Worst-case behavior

A file consisting entirely of garbage (no valid top-level keyword anywhere) emits exactly one diagnostic: `AX001` "expected `intent`, `entity`, or `enum`" with a span covering the first token. No recovery point is reachable, so parsing terminates after that one diagnostic. This is the only case where the parser returns without reaching end-of-file.

A file with a valid first declaration followed by garbage recovers at the next top-level keyword. If there is no next top-level keyword, parsing terminates after the valid declaration and the trailing garbage emits one `AX001`.

## Why this recovery strategy and not panic mode or incremental

Panic mode (skip-until-synchronizing-token) is what this is, restricted to a closed four-point set. The restriction matters — generic panic mode is non-deterministic under grammar evolution, because adding a new keyword silently changes recovery behavior. The closed set makes recovery versioned: a grammar change that adds a new field-starting keyword has to declare whether that keyword is a recovery point, and the test suite catches regressions.

Incremental parsing (reparse only dirty ranges) is overkill for single-file `.axint` sizes. The files the corpus targets are tens of lines, not tens of thousands. A full reparse per `axint check` is fast enough that incrementality adds complexity for no measured win on the seven metrics.
