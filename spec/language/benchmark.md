# Proposed Four-Surface Benchmark Protocol

> **Status: Proposed protocol.** This benchmark is not implemented, does not run
> in CI, has no pinned model configuration or generated results, does not publish
> a badge, and does not block releases. The CI-gated benchmark that exists today
> is the [brownfield precision benchmark](../../benchmarks/brownfield/README.md).

This document preserves a methodology for testing whether `.axint` reduces
agent authoring and repair cost compared with the TypeScript SDK, Python SDK,
and raw Swift. Its claims are hypotheses until the full harness and corpus are
implemented and results are published.

## Surfaces to compare

| Surface | Agent-authored artifact |
| --- | --- |
| `.axint` | A `.axint` source file |
| TypeScript SDK | A `.ts` file using `defineIntent` or `defineEntity` |
| Python SDK | A `.py` file using the `axint` package |
| Raw Swift | A `.swift` file using `AppIntents` directly |

The first three surfaces would lower to compatible IR and emit Swift. Raw Swift
would be measured directly. Every surface would use the same task intent,
success criteria, selected Apple SDK, and model settings.

## Proposed metrics

| # | Metric | Definition | Unit |
| --- | --- | --- | --- |
| 1 | First-pass parse rate | Share of first outputs that parse without syntax error | percent |
| 2 | First-pass validator pass rate | Share of parsed first outputs that clear semantic checks | percent |
| 3 | First-pass Swift compile rate | Share of validated first outputs whose Swift compiles against the selected SDK | percent |
| 4 | Turns to green | Mean repair turns from first failure to valid, compiling output, capped at five | turns |
| 5 | Lines changed per repair | Mean unified-diff lines between repair turns | lines |
| 6 | Tokens per successful feature | Mean generated tokens needed to reach a successful result | tokens |
| 7 | Output variance | Mean pairwise tree distance over normalized IR for successful runs | unitless |

Output variance should be measured on normalized IR so whitespace and
canonically reordered fields do not count as semantic differences.

## Required harness before results can be claimed

An implementation should include all of the following:

- a checked-in benchmark configuration
- complete prompts and reference artifacts for every task and surface
- explicit model identifiers, versions, temperatures, and run counts
- captured raw outputs and token usage
- a reproducible Apple SDK and Xcode environment
- scoring code with tests
- generated machine-readable and human-readable results
- variance and confidence intervals across repeated runs
- cost controls and a documented policy for model drift

The initial design proposes 10 independent generations per task and three pinned
model classes. Those values should be revisited after a pilot measures variance
and cost; they are not current repository facts.

## Proposed generation and repair loop

For each task and surface, a future harness would:

1. Present the same task with a surface-specific preamble and one compact example.
2. Record the first generated artifact and compute parse, validation, compile, token, and structural scores.
3. On failure, return only the structured Axint diagnostic or first relevant `swiftc` error.
4. Record up to five repair turns.
5. Compare successful normalized IR with the task reference.
6. Aggregate per-task, per-surface, and per-model results with uncertainty.

The repair loop should not provide richer human hints to one surface. That would
measure prompting differences instead of authoring-surface differences.

## Proposed task matrix

The matrix contains authoring, repair, and transformation work so the benchmark
tests both creation and editing.

### Authoring tasks

| ID | Task | Grammar area |
| --- | --- | --- |
| A1 | Send a message to a recipient with one string parameter. | Minimum intent |
| A2 | Set brightness to a percentage with a default value. | Defaults |
| A3 | Toggle a setting with an optional Boolean parameter. | Optional primitives |
| A4 | Start a workout chosen from a closed activity list. | Enum parameter |
| A5 | Open a trail represented by an entity with five properties. | Entity declaration and query |
| A6 | Schedule a calendar event with entitlement and usage-description metadata. | Entitlements and plist keys |
| A7 | Plan activity with a conditional optional-region summary. | Summary `when` |
| A8 | Plan activity with nested Boolean and region summary conditions. | Summary `switch` and `when` |
| A9 | Find tracks with a dynamic options provider. | Dynamic options |
| A10 | Return a list of recent trail entities. | Entity-array return |

### Repair tasks

| ID | Starting defect | Intended diagnostic |
| --- | --- | --- |
| R1 | Missing intent description | AX004 |
| R2 | Description appears before title | AX007 |
| R3 | Parameter name uses PascalCase | AX105 |
| R4 | Entity display references an unknown property | AX021 |
| R5 | Display image uses an invalid symbol | AX113 |
| R6 | Entity is missing its query clause | AX017 |

The future corpus should reuse canonical broken examples rather than maintain a
second set of fixtures with subtly different failures.

### Transformation tasks

| ID | Edit |
| --- | --- |
| T1 | Rename a parameter and update every summary reference. |
| T2 | Add a required enum parameter to an intent with an existing summary switch. |
| T3 | Add a HealthKit entitlement and usage-description key. |
| T4 | Replace a string region with a closed region enum. |

## Reference artifacts and scoring

Each implemented task should eventually include:

```text
spec/language/examples/benchmark/<task-id>/
  prompt.txt
  reference.ir.json
  reference.axint
  reference.ts
  reference.py
  reference.swift
  broken.* or before.* and after.* when applicable
```

Structural correctness should compare normalized output IR with a reviewed
reference IR. Compilation alone is not enough because structurally wrong code
can still compile. Repair tasks should compare against the fixed reference;
transformation tasks should compare before and after states.

No directory matching this complete layout exists today. The current
`spec/language/examples/` corpus primarily supports parser, lowering, printer,
round-trip, and diagnostic tests.

## Candidate regression budgets

Budgets should be activated only after repeated baseline runs establish normal
variance. Candidate limits for discussion are:

| Metric | Candidate budget |
| --- | --- |
| First-pass parse rate | no measured regression |
| First-pass validator pass rate | at most 2 percentage points lower |
| First-pass Swift compile rate | at most 2 percentage points lower |
| Turns to green | at most 0.3 turns higher |
| Lines changed per repair | at most 1 line higher |
| Tokens per successful feature | at most 10 percent higher |
| Output variance | at most 5 percent higher |

These numbers are design inputs, not active repository gates.

## What this protocol would not measure

- human ergonomics
- runtime performance of emitted Swift
- mixed-surface projects
- long-context, multi-feature authoring
- Xcode project repair precision

The last item is deliberately separate. Axint's implemented brownfield
benchmark evaluates finding precision, recall, and clean-project abstention for
existing Swift validation. It is reproducible and runs in CI through
`npm run benchmark:brownfield:check`.

## Implementation milestones

1. Check in a pilot task with all four surface references and scoring tests.
2. Add a model-provider-neutral result schema and redaction rules.
3. Run a small non-gating pilot to measure variance, cost, and failure modes.
4. Complete and review the task corpus.
5. Pin model and Xcode environments and publish raw result provenance.
6. Decide, through a separate reviewed change, whether any stable metric should gate releases.

Until those milestones are complete, public docs should describe this file as a
proposed benchmark protocol and should cite the brownfield benchmark for current
reproducible evidence.
