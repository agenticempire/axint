# Benchmark Matrix

The claim in `why-agents.md` is empirical: authoring in `.axint` moves seven measurable metrics the right way compared to raw Swift, the TS SDK, and the Python SDK. This doc specifies the benchmark that proves or disproves that claim on every release. A spec or grammar change that moves any metric the wrong way rolls back.

The benchmark is deliberately small. Twenty tasks, not two hundred. A small matrix that runs on every PR is more useful than a large matrix that runs once a quarter. The tasks are chosen to cover the grammar's decision points, not to stress-test throughput.

## The four surfaces under test

| Surface     | What the agent emits                                   |
|-------------|--------------------------------------------------------|
| `.axint`    | A `.axint` source file                                 |
| TS SDK      | A `.ts` file using `defineIntent` / `defineEntity`     |
| Python SDK  | A `.py` file using the `axint` package                 |
| Raw Swift   | A `.swift` file targeting the Apple `AppIntents` framework directly |

All four flow through the same downstream pipeline: the first three lower to IR and emit Swift via the compiler; raw Swift is measured directly. The comparison is at the agent-authored artifact level: what did the model produce on turn 1, and how far was it from a Swift binary that compiles against the Apple SDK.

## The seven metrics

Named the same way as `why-agents.md` so the two docs read together. Every task contributes one data point per metric per surface.

| # | Metric                          | Definition                                                                 | Unit      |
|---|---------------------------------|----------------------------------------------------------------------------|-----------|
| 1 | First-pass parse rate           | Share of turn-1 outputs that parse without syntax error                    | %         |
| 2 | First-pass validator pass rate  | Share of parsed turn-1 outputs that clear every semantic check (AX001–AX113) | %        |
| 3 | First-pass Swift compile rate   | Share of validated turn-1 outputs whose emitted Swift compiles against the Apple SDK | %   |
| 4 | Turns to green                  | Mean agent turns from first broken output to valid-compiling, capped at 5  | turns     |
| 5 | Lines changed per repair        | Mean unified-diff lines between consecutive repair turns                    | lines     |
| 6 | Tokens per successful feature   | Mean generated tokens to reach a valid compiling feature (sum across turns) | tokens    |
| 7 | Output variance                 | Mean pairwise tree-edit distance over the normalized IR across runs         | unitless  |

Metric 7 is measured on IR, not source, so a purely stylistic difference (whitespace, field order that the formatter normalizes) contributes zero. Two agents producing textually different files that lower to byte-identical IR score perfectly on variance.

## Harness shape

For each `(task, surface)` pair, the harness runs `N = 10` independent generations per model, across `M = 3` models (Sonnet-class, Opus-class, one open-weight peer pinned at release time). Models and temperatures are pinned in `benchmark.config.json`; the pin changes in a version-bump PR, not silently.

One generation is:

1. **Prompt.** Fixed prompt per task. Prompts are identical across surfaces except for the surface-specific preamble — which names the surface, gives one 10-line example, and links the spec. No few-shot beyond the preamble.
2. **Turn 1 output.** Recorded. Metrics 1, 2, 3 are computed here.
3. **Repair loop.** If turn 1 failed, the harness feeds the compiler diagnostics back to the agent and records turn 2, then turn 3, up to turn 5. Metrics 4, 5 are computed over this loop.
4. **Tokens.** Every turn's generated-token count is summed into metric 6.
5. **Variance.** After all `N × M` runs for a task complete, metric 7 is the mean pairwise tree-edit distance across the successful IRs.

The loop caps at 5 turns because in practice agents either converge in ≤3 or diverge. A cap keeps one bad run from dominating the mean.

## Repair-loop contract

The repair loop uses the machine-readable diagnostic protocol in `diagnostic-protocol.md`. The harness feeds the agent exactly what an automated caller would receive: the JSON diagnostic record, with `code`, `message`, `span`, `fix.kind`, and `fix.suggestedEdit.text` where present. No additional human-written hints. If `.axint` wins metric 4 (turns to green), it wins it on the merit of the protocol, not on richer prompting.

Raw Swift has no diagnostic protocol. The harness feeds the agent the first `swiftc` error verbatim, one error per turn. This is the realistic counterfactual — `swiftc` does not emit structured repair suggestions.

## The 20 tasks

Three buckets — authoring, repair, transformation. Every task has a fixed prompt, a fixed success criterion, and a reference IR so the harness can score structural correctness beyond "it compiled."

### Authoring (10 tasks)

New file from scratch.

| # | Task                                                                                                           | Grammar surface exercised               |
|---|----------------------------------------------------------------------------------------------------------------|------------------------------------------|
| A1 | Send a message to a recipient. One string param.                                                              | Minimum viable intent                    |
| A2 | Set brightness to a percentage. Int param with a default of 100.                                              | Default values                           |
| A3 | Toggle a boolean setting. Single optional boolean param.                                                      | Optional primitives                      |
| A4 | Start a workout with a chosen activity from a fixed list (Run, Bike, Swim).                                   | Enum param                               |
| A5 | Open a trail. Param is a `Trail` entity with five properties and `query: property`.                           | Entity declaration + entity param        |
| A6 | Schedule a calendar event. Title, start date, optional duration. Requires calendar entitlement + `NSCalendarsUsageDescription`. | entitlements + infoPlistKeys |
| A7 | Plan activity on a trail near a region. Summary with `when` on the optional region param.                     | `summary when`                           |
| A8 | Plan activity on a trail with nested `switch` on `includeNearby` and inner `when` on `region`.                 | Nested `summary switch`/`when`           |
| A9 | Find tracks matching a search. String param with `options: dynamic TrackSearchOptions`.                       | Dynamic options provider                 |
| A10 | Return a list of recent trails. `returns: [Trail]`.                                                           | Entity array return type                 |

### Repair (6 tasks)

Start from a deliberately broken file, reach green.

| # | Task                                                                                       | Diagnostic exercised  | Corpus entry                              |
|---|--------------------------------------------------------------------------------------------|-----------------------|-------------------------------------------|
| R1 | `description` is missing from an otherwise valid intent.                                  | AX004                 | `ax004-missing-description/`              |
| R2 | An `intent-body` has `description` before `title`.                                        | AX007                 | `ax007-clause-out-of-order/`              |
| R3 | A `param` name is `Recipient` (PascalCase) instead of `recipient` (camelCase).            | AX105                 | `ax105-param-not-camel/`                  |
| R4 | An `entity` `display { title: propName }` references a property that doesn't exist.       | AX021                 | `ax021-display-unknown-property/`         |
| R5 | An `entity` has `display { image: "trail-icon" }` with an SF Symbol that isn't in the catalog. | AX113             | `ax113-invalid-sf-symbol/`                |
| R6 | An `entity` is missing its `query` clause entirely.                                        | AX017                 | `ax017-entity-missing-query/`             |

Every row pulls its starting `broken.axint` from the corpus entry in the rightmost column — the benchmark does not define its own broken fixtures. This keeps repair-task diagnostics and corpus diagnostics byte-for-byte in sync.

### Transformation (4 tasks)

Start from a valid file, apply a change.

| # | Task                                                                                                          | Edit surface                |
|---|---------------------------------------------------------------------------------------------------------------|-----------------------------|
| T1 | Rename a param from `activity` to `sport`. Summary template references must update.                          | Cross-clause identifier     |
| T2 | Add a new required `priority: Priority` enum param to an existing intent that already has a `summary switch`. | Summary + param coupling    |
| T3 | Add HealthKit entitlement and `NSHealthShareUsageDescription` to an existing intent that has neither block.  | Block insertion             |
| T4 | Change a `region` param from `string` to an enum of `{ north south east west }`.                              | Type change                 |

### Why this split

The authoring bucket exercises every non-trivial grammar production. The repair bucket exercises the diagnostic protocol and the fix-kind taxonomy end-to-end. The transformation bucket exercises something no other benchmark tests: whether a constrained language is as easy to *edit* as it is to *write*. Metrics 5 and 7 live or die on transformation tasks.

## Reference IR and scoring

Every task ships with a reference IR in `examples/benchmark/<task-id>/reference.ir.json`. Scoring:

- **Structural correctness:** tree-edit distance from the agent's IR to the reference IR, normalized by reference IR size. Zero means structurally identical. This is scored alongside metric 3 — a file that compiles but lowers to a structurally wrong IR does not count as a success for authoring tasks.
- **Repair tasks:** the reference IR is the *fixed* form. The broken source ships in `broken.<surface>`. Success is the agent reaching an IR that equals the reference IR within tree-edit distance tolerance.
- **Transformation tasks:** two reference IRs — `before.ir.json` and `after.ir.json`. The agent is given the before state and a plain-English instruction; success is reaching `after.ir.json`.

## Regression budgets

Every release runs the benchmark and publishes the seven metric deltas against the last release. Budgets:

| Metric                      | Regression budget per release           |
|-----------------------------|-----------------------------------------|
| First-pass parse rate       | No regression                           |
| First-pass validator pass   | −2 percentage points maximum             |
| First-pass Swift compile    | −2 percentage points maximum             |
| Turns to green              | +0.3 turns maximum                       |
| Lines changed per repair    | +1 line maximum                          |
| Tokens per feature          | +10% maximum                             |
| Output variance             | +5% maximum                              |

A PR that breaches any budget on `.axint` rolls back. A PR that breaches any budget on TS or Python (shared compiler pipeline) gets escalated to the same review. Raw Swift numbers are recorded but not budgeted — Apple owns that surface, we don't.

## What the benchmark does not measure

- **Human ergonomics.** If Axint is worse for humans than Swift, that's fine — `why-agents.md` is explicit about the target. A human-ergonomics benchmark would need a different harness.
- **Runtime performance of emitted Swift.** The generator is the same across all three SDK surfaces, so there's no differential signal. If there's a regression in the generated Swift, it's caught by the Swift compile rate, not by a performance bench.
- **Cross-surface mixing.** A project that writes some intents in `.axint` and others in TS is a real-world case, but it doesn't belong in the per-surface bench. A separate integration suite covers it.
- **Long-context authoring.** Every benchmark file is one intent or one small cluster. Multi-file, multi-feature authoring isn't a v1 concern.

## Source-of-truth layout

```
spec/language/
  benchmark.md              # this file
  examples/benchmark/
    a1-send-message/
      prompt.txt
      reference.ir.json
      reference.axint
      reference.ts
      reference.py
      reference.swift
    a2-set-brightness/
      ...
    r1-missing-description/
      prompt.txt
      broken.axint
      broken.ts
      broken.py
      broken.swift
      reference.ir.json
    t1-rename-param/
      prompt.txt
      before.axint
      before.ts
      before.py
      before.swift
      after.ir.json
    ...
```

Every task has reference artifacts for all four surfaces. The reference is what a principal engineer would write — it anchors the scoring and doubles as the corpus for `examples/`.

## Cadence

The benchmark runs on every PR that touches `spec/`, `compiler/`, or `runtime/`. A scheduled nightly run against pinned-tip model versions catches model drift. Results land in `benchmark/results/<date>.json`, and the README badge on the compiler repo links the latest.

A release is blocked until the benchmark passes the regression budgets. There is no "we'll fix it in the next one."
