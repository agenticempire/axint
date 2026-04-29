# Keywords and Types

Every reserved word in the language, with a one-line semantic.

## Top-level declarations

| Keyword    | Role                                                                     |
|------------|--------------------------------------------------------------------------|
| `intent`   | Declares an App Intent. Compiles to an `AppIntent` struct.               |
| `entity`   | Declares an App Entity. Compiles to an `AppEntity` struct + `EntityQuery`. |
| `enum`     | Declares a closed enum. Compiles to a Swift `enum` conforming to `AppEnum`. |
| `page`     | Declares a safe custom public project/profile lander manifest.           |
| `module`   | Declares a host-rendered module inside a `page`.                         |

## Public page keywords

| Keyword  | Role                                                                                     |
|----------|------------------------------------------------------------------------------------------|
| `page`   | Opens a custom public page manifest. It lowers to host-rendered IR, not arbitrary HTML.  |
| `module` | Opens a sandboxed page module with an id, title, and manifest fields.                    |

## Intent body keywords

| Keyword           | Role                                                                                |
|-------------------|-------------------------------------------------------------------------------------|
| `title`           | Required display title shown in Shortcuts and Siri.                                 |
| `description`     | Required human-readable description.                                                |
| `domain`          | Optional App Intents domain (e.g. `"messaging"`, `"health"`).                       |
| `category`        | Optional category hint for Shortcuts organization.                                  |
| `discoverable`    | Whether to expose the intent to Spotlight indexing. Defaults to framework default.  |
| `donateOnPerform` | Whether to donate this intent to Siri/Spotlight when performed.                     |
| `param`           | Declares an input parameter.                                                        |
| `summary`         | Declares the Shortcuts parameter summary.                                           |
| `returns`         | Declares the intent's return type. Accepts a primitive (`string`, `int`, `url`, …), a declared entity (`Trail`), or an array of either (`[Trail]`). Optional return types (`Trail?`) are **not** supported in v1 — omit `returns` when the intent returns nothing, or return an empty array for maybe-empty collections. |
| `entitlements`    | Declares entitlements required by this intent.                                      |
| `infoPlistKeys`   | Declares Info.plist keys required by this intent (key-to-description mapping).      |

## Entity body keywords

| Keyword     | Role                                                                              |
|-------------|-----------------------------------------------------------------------------------|
| `display`   | Opens the display representation block (title, subtitle, image).                  |
| `property`  | Declares a property on the entity.                                                |
| `query`     | Declares the query kind. Four kinds are allowed: `all` returns every entity; `id` resolves an entity by its `id` property; `string` resolves by freeform string match against the `title` property; `property` exposes every property with a `description` as a Shortcuts-selectable filter. |
| `title`     | Inside `display`: takes a bare property identifier to render as the title.        |
| `subtitle`  | Inside `display`: takes a bare property identifier to render as the subtitle.     |
| `image`     | Inside `display`: takes a quoted string naming the SF Symbol or asset to render.  |

## Param / property body keywords

| Keyword       | Role                                                                          |
|---------------|-------------------------------------------------------------------------------|
| `description` | Required first field in every param and property body. Compiles to the `@Parameter(title:)` / `@Property(title:)` string in the emitted Swift. |
| `default`     | Optional. Default value of a param. Must be a literal whose type matches the param's declared type. Not supported on entity properties in v1. |
| `options`     | Optional. Specifies a dynamic options provider: `options: dynamic ProviderName`. |
| `dynamic`     | Modifier on `options` indicating a runtime options provider.                  |

## Summary keywords

| Keyword     | Role                                                                               |
|-------------|------------------------------------------------------------------------------------|
| `summary`   | Opens a summary declaration or a nested recursive summary value.                   |
| `when`      | Branch on whether a specific param has a value.                                    |
| `then`      | Summary used when the `when` param has a value.                                    |
| `otherwise` | Summary used when the `when` param has no value.                                   |
| `switch`    | Branch on the value of a specific param.                                           |
| `case`      | A branch of a `switch`. Followed by a literal value then `:` then a summary-value. |
| `default`   | The fallback case of a `switch`, or a param's default value.                       |

## Type keywords

| Keyword    | Swift type                     | Notes                                            |
|------------|--------------------------------|--------------------------------------------------|
| `string`   | `String`                       | UTF-8 text.                                      |
| `int`      | `Int`                          | 64-bit signed integer.                           |
| `double`   | `Double`                       | 64-bit floating point.                           |
| `float`    | `Float`                        | 32-bit floating point.                           |
| `boolean`  | `Bool`                         |                                                  |
| `date`     | `Date`                         | Foundation `Date`.                               |
| `duration` | `Measurement<UnitDuration>`    | Durations use Foundation units.                  |
| `url`      | `URL`                          | Foundation `URL`.                                |

## Type syntax

| Syntax       | Meaning                                                                 |
|--------------|-------------------------------------------------------------------------|
| `T?`         | Optional `T`.                                                           |
| `[T]`        | Array of `T`.                                                           |
| `[T]?`       | Optional array of `T`.                                                  |
| `EntityName` | Reference to a declared entity. The entity must be declared in the file. |
| `EnumName`   | Reference to a declared enum. The enum must be declared in the file.     |

## Literals

| Literal   | Example                              | Notes                                            |
|-----------|--------------------------------------|--------------------------------------------------|
| String    | `"Send Message"`                     | Double-quoted, standard escapes.                 |
| Integer   | `100`, `-3`                          | No underscores, no hex.                          |
| Decimal   | `3.14`, `-0.5`                       | Simple decimal form only.                        |
| Boolean   | `true`, `false`                      |                                                  |
| Identifier| `low`, `medium`                      | Only valid as a `case` value for an enum switch. |

## Not reserved — available as identifiers

Everything not listed above is available as a user-chosen identifier. Examples of names that are **not** reserved and are fine to use: `recipient`, `trail`, `region`, `includeNearby`, `distanceKm`, `openNow`.
