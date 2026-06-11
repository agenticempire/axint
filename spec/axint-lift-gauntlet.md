# Axint Lift Gauntlet

This benchmark answers one question:

> If the same agent tries to build or repair Apple-native software with Axint and without Axint, how much better does the Axint run get?

The goal is not to prove Axint has many tools. The goal is to prove Axint creates measurable lift: fewer failed claims, faster repair, better Apple-native correctness, stronger proof, and less human intervention.

## Test Design

Each task runs in two lanes:

| Lane | Agent gets | Agent cannot use |
| --- | --- | --- |
| Control | Normal coding environment, repo, Xcode/build tools, public Apple docs | Axint CLI, Axint MCP, Fix Packets, Axint docs, Axint Registry |
| Axint | Same environment plus Axint install/setup prompt, CLI/MCP, workflow checks, compile/validate/repair/run, Registry when relevant | Hidden human hints, manual patching outside the agent transcript |

Both lanes use the same model, same starting repo, same task prompt, same timeout, same hardware, and same Xcode version. The order is counterbalanced so Axint does not always run second.

## The Tasks

Use six tasks that represent real user value, not toy demos.

| ID | Task | Success Criteria |
| --- | --- | --- |
| A1 | Add a calendar App Intent to a simple SwiftUI notes app | Intent appears in Shortcuts, Xcode build passes, generated plist/entitlement/privacy copy is correct |
| A2 | Add an App Entity-backed search intent | App Entity, query, display representation, parameter summary, and generated Swift all build |
| A3 | Add a SwiftUI widget from existing app data | Widget extension builds, timeline provider compiles, preview/sample data exists |
| R1 | Repair a broken App Intent project | Agent identifies exact Apple-specific failure, patches it, and reruns proof |
| R2 | Repair a failing UI test caused by a masked or non-hittable control | Agent uses build/test/runtime evidence instead of guessing |
| P1 | Prepare an existing app for TestFlight-style proof | Build passes, required metadata/privacy/plist issues are classified, report is exportable |

Stretch task for the public demo:

| ID | Task | Success Criteria |
| --- | --- | --- |
| W1 | From a GitHub repo, generate a browser-shareable proof room and walkthrough | Build proof, app map, screenshots/video, logs, and Fix Packet are attached to one shareable report |

## Metrics

Every run records these metrics.

| Metric | Definition | Why it matters |
| --- | --- | --- |
| First-pass build rate | Task builds before any repair turn | Shows generation quality |
| Final green rate | Task reaches all success criteria before timeout | Shows practical usefulness |
| Time to green | Minutes from first agent action to final proof | Shows speed |
| Turns to green | Agent repair turns after first failure | Shows repair quality |
| Human interventions | Times a human had to explain what to do next | Shows autonomy |
| Apple-specific defects | Count of unresolved App Intents, plist, entitlement, SwiftUI, WidgetKit, Xcode, signing, or test issues | Shows Apple-native competence |
| False ship claims | Times the agent said it was done while build/test/runtime proof failed | Shows trustworthiness |
| Proof completeness | 0-5 score for source, generated Swift, static validation, Xcode/build, runtime/test, and artifact evidence | Shows audit-grade rigor |
| Token cost | Approximate prompt/output tokens across the run | Shows workflow efficiency |
| Repair precision | Number of changed files and diff lines needed to fix failures | Shows whether Axint focuses the agent |

## Scoring

Each task gets a 100-point score.

| Category | Points |
| --- | ---: |
| Build/test/runtime proof passes | 30 |
| Apple-native implementation correctness | 25 |
| Repair quality and diagnosis | 20 |
| Autonomy and low human intervention | 15 |
| Proof/report quality | 10 |

Automatic penalties:

| Failure | Penalty |
| --- | ---: |
| False ship claim | -25 |
| No Xcode/build/runtime proof when required | -20 |
| Manual human patch | -20 |
| Generated code compiles but behavior is wrong | -15 |
| Missing privacy/plist/entitlement requirement | -10 |
| Timeout | score capped at 40 |

## "Amazing" Bar

Axint is considered internally amazing only if it clears all of these:

| Benchmark | Required Axint Lift |
| --- | --- |
| Final green rate | At least 80% Axint, and at least 2x the control lane |
| Time to green | At least 30% faster than control |
| Turns to green | At least 40% fewer repair turns |
| Human interventions | At least 50% fewer interventions |
| False ship claims | Zero in Axint lane |
| Proof completeness | Average 4.5/5 or better |
| Apple-specific defects | At least 50% fewer unresolved defects |

If Axint passes CI but fails this gauntlet, the release is technically healthy but not product-amazing.

## Run Protocol

1. Create two clean worktrees per task: `control/<task-id>` and `axint/<task-id>`.
2. Reset both to the same fixture commit.
3. Start fresh agent contexts. Do not reuse memory between lanes.
4. Give the control lane only the task prompt and repo.
5. Give the Axint lane the same task prompt plus the standard Axint startup prompt.
6. Capture every command, patch, error, build log, test log, and final report.
7. Stop each run at 45 minutes or when success criteria are met.
8. Score the run using the rubric above.
9. Export `results.json`, `summary.md`, and a visual comparison chart.

## Public Claim Format

Only publish claims in this shape:

```text
In a 6-task internal Apple-native benchmark, Axint improved final green rate from X% to Y%, reduced repair turns by Z%, eliminated false ship claims, and raised proof completeness from A/5 to B/5.
```

Do not publish raw download vanity numbers as proof of product quality. The lift gauntlet proves product quality.

## Minimum Artifact Set

Every completed benchmark run must produce:

```text
benchmark-results/<date>/
  results.json
  summary.md
  task-matrix.csv
  control/
    <task-id>/transcript.md
    <task-id>/proof/
  axint/
    <task-id>/transcript.md
    <task-id>/proof/
  charts/
    final-green-rate.svg
    time-to-green.svg
    proof-completeness.svg
    false-ship-claims.svg
```

## Why This Wins

This benchmark makes Axint legible to three audiences:

- Developers see that Axint catches Apple-native failures earlier.
- Investors see repeatable workflow lift instead of founder anecdotes.
- Acquirers see a measurable proof/repair layer that improves every agent and every Apple development workflow.
