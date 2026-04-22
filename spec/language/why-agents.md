# Why Axint for Agents

The thesis in one line:

> For AI agents generating Apple-native software, the best authoring surface is not the most expressive one. It is the one with the smallest valid search space that still captures the intent.

Swift is more expressive than Axint. That is not a point in Swift's favor when the author is an agent. Expressiveness means more valid programs, more distinct ways to say the same thing, more grammar paths a model can wander down incorrectly, and more invalid programs that look almost valid. The dial that matters is not "how much can the author say." It is "how close is the author's output, on the first try, to a working Apple feature."

## What "better for agents" means

It means seven measurable things, not one vague one.

1. **First-pass parse rate.** Percent of generated files that parse without error on the first try.
2. **First-pass validator pass rate.** Percent of parsed files that clear all AX semantic checks on the first try.
3. **First-pass Swift compile rate.** Percent of validated files whose emitted Swift compiles against the Apple SDKs on the first try.
4. **Turns to green.** Number of agent turns required to go from first-broken to valid-compiling.
5. **Lines changed per repair.** Size of the diff an agent makes to fix a diagnostic. A well-designed diagnostic produces a one-line fix, not a file rewrite.
6. **Tokens per successful feature.** Generated-token cost per valid Apple feature shipped.
7. **Output variance.** Structural similarity across repeated runs of the same prompt. Ten agents given the same task should produce close-to-identical files.

Every design choice downstream of this doc is evaluated against those seven. The grammar is strict so variance stays low. The formatter is canonical so repair diffs stay small. The diagnostics catalog is keyed to one-line fixes so turns-to-green stays low. The IR lowers identically from TS, Python, and `.axint` so a model trained on one surface transfers to the others. Nothing in the language exists to feel elegant to humans. Everything exists to push those seven numbers.

## Why constrained surfaces beat expressive surfaces for agents

An expressive language gives a model a larger valid search space. A larger valid search space means more plausible-looking outputs per prompt, more stylistic variance, more ambiguity about which form is idiomatic, and more room for a small mistake to drift into a catastrophically wrong program.

A constrained language narrows that space at the cost of expressiveness the author does not need for this domain. App Intents are declarative by shape. They are metadata plus a small perform body. Swift's generics, protocol extensions, property wrappers, and macros are expressive superpowers that an agent generating an App Intent does not need and will use incorrectly. Taking those tools out of the author's hand is not a restriction. It is pruning.

The same logic is why the perform body lives in a sibling TS or Python file rather than inside `.axint`. The declarative shape is the part agents are reliably good at. The logic body is the part they are less reliably good at, and it belongs in a surface where the rest of the language, the tests, and the ecosystem already exist.

## How the criteria and the metrics relate

The seven agent-first criteria in `principles.md` are the design side of the same story the seven metrics above measure. Each criterion is written to move one or more metrics in the right direction:

| Criterion (`principles.md`) | Metric it targets |
|-----------------------------|-------------------|
| Predictable                 | Output variance   |
| Low-entropy                 | Output variance, first-pass parse rate |
| Easy to parse               | First-pass parse rate |
| Easy to correct             | Turns to green, lines per repair |
| Easy to teach in one prompt | First-pass validator pass rate, tokens per feature |
| Easy to diff                | Lines per repair  |
| Easy to format              | Output variance   |

If a proposed spec change improves a criterion but regresses a metric, the change does not ship.

## The claim Axint makes

Against raw Swift, against the TypeScript SDK, and against the Python SDK, an agent authoring in `.axint` for the same Apple-native task will:

- parse correctly more often on the first try,
- validate correctly more often on the first try,
- compile to working Swift more often on the first try,
- need fewer turns and fewer lines to repair a broken file,
- emit fewer generated tokens per valid feature,
- and produce lower-variance output across repeated runs of the same prompt.

The benchmark harness that proves this runs on every release. A change to the spec, the grammar, the validator, or the generator that moves any of the seven metrics the wrong way is rolled back. The harness feeds off the paired corpus in `examples/` — prompt, `.axint`, IR snapshot, emitted Swift, broken variant, repaired variant — and runs the same task matrix across all three authoring surfaces plus raw Swift as the baseline.

## The claims Axint does not make

Axint is not a better language for humans than Swift. It is not a replacement for Swift. It is not more expressive. It is not general-purpose. It is not a DSL for writing application logic — the perform body lives in a sibling TS or Python file, which is the third surface's job. The language does not try to remove Swift from anyone's toolchain. It gives an agent a path to validated Swift output that does not require fluency in the full Swift and Apple-platform surface area.

If the benchmark numbers ever say raw Swift beats `.axint` for agents on the seven metrics above, the language is wrong and gets fixed. The claim is empirical, not aesthetic.

## Why this frames every other doc in the spec

Every file in this directory is downstream of the thesis above.

- `principles.md` — the seven criteria are the design-side counterparts of the seven metrics.
- `grammar.md` — fixed clause order, no escape hatches, braces-not-indentation, one canonical punctuation rule. Every choice exists to reduce one form of variance.
- `keywords.md` — the reserved set is minimal. Unfamiliar keywords are a tax an agent pays on every generation.
- `ir-mapping.md` — every production lowers to an existing IR node. No new IR means no new invalid states and no new surface to validate.
- `diagnostics.md` — every error is designed to be fixable by one line. That is metric (5).
- `non-goals.md` — everything Axint refuses to express exists to keep the search space small.
- `examples/` — the paired corpus is the benchmark harness feedstock.

## One rule above everything else

> The language is not the product. The language is the capture mechanism.

An agent hands us a single file. We hand back a working Apple feature, reliably, cheaply, and with a repair loop that closes fast when something goes wrong. That is the product. Every decision in the rest of this spec is evaluated against it.
