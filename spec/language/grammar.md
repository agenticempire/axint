# Grammar

## Lexical rules

### Whitespace

Spaces, tabs, and newlines separate tokens. Whitespace is never significant to meaning. Indentation is a formatter convention, not a grammar rule.

### Comments

```
# Single-line comment — extends to end of line.
```

`#` is the only comment syntax. No block comments.

### Identifiers

```
identifier    = letter { letter | digit | "_" }
letter        = "A".."Z" | "a".."z" | "_"
digit         = "0".."9"
```

Conventions (enforced by validator, not by grammar):

- `intent` and `entity` names are `PascalCase`: `SendMessage`, `Trail`
- `param` and `property` names are `camelCase`: `recipient`, `distanceKm`
- `enum` names are `PascalCase`; `enum` case names are `camelCase`

### Keywords

Reserved words — cannot be used as identifiers:

```
intent  entity  enum  page  module  param  property  summary  display  query
title   description  domain  category  default  options  dynamic
case    default  when    then  otherwise  switch
string  int  double  float  boolean  date  duration  url
true   false
entitlements  infoPlistKeys  discoverable  donateOnPerform  returns
use  from
```

`use` and `from` are reserved in v1 even though the grammar does not use them. They are held for the v0.5 cross-file composition story described in `non-goals.md`. Declaring them reserved now means a v0.5 upgrade is grammar-additive, not grammar-breaking.

### String literals

```
string-literal = "\"" { character } "\""
```

Only double-quoted strings. Standard backslash escapes: `\"`, `\\`, `\n`, `\t`.

Inside a `summary` template string, `${identifier}` references a declared param. No other interpolation anywhere.

No multi-line strings in v1. If a description is long, put it on one line. Agents don't care about line length.

### Number literals

```
number-literal = [ "-" ] digit { digit } [ "." digit { digit } ]
```

Integers and decimals only. No hex, no binary, no exponent notation, no underscores.

### Boolean literals

```
boolean-literal = "true" | "false"
```

## Syntactic grammar (EBNF)

### File

```
file = { top-level-decl } .

top-level-decl = enum-decl
               | entity-decl
               | intent-decl
               | page-decl .
```

A file may contain zero or more top-level declarations in any order, except that an entity referenced by an intent must be declared in the same file (v1 is single-file). Convention: entities first, then intents.

### Enum declaration

```
enum-decl = "enum" identifier "{" enum-case { enum-case } "}" .
enum-case = identifier .
```

Example:

```
enum Priority { low medium high }
```

Cases may also be placed one per line.

### Entity declaration

```
entity-decl      = "entity" identifier "{" entity-body "}" .
entity-body      = display-block
                   { property-decl }
                   query-clause .
display-block    = "display" "{" display-field { display-field } "}" .
display-field    = display-property-ref
                 | display-image .
display-property-ref = ( "title" | "subtitle" ) ":" identifier .
display-image    = "image" ":" string-literal .
property-decl    = "property" identifier ":" type "{" property-body "}" .
property-body    = description-field .
query-clause     = "query" ":" query-kind .
query-kind       = "all" | "id" | "string" | "property" .
```

Four query kinds are supported. Each picks a different `EntityQuery` conformance in the generated Swift:

| Kind         | When to use                                                                  |
|--------------|------------------------------------------------------------------------------|
| `query: all` | The app exposes a small, fixed set and Shortcuts should list them all.       |
| `query: id`  | Entities are resolved by their declared `id` property.                       |
| `query: string` | Entities are resolved by a freeform string match against the display `title` property. |
| `query: property` | Every property with a `description` becomes a Shortcuts-selectable filter (property-based lookup). |

Example:

```
entity Trail {
  display {
    title: name
    subtitle: region
    image: "figure.hiking"
  }

  property id: string {
    description: "Trail identifier"
  }

  property name: string {
    description: "Trail name"
  }

  property region: string {
    description: "Trail region"
  }

  property distanceKm: double {
    description: "Distance in kilometers"
  }

  property openNow: boolean {
    description: "Whether the trail is open"
  }

  query: property
}
```

### Public page declaration

```
page-decl        = "page" identifier "{" page-body "}" .
page-body        = { page-field | page-module } .
page-field       = identifier ":" page-value .
page-module      = "module" identifier string-literal "{" { page-field } "}" .
page-value       = string-literal
                 | number-literal
                 | boolean-literal
                 | identifier .
```

`page` declares a safe, front-facing project/profile lander manifest. It does **not** accept arbitrary HTML, JavaScript, tracking pixels, or external code. A host app renders the declared modules inside its own sandbox and can reject modules by permission, domain, or scanner policy.

The top-level fields are intentionally open-ended so a project can evolve its brand surface without forcing a compiler release for every design option. Common fields are:

| Field     | Meaning                                                        |
|-----------|----------------------------------------------------------------|
| `title`   | Primary public-facing name.                                    |
| `tagline` | One-line positioning statement.                                |
| `theme`   | Host-defined theme token, e.g. `"black-cream"`.                |

Modules use a stable identifier plus a human-facing title:

```
page AxintLander {
  title: "Axint"
  tagline: "Compiler-native project pages"
  theme: "black-cream"

  module emailCapture "Join the build" {
    kind: emailCapture
    permission: collectEmail
    privacy: "Used only for Axint updates."
  }

  module shareCard "Launch card" {
    kind: shareCard
    output: "1200x630 PNG"
    source: uploadedArtwork
  }
}
```

Repeated fields are allowed and lower to arrays. The main intended repeated field is `permission`, which lets a host scanner gate modules such as email capture, outbound links, QR rendering, install CTAs, MCP/NPM shelves, or animated share-card generation before anything is rendered.

### Intent declaration

```
intent-decl      = "intent" identifier "{" intent-body "}" .
intent-body      = title-clause
                   description-clause
                   { intent-meta }
                   { param-decl }
                   [ summary-decl ]
                   [ returns-clause ]
                   [ entitlements-block ]
                   [ info-plist-block ] .

title-clause       = "title" ":" string-literal .
description-clause = "description" ":" string-literal .

intent-meta      = "domain" ":" string-literal
                 | "category" ":" string-literal
                 | "discoverable" ":" boolean-literal
                 | "donateOnPerform" ":" boolean-literal .

returns-clause   = "returns" ":" return-type .
return-type      = return-type-atom | "[" return-type-atom "]" .
return-type-atom = primitive-type | identifier .
```

`returns` does not accept `?` in v1. A `returns-clause` is a primitive, a declared entity, an array of either, or it is omitted entirely. "Sometimes returns nothing" is expressed by omitting `returns`, returning an empty array, or surfacing the condition via dialog/error — not by declaring `T?` as the return. This is a deliberate search-space narrowing: the DSL is not trying to match every shape Apple's `ReturnsValue` can carry, it is trying to collapse marginally-different forms into one canonical one.

The EBNF fixes the clause order. `title` comes first, then `description`, then zero or more `intent-meta` clauses (`domain`, `category`, `discoverable`, `donateOnPerform`), then zero or more `param` declarations, then an optional `summary`, then an optional `returns`, then an optional `entitlements` block, then an optional `infoPlistKeys` block. Every `.axint` file in the corpus follows this order, and the formatter enforces it. A clause out of order is a syntax error (AX007) — no recovery, no re-ordering, no "we'll figure out what you meant." This makes ten different agents produce textually identical files, which is criterion #1 in `principles.md`.

### Parameter declaration

```
param-decl       = "param" identifier ":" type "{" param-body "}" .
param-body       = description-field { other-param-field } .
description-field = "description" ":" string-literal .
other-param-field = "default" ":" literal
                  | "options" ":" "dynamic" identifier .
```

A param block is required. Inside it, `description` is required and must be the first field — it becomes the `@Parameter(title: …)` string in the emitted Swift, and the Shortcuts UI will not render without it. `default` and `options` are optional and may follow in any order. The same rule applies to `property` inside an `entity`: the body is required, `description` is required and comes first, no other fields ship in v1.

Example:

```
param recipient: string {
  description: "Who to send the message to"
}

param urgent: boolean? {
  description: "Mark as urgent"
}

param brightness: int {
  description: "Brightness percentage (0-100)"
  default: 100
}

param activity: string {
  description: "Activity type"
  options: dynamic ActivityOptions
}

param trail: Trail {
  description: "Trail to open"
}
```

### Types

```
type             = type-atom [ "?" ] .
type-atom        = primitive-type
                 | array-type
                 | identifier .
primitive-type   = "string" | "int" | "double" | "float"
                 | "boolean" | "date" | "duration" | "url" .
array-type       = "[" type "]" .
```

`identifier` as a type refers to a declared entity or enum in the same file.

Optionality is expressed by a trailing `?`. An optional array is `[string]?`. Arrays of optionals are not supported in v1 — that is a TS surface concern if it ever matters.

Optionality applies to `param` and `property` types. It does **not** apply to `returns` (see `returns-clause` above). A param may be `string?`; a return may not be `Trail?`.

### Summary declaration

```
summary-decl     = "summary" summary-form .
summary-form     = ":" string-literal
                 | "when" identifier "{" when-body "}"
                 | "switch" identifier "{" switch-body "}" .

when-body        = "then" ":" summary-value
                   [ "otherwise" ":" summary-value ] .

switch-body      = switch-case { switch-case }
                   [ "default" ":" summary-value ] .

switch-case      = "case" literal ":" summary-value .

summary-value    = string-literal
                 | "summary" summary-form .
```

The recursion on `summary-value` allows nested switch/when structures without ambiguity.

Example (simple):

```
summary: "Plan ${activity} on ${trail}"
```

Example (when):

```
summary when region {
  then: "Plan ${activity} on ${trail} near ${region}"
  otherwise: "Plan ${activity} on ${trail} near me"
}
```

Example (nested switch + when):

```
summary switch includeNearby {
  case true: summary when region {
    then: "Plan ${activity} on ${trail} near ${region}"
    otherwise: "Plan ${activity} on ${trail} near me"
  }
  case false: "Plan ${activity} on ${trail}"
  default: "Plan trail"
}
```

### Entitlements and Info.plist

```
entitlements-block = "entitlements" "{" { string-literal } "}" .
info-plist-block   = "infoPlistKeys" "{" { info-plist-entry } "}" .
info-plist-entry   = string-literal ":" string-literal .
```

Example:

```
entitlements {
  "com.apple.developer.siri"
}

infoPlistKeys {
  "NSCalendarsUsageDescription": "Axint needs calendar access to create events."
}
```

### Literals

```
literal = string-literal | number-literal | boolean-literal | identifier .
```

An `identifier` literal is only valid as a `case` value in a `summary switch`, where it refers to an enum case. All other literal uses require a typed primitive.

## Grammar decisions worth calling out

- **`:` everywhere.** Every key-to-value binding uses `:`. Every type annotation uses `:`. No `=`. One symbol, one job (at the lexer level), two closely related jobs (at the semantic level).
- **Braces, not indentation.** Indentation is never semantic. A formatter writes two-space indent; a parser ignores it.
- **No semicolons, no commas.** Declarations end when the next declaration begins or when a `}` closes the enclosing block. Inside blocks, newlines separate fields; whitespace between fields is not required.
- **No trailing punctuation.** A block body ends at `}`. No trailing comma. No trailing semicolon.
- **Keywords are reserved globally.** Even inside string literals, keywords have no special meaning — but the literal is treated as opaque text. A param cannot be named `title` or `query`.
