# Negative-test corpus

Every file in this directory is intentionally invalid. Each file targets exactly one diagnostic code so the conformance suite can assert:

1. The parser/validator fires the expected `AX...` code.
2. No other diagnostics fire alongside it.
3. The emitted line and column point at the offending token.

This corpus is the pressure test referenced in `principles.md` — "if the diagnostic doesn't make the fix obvious in a single edit, the language is wrong, not the file." Each entry below includes the one-line edit that would make the file valid.

## Files

| File                        | Target code | What's broken                                                              |
|-----------------------------|-------------|----------------------------------------------------------------------------|
| `01-ax001-empty.axint`      | AX001       | File contains no `intent` or `entity` declaration.                         |
| `02-ax002-no-name.axint`    | AX002       | `intent` keyword not followed by a name.                                   |
| `03-ax003-no-title.axint`   | AX003       | `intent` body is missing `title`.                                          |
| `04-ax004-no-desc.axint`    | AX004       | `intent` body is missing `description`.                                    |
| `05-ax005-bad-type.axint`   | AX005       | Param type is not a primitive, entity, or enum.                            |
| `06-ax015-no-display.axint` | AX015       | `entity` is missing its `display` block.                                   |
| `07-ax020-missing-entity.axint` | AX020   | Param references an entity not declared in the file.                       |
| `08-ax021-missing-property.axint` | AX021 | `display.title` names a property that doesn't exist on the entity.         |
| `09-ax023-missing-summary-param.axint` | AX023 | `summary` template references a param the intent doesn't declare.     |
| `10-ax100-bad-case.axint`   | AX100       | Intent name is not `PascalCase`.                                           |
| `11-ax103-dup-params.axint` | AX103       | Intent has two params with the same name.                                  |
| `12-ax106-default-type.axint` | AX106     | `default` value type doesn't match declared param type.                    |
| `13-ax107-optional-default.axint` | AX107 | Optional param with a non-null default — contradictory.                    |
| `14-ax109-switch-no-default.axint` | AX109 | `summary switch` over a `boolean` covers only one case, no `default`.    |
| `15-ax112-query-no-desc.axint` | AX112   | `query: property` but no property has a `description`.                     |

## How the test harness consumes this

The conformance runner globs `broken/*.axint`, parses each filename prefix (`NN-axNNN-...`), runs the full pipeline, and asserts that exactly one diagnostic fires whose code matches the filename. A file that triggers the wrong code — or more than one code — fails the suite.

A file in this folder is a spec bug to be fixed, not a grammar feature.

## Adding more

When a new diagnostic is added to `diagnostics.md`, a broken example lands here in the same PR. The PR is blocked until the pair exists. That is how the corpus stays honest.
