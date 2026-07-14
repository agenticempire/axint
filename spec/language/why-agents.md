# Why a Constrained Surface May Help Agents

The design hypothesis is simple:

> For agents generating declarative Apple capabilities, the best authoring
> surface may be the smallest valid search space that still captures the intent.

This is a hypothesis, not a published performance result. The parser,
formatter, lowering, and corpus are implemented; the model-based comparative
benchmark described in [`benchmark.md`](./benchmark.md) is not.

## What should be measured

The hypothesis is useful only if it can be tested across the same tasks and
models. The proposed protocol tracks seven outcomes:

1. **First-pass parse rate:** share of generated files that parse on the first attempt.
2. **First-pass validator pass rate:** share of parsed files that clear semantic checks on the first attempt.
3. **First-pass Swift compile rate:** share whose emitted Swift compiles against the selected Apple SDK.
4. **Turns to green:** agent turns required to reach valid, compiling output.
5. **Lines changed per repair:** diff size between failed and repaired attempts.
6. **Tokens per successful feature:** generated-token cost to reach a successful result.
7. **Output variance:** structural difference across repeated runs of the same task.

Until the harness, model pins, task corpus, and results exist, these are design
criteria rather than proof that `.axint` outperforms TypeScript, Python, or raw
Swift.

## Why constrain the grammar

App Intent declarations are largely structured metadata. A constrained grammar
can reduce field-order ambiguity, stylistic variation, and the number of nearly
valid forms an agent can emit. Canonical formatting can also keep repair diffs
small and make diagnostics easier to apply mechanically.

That tradeoff is intentional: `.axint` does not attempt to express arbitrary
application logic. Logic belongs in established language surfaces where normal
tests, libraries, and review tools already exist.

## Design criteria

The principles in [`principles.md`](./principles.md) map to the proposed metrics:

| Criterion | Intended measurement |
| --- | --- |
| Predictable | Output variance |
| Low entropy | Output variance and first-pass parse rate |
| Easy to parse | First-pass parse rate |
| Easy to correct | Turns to green and lines per repair |
| Easy to teach in one prompt | Validator pass rate and tokens per feature |
| Easy to diff | Lines per repair |
| Easy to format | Output variance |

These mappings guide grammar review today. They should become regression budgets
only after the proposed benchmark is implemented and baseline variance is
understood.

## Claims this specification does not make

- `.axint` is not better for human authors than Swift.
- It is not a replacement for Swift, TypeScript, or Python.
- It is not more expressive or general-purpose.
- It does not remove Xcode, Apple SDK, build, test, or runtime proof.
- It has not yet been shown empirically to outperform the other authoring surfaces.

The honest current claim is narrower: Axint has implemented a compact parser,
formatter, lowering layer, and test corpus designed to make declarative input
more predictable. The proposed benchmark defines how to test whether that
design actually improves agent outcomes.

## One rule above everything else

> The language is not the product. The language is the capture mechanism.

Any future expansion must preserve that boundary and earn its complexity with
measured evidence.
