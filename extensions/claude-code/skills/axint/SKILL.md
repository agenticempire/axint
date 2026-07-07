---
name: axint
description: Use Axint MCP tools to create, compile, validate, and repair Apple App Intents and Swift surfaces from TypeScript definitions.
---

# Axint — Apple-Native Compiler

You have the Axint MCP server connected. Use the axint tools to help users create, compile, and validate Apple-native capabilities from TypeScript.

## Available Tools

Axint exposes 36 MCP tools and five prompts. Use the current project-aware loop:

- Project and session tools: **axint.status**, **axint.upgrade**, **axint.doctor**, **axint.session.start**, **axint.project.pack**, **axint.project.index**, **axint.project.syncVersion**
- Apple generation tools: **axint.feature**, **axint.suggest**, **axint.scaffold**, **axint.compile**, **axint.schema.compile**
- Proof and repair tools: **axint.validate**, **axint.swift.validate**, **axint.swift.fix**, **axint.fix-packet**, **axint.cloud.check**, **axint.repair**, **axint.run**
- Xcode and workflow tools: **axint.xcode.guard**, **axint.xcode.write**, **axint.workflow.check**, **axint.run.status**, **axint.run.cancel**
- Context and ecosystem tools: **axint.context.memory**, **axint.context.docs**, **axint.registry.search**, **axint.templates.list**, **axint.templates.get**, **axint.feedback.create**, **axint.tokens.ingest**
- Prompts: **axint.quick-start**, **axint.project-start**, **axint.context-recovery**, **axint.create-intent**, **axint.create-widget**

## Workflow

When a user wants to create an App Intent:

1. Start with `axint.session.start` and `axint.status` so the thread has version proof.
2. If they are modifying an existing Apple app, call `axint.project.index` and prefer `axint.repair` or patch-first guidance before generating a new surface.
3. If they are creating a new surface, use `axint.suggest`, `axint.templates.list`, `axint.templates.get`, `axint.scaffold`, or `axint.feature` as appropriate.
4. After writing or editing source, run `axint.swift.validate`, `axint.cloud.check`, and `axint.run` or focused Xcode proof before calling it done.

## TypeScript API

Intents are defined with `defineIntent()` from `@axint/compiler`:

```typescript
import { defineIntent, param } from "@axint/compiler";

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

| Helper           | Swift Type                  |
| ---------------- | --------------------------- |
| `param.string`   | `String`                    |
| `param.int`      | `Int`                       |
| `param.double`   | `Double`                    |
| `param.float`    | `Float`                     |
| `param.boolean`  | `Bool`                      |
| `param.date`     | `Date`                      |
| `param.duration` | `Measurement<UnitDuration>` |
| `param.url`      | `URL`                       |

## Domains

Common Apple domains: `messaging`, `productivity`, `finance`, `health`, `commerce`, `media`, `navigation`, `smart-home`

## Tips

- The compiler generates idiomatic Swift that matches what Apple engineers write by hand
- Use `entitlements` and `infoPlistKeys` for intents that need system permissions
- Set `isDiscoverable: true` for Spotlight indexing
- Every compiled intent works with Siri, Shortcuts, and the Action button
