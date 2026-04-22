# IR Mapping

Every production in the grammar compiles to a node or field in the existing IR. No new IR nodes ship in v1. This file is the canonical mapping.

## Intent

```
intent Name {
  title: "..."
  description: "..."
  domain: "..."
  category: "..."
  discoverable: true
  donateOnPerform: true
  ...
}
```

| DSL form                         | IR field on `IRIntent`          |
|----------------------------------|---------------------------------|
| `intent Name { ... }`            | `name: "Name"`                  |
| `title: "..."`                   | `title: "..."`                  |
| `description: "..."`             | `description: "..."`            |
| `domain: "..."`                  | `domain?: "..."`                |
| `category: "..."`                | `category?: "..."`              |
| `discoverable: bool`             | `isDiscoverable?: bool`         |
| `donateOnPerform: bool`          | `donateOnPerform?: bool`        |
| `returns: T`                     | `returnType: IRType` — `T` is a non-optional primitive, entity, or array (see grammar `return-type`) |
| `returns: CustomType`            | `customResultType?: "CustomType"` (when `T` is not a known primitive or entity) |
| `param name: T { ... }`          | appends an `IRParameter` to `parameters` |
| `summary ...`                    | `parameterSummary?: IRParameterSummary` |
| `entitlements { "..." }`         | appends to `entitlements?: string[]`    |
| `infoPlistKeys { "k": "v" }`     | merges into `infoPlistKeys?: Record<string, string>` |
| Entities declared in the file    | `entities?: IREntity[]` (auto-collected when referenced by any param) |
| The source `.axint` file path    | `sourceFile: "..."`             |

## Entity

```
entity Name {
  display { title: propName subtitle: propName image: "sf.symbol" }
  property id: string { description: "..." }
  ...
  query: property
}
```

| DSL form                                   | IR field on `IREntity`                          |
|--------------------------------------------|-------------------------------------------------|
| `entity Name { ... }`                      | `name: "Name"`                                  |
| `display { title: propName }`              | `displayRepresentation.title: "propName"` (bare identifier, must match a declared `property`) |
| `display { subtitle: propName }`           | `displayRepresentation.subtitle?: "propName"` (bare identifier, must match a declared `property`) |
| `display { image: "sf.symbol" }`           | `displayRepresentation.image?: "sf.symbol"` (quoted literal — SF Symbol name or asset identifier) |
| `property name: T { description: "..." }`  | appends an `IRParameter` to `properties`        |
| `query: all \| id \| string \| property`   | `queryType: "all" \| "id" \| "string" \| "property"` |

The grammar disambiguates on token type: bare identifiers in `title`/`subtitle` are property references, a quoted string in `image` is a literal asset name. The validator resolves the identifier against the entity's declared properties and raises `AX021` if the name doesn't exist.

## Parameters

A `param` in an intent and a `property` on an entity both compile to `IRParameter`. They use the same grammar productions.

```
param name: T {
  description: "..."
  default: <literal>
  options: dynamic ProviderName
}
```

| DSL form                         | IR field on `IRParameter`                                  |
|----------------------------------|------------------------------------------------------------|
| `param name: T`                  | `name: "name"`, `type: <mapped IRType>`, `isOptional: false` |
| `param name: T?`                 | same, with `isOptional: true` and type wrapped as needed   |
| `{ description: "..." }`         | `description: "..."`, `title: "..."` (the TS surface and DSL both default `title` to the param name de-camelCased and capitalized — `eventTitle` → `"Event Title"`) |
| `{ default: <literal> }`         | `defaultValue: <literal>`                                  |
| `{ options: dynamic Provider }`  | `type: { kind: "dynamicOptions", valueType: <inner>, providerName: "Provider" }` |

## Types

| DSL type              | IRType                                                                     |
|-----------------------|----------------------------------------------------------------------------|
| `string`              | `{ kind: "primitive", value: "string" }`                                   |
| `int`                 | `{ kind: "primitive", value: "int" }`                                      |
| `double`              | `{ kind: "primitive", value: "double" }`                                   |
| `float`               | `{ kind: "primitive", value: "float" }`                                    |
| `boolean`             | `{ kind: "primitive", value: "boolean" }`                                  |
| `date`                | `{ kind: "primitive", value: "date" }`                                     |
| `duration`            | `{ kind: "primitive", value: "duration" }`                                 |
| `url`                 | `{ kind: "primitive", value: "url" }`                                      |
| `T?`                  | `{ kind: "optional", innerType: <T> }`                                     |
| `[T]`                 | `{ kind: "array", elementType: <T> }`                                      |
| `EntityName` (declared entity)  | `{ kind: "entity", entityName: "...", properties: [...] }`       |
| `EnumName` (declared enum)      | `{ kind: "enum", name: "...", cases: [...] }`                    |

Entity references inside a `param` or a `returns` clause lower to `entity` IR nodes whose `properties` field carries the same IR shape the entity declaration produces — the reference and the declaration share the same property list in IR, so downstream consumers (validator, generator, TS emit) don't need to look the entity up by name. This matches the existing SDK behavior where `param.entity("Trail", ...)` resolves against the registered entity and writes an annotated `entity` IR node.

## Summary

```
summary: "template"
```
→ `{ kind: "summary", template: "template" }`

```
summary when p { then: A otherwise: B }
```
→ `{ kind: "when", parameter: "p", then: <A>, otherwise: <B> }`

```
summary switch p {
  case v1: A
  case v2: B
  default: C
}
```
→ `{ kind: "switch", parameter: "p", cases: [{ value: v1, summary: <A> }, ...], default: <C> }`

A `summary-value` is either a string literal (a leaf `{ kind: "summary", template: "..." }`) or a nested `summary ...` form, which recurses.

## Enum

```
enum Name { case1 case2 case3 }
```
→ `{ kind: "enum", name: "Name", cases: ["case1", "case2", "case3"] }`

Enums in v1 are used as param types. They do not get their own top-level IR node — they're embedded wherever referenced. This matches the existing IR's `kind: "enum"` inline form.

## Entitlements and Info.plist

```
entitlements { "com.apple.developer.siri" "com.apple.developer.healthkit" }
```
→ `entitlements: ["com.apple.developer.siri", "com.apple.developer.healthkit"]`

```
infoPlistKeys {
  "NSCalendarsUsageDescription": "..."
  "NSMicrophoneUsageDescription": "..."
}
```
→ `infoPlistKeys: { "NSCalendarsUsageDescription": "...", "NSMicrophoneUsageDescription": "..." }`

## File to `IRIntent[]`

Compiling a `.axint` file produces an array of `IRIntent` (one per `intent` declaration) and an array of `IREntity` (one per `entity` declaration), attached via each intent's `entities?` field where referenced. The resulting IR is byte-identical to what the TS surface would produce for the equivalent `defineIntent` / `defineEntity` calls.

## Round-trip invariant

For every valid `.axint` file `F`:

1. `parse(F) = IR`
2. `emitTs(IR) = T` (a TypeScript source string using the `@axint/compiler` SDK)
3. `parseTs(T) = IR`

The IR round-trips. This is the migration contract referenced in `principles.md`. The test suite enforces it with property tests.
