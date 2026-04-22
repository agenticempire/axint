# Examples

Fifteen canonical `.axint` files, each paired with the Swift file the compiler is expected to emit. These examples drive the spec's conformance suite: every production in the grammar shows up in at least one example, and every example round-trips through parse → IR → Swift → validate with zero diagnostics.

Ordered roughly from simplest to most complex. Each file exercises a distinct feature so an agent reading a subset still sees the full surface.

| # | File                                    | Exercises                                              |
|---|-----------------------------------------|--------------------------------------------------------|
| 1 | `01-hello.axint`                        | Minimal intent: no params, no metadata                 |
| 2 | `02-send-message.axint`                 | String params, one optional param, `domain`            |
| 3 | `03-set-lights.axint`                   | Int + boolean defaults                                 |
| 4 | `04-log-health.axint`                   | `date`, `duration`, `url`, two optional params         |
| 5 | `05-create-event.axint`                 | Duration with default, entitlements, infoPlistKeys     |
| 6 | `06-priority-enum.axint`                | Enum type as param                                     |
| 7 | `07-array-param.axint`                  | Array param `[string]`                                 |
| 8 | `08-optional-array.axint`               | Optional array param `[string]?`                       |
| 9 | `09-custom-category.axint`              | `category`, `discoverable`, `donateOnPerform`          |
| 10 | `10-simple-summary.axint`              | `summary: "template"` form                             |
| 11 | `11-when-summary.axint`                | `summary when paramName { then / otherwise }`          |
| 12 | `12-switch-summary.axint`              | `summary switch paramName { case / default }`          |
| 13 | `13-trail-entity.axint`                | Single entity + intent using it                        |
| 14 | `14-plan-trail.axint`                  | Entity + dynamic options + nested switch/when summary  |
| 15 | `15-returns-entity.axint`              | Intent returning an entity (single + array)            |

Each example has a matching `.swift` file showing the expected output. Both files are checked into the conformance suite under `axint/tests/language/conformance/`.

## Negative corpus

The fifteen files above are the positive corpus — every one parses, validates, and emits Swift cleanly. A matching negative corpus lives in [`broken/`](./broken), where each file is deliberately invalid and targets exactly one `AX...` diagnostic. Together the two corpora give the conformance runner a symmetric assertion: valid files pass with zero diagnostics, invalid files produce exactly the one code their filename claims.

When a new diagnostic is added to `diagnostics.md`, a broken example must land in `broken/` in the same PR. See [`broken/README.md`](./broken/README.md) for the current catalog.
