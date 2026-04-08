# Axint Error Code Reference

Axint uses a Rust-inspired diagnostic system with error codes, locations, and fix suggestions.

## Parser Errors (AX001–AX005)

These errors occur when Axint cannot parse your TypeScript intent definition.

### AX001 — No `defineIntent()` call found

Your file must contain a `defineIntent({...})` call.

```
error[AX001]: No defineIntent() call found in src/intents/my-intent.ts
  --> src/intents/my-intent.ts
  = help: Ensure your file exports a defineIntent({...}) call.
```

**Fix:** Make sure your file calls `defineIntent()`:

```typescript
import { defineIntent, param } from "@axint/sdk";
export default defineIntent({ /* ... */ });
```

### AX002 — Missing required field: `name`

Every intent needs a `name` field.

```
error[AX002]: Missing required field: name
  = help: Add a name field: name: "MyIntent"
```

**Fix:** Add a PascalCase name: `name: "CreateEvent"`

### AX003 — Missing required field: `title`

Every intent needs a `title` for Siri and Shortcuts display.

**Fix:** Add a human-readable title: `title: "Create Calendar Event"`

### AX004 — Missing required field: `description`

Every intent needs a `description` explaining what it does.

**Fix:** Add a description: `description: "Creates a new event in the user's calendar"`

### AX005 — Unknown param type

You used a param type that Axint doesn't support yet.

```
error[AX005]: Unknown param type: param.int64
  = help: Supported types: string, number, boolean, date, duration, url
```

**Supported types:** `param.string()`, `param.number()`, `param.boolean()`, `param.date()`, `param.duration()`, `param.url()`

## Validation Errors (AX100–AX106)

These errors check your intent against Apple App Intents constraints.

### AX100 — Intent name not PascalCase

Swift requires struct names in PascalCase. Axint appends `Intent` to your name, so `SendMessage` becomes `SendMessageIntent`.

```
error[AX100]: Intent name "sendMessage" must be PascalCase (e.g., "CreateEvent")
  = help: Rename to "SendMessage"
```

**Why PascalCase?** Swift structs follow PascalCase convention. App Intents registered with Siri use the struct name for identity.

### AX101 — Empty title

The title appears in Siri and the Shortcuts app. It cannot be empty.

### AX102 — Empty description

The description helps users understand what the intent does in the Shortcuts gallery.

### AX103 — Invalid Swift identifier in parameter name

Parameter names become Swift properties. They must start with a letter or underscore and contain only alphanumeric characters.

### AX104 — Empty parameter description (warning)

Parameters without descriptions display without context in Siri. This is a warning, not an error.

### AX105 — Too many parameters (warning)

Apple recommends 10 or fewer parameters per intent for usability. Consider splitting into multiple intents or grouping parameters into an entity.

### AX106 — Title exceeds 60 characters (warning)

Siri may truncate titles longer than 60 characters. Consider shortening.

## Swift Validation Errors (AX200–AX202)

These errors validate the generated Swift code (you shouldn't see these unless there's a generator bug).

### AX200 — Missing `import AppIntents`

### AX201 — No AppIntent conformance

### AX202 — Missing `perform()` function

If you encounter AX200–AX202, please [file a bug](https://github.com/AgenticEmpire/axint/issues/new).
