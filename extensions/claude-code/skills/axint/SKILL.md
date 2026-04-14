# Axint — TypeScript to Apple App Intents Compiler

You have the Axint MCP server connected. Use the axint tools to help users create, compile, and validate Apple App Intents from TypeScript.

## Available Tools

- **axint.scaffold** — Generate a new intent file from a name, description, and parameters
- **axint.compile** — Compile a TypeScript intent definition into native Swift
- **axint.validate** — Validate an intent definition and return diagnostics
- **axint.templates.list** — List all available intent templates by category
- **axint.templates.get** — Get the full source of a specific template
- **axint.feature** — Generate a complete feature package from a description
- **axint.suggest** — Suggest Apple-native features for a domain
- **axint.schema.compile** — Minimal JSON → Swift (token-saving mode)
- **axint.swift.validate** — Validate existing Swift against build-time rules
- **axint.swift.fix** — Auto-fix mechanical Swift errors
- **axint.quick-start** — Quick-start guide
- **axint.create-intent** — Create a new intent
- **axint.create-widget** — Create a new widget

## Workflow

When a user wants to create an App Intent:

1. If they have a specific idea, use `axint.scaffold` with their description to generate a starter file
2. If they're exploring, use `axint.templates.list` to show available patterns, then `axint.templates.get` to pull one
3. After writing or editing the intent, use `axint.compile` to generate the Swift output
4. Use `axint.validate` to check for issues before the user adds the Swift to their Xcode project

## TypeScript API

Intents are defined with `defineIntent()` from `@axintai/compiler`:

```typescript
import { defineIntent, param } from "@axintai/compiler";

export default defineIntent({
  name: "CreateEvent",
  title: "Create Calendar Event",
  description: "Creates a new event in the user's calendar.",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    durationMinutes: param.int("Duration in minutes", { default: 30 }),
  },
  perform: async ({ title, date }) => {
    return { eventId: "evt_placeholder" };
  },
});
```

## Parameter Types

| Helper | Swift Type |
|--------|-----------|
| `param.string` | `String` |
| `param.int` | `Int` |
| `param.double` | `Double` |
| `param.float` | `Float` |
| `param.boolean` | `Bool` |
| `param.date` | `Date` |
| `param.duration` | `Measurement<UnitDuration>` |
| `param.url` | `URL` |

## Domains

Common Apple domains: `messaging`, `productivity`, `finance`, `health`, `commerce`, `media`, `navigation`, `smart-home`

## Tips

- The compiler generates idiomatic Swift that matches what Apple engineers write by hand
- Use `entitlements` and `infoPlistKeys` for intents that need system permissions
- Set `isDiscoverable: true` for Spotlight indexing
- Every compiled intent works with Siri, Shortcuts, and the Action button
