# Axint Error Code Reference

Axint emits structured diagnostics with:

- a stable `AX###` code
- a severity (`error`, `warning`, or `info`)
- a file / line when available
- a concrete suggestion when Axint can infer one

This page focuses on the errors people are most likely to hit in real projects and shows:

1. what triggers the diagnostic
2. what the message looks like
3. the smallest fix that gets you moving again

## Parser Errors (AX001–AX030)

These happen before Axint can build IR from your source.

### AX001 — No supported `define*()` call found

**Trigger**

```typescript
const x = 42;
```

**Typical diagnostic**

```text
error[AX001]: No defineIntent() call found in src/intents/my-intent.ts
```

**Fix**

```typescript
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateEvent",
  title: "Create Event",
  description: "Creates a calendar event",
  params: {
    title: param.string("Event title"),
  },
  perform: async ({ title }) => ({ title }),
});
```

### AX002 / AX003 / AX004 — Missing required intent fields

**Trigger**

```typescript
export default defineIntent({
  name: "CreateEvent",
  params: {},
  perform: async () => "ok",
});
```

**Typical diagnostics**

```text
error[AX003]: Missing required field: title
error[AX004]: Missing required field: description
```

**Fix**

```typescript
export default defineIntent({
  name: "CreateEvent",
  title: "Create Event",
  description: "Creates a calendar event",
  params: {},
  perform: async () => "ok",
});
```

### AX005 — Unknown parameter helper

**Trigger**

```typescript
params: {
  count: param.int64("Count"),
}
```

**Typical diagnostic**

```text
error[AX005]: Unknown param type: param.int64
```

**Fix**

```typescript
params: {
  count: param.int("Count"),
}
```

Supported helpers today:

- `param.string`
- `param.int`
- `param.double`
- `param.float`
- `param.boolean`
- `param.date`
- `param.duration`
- `param.url`
- `param.entity`
- `param.dynamicOptions`

### AX024–AX030 — Invalid `parameterSummary`

These errors happen when the `parameterSummary` block is shaped incorrectly.

**Trigger**

```typescript
parameterSummary: {
  when: "region",
}
```

**Typical diagnostic**

```text
error[AX025]: parameterSummary.when requires a then branch
```

**Fix**

```typescript
parameterSummary: {
  when: "region",
  then: "Plan ${trail} in ${region}",
  otherwise: "Plan ${trail}",
}
```

You can also use the simple string form:

```typescript
parameterSummary: "Open ${trail} in ${region}"
```

## Intent Validation Errors (AX100–AX116)

These validate intent and entity IR against Apple-facing constraints.

### AX100 — Intent name must be PascalCase

**Trigger**

```typescript
name: "sendMessage"
```

**Typical diagnostic**

```text
error[AX100]: Intent name "sendMessage" must be PascalCase
```

**Fix**

```typescript
name: "SendMessage"
```

### AX101 / AX102 — Empty title or description

**Trigger**

```typescript
title: "",
description: "",
```

**Fix**

```typescript
title: "Send Message",
description: "Sends a message to a contact",
```

### AX103 — Invalid Swift identifier in parameter name

**Trigger**

```typescript
params: {
  "trail-name": param.string("Trail"),
}
```

**Fix**

```typescript
params: {
  trailName: param.string("Trail"),
}
```

### AX104 / AX105 / AX106 — Quality warnings

These are warnings, not blockers:

- `AX104`: parameter description is empty
- `AX105`: too many parameters for a single intent
- `AX106`: title is likely too long for Siri / Shortcuts UI

The usual fix is to shorten labels or split one overloaded intent into smaller, clearer intents.

### AX108 / AX109 — Entitlement and Info.plist shape warnings

These warnings catch intent metadata that does not look like real Apple configuration:

- `AX108`: entitlement strings do not look like reverse-DNS identifiers
- `AX109`: Info.plist keys do not look like normal Apple keys

**Example**

```typescript
entitlements: ["healthkit"],
infoPlistKeys: {
  HealthPermission: "Allow access",
},
```

**Fix**

```typescript
entitlements: ["com.apple.developer.healthkit"],
infoPlistKeys: {
  NSHealthShareUsageDescription: "Read workout history to personalize coaching.",
},
```

### AX114 / AX115 / AX116 — HealthKit and privacy copy mismatches

These warnings catch one of the easiest ways to end up with a broken Apple integration:

- `AX114`: HealthKit entitlement is present but no HealthKit usage descriptions were declared
- `AX115`: `NSHealth*UsageDescription` keys were declared without the HealthKit entitlement
- `AX116`: a privacy usage description is empty or still placeholder copy

**Bad**

```typescript
export default defineIntent({
  name: "LogWorkout",
  title: "Log Workout",
  description: "Logs a workout.",
  entitlements: ["com.apple.developer.healthkit"],
  infoPlistKeys: {
    NSHealthShareUsageDescription: "TODO: explain why we read data",
  },
  params: {},
  perform: async () => ({ ok: true }),
});
```

**Typical diagnostics**

```text
warning[AX116]: Privacy usage description "NSHealthShareUsageDescription" is empty or still reads like placeholder copy
```

If the usage strings were missing entirely, Axint would emit `AX114`. If the entitlement were missing but the HealthKit keys stayed behind, it would emit `AX115`.

**Fix**

```typescript
export default defineIntent({
  name: "LogWorkout",
  title: "Log Workout",
  description: "Logs a workout.",
  entitlements: ["com.apple.developer.healthkit"],
  infoPlistKeys: {
    NSHealthShareUsageDescription: "Read workout history to personalize coaching.",
    NSHealthUpdateUsageDescription: "Save newly completed workouts to Health.",
  },
  params: {},
  perform: async () => ({ ok: true }),
});
```

### AX110 — Entity name must be PascalCase

**Trigger**

```typescript
defineEntity({
  name: "trail",
  display: { title: "name" },
  properties: {
    id: param.string("ID"),
    name: param.string("Name"),
  },
});
```

**Fix**

```typescript
defineEntity({
  name: "Trail",
  display: { title: "name" },
  properties: {
    id: param.string("ID"),
    name: param.string("Name"),
  },
});
```

### AX111 / AX112 / AX113 — Entity structure problems

Common causes:

- `AX111`: the entity has no properties
- `AX112`: `display.title` points at a property that does not exist
- `AX113`: `query` is not one of `"id"`, `"all"`, `"string"`, or `"property"`

**Bad**

```typescript
defineEntity({
  name: "Trail",
  display: { title: "label" },
  properties: {},
  query: "search",
});
```

**Good**

```typescript
defineEntity({
  name: "Trail",
  display: { title: "name", subtitle: "region" },
  properties: {
    id: param.string("Trail ID"),
    name: param.string("Trail name"),
    region: param.string("Region"),
  },
  query: "property",
});
```

## View Errors (AX301–AX322)

### AX301 — Missing or invalid view name

**Trigger**

```typescript
export default defineView({
  body: [],
});
```

**Fix**

```typescript
export default defineView({
  name: "ProfileCard",
  body: [
    view.text("Hello"),
  ],
});
```

### AX308 / AX322 — Broken view body or empty output

If a view parses but renders no useful body, simplify first:

```typescript
body: [
  view.vstack([
    view.text("Profile"),
  ], { spacing: 12 }),
]
```

Then reintroduce conditionals, loops, or raw Swift one piece at a time.

## Widget Errors (AX401–AX422)

### AX402 — Missing widget metadata

**Trigger**

```typescript
export default defineWidget({
  name: "StepCounter",
  families: ["systemSmall"],
  entry: {},
  body: [],
});
```

**Fix**

```typescript
export default defineWidget({
  name: "StepCounter",
  displayName: "Step Counter",
  description: "Shows daily step progress",
  families: ["systemSmall"],
  entry: {
    steps: entry.int("Current step count", { default: 0 }),
  },
  body: [
    view.text("\\(steps)"),
  ],
});
```

### AX411 / AX412 — Unsupported families or empty body

Make sure you:

- choose valid families like `systemSmall`, `systemMedium`, `accessoryInline`
- emit at least one body node

## App Errors (AX500–AX522)

### AX510 — App name must be PascalCase

**Bad**

```typescript
name: "weatherApp"
```

**Good**

```typescript
name: "WeatherApp"
```

### AX511 / AX514 — Missing scenes or bad platform guards

**Bad**

```typescript
export default defineApp({
  name: "WeatherApp",
  scenes: [
    scene.settings("SettingsView"),
  ],
});
```

**Better**

```typescript
export default defineApp({
  name: "WeatherApp",
  scenes: [
    scene.windowGroup("ContentView"),
    scene.settings("SettingsView", { platform: "macOS" }),
  ],
});
```

## Registry / Bundle Safety Errors

### AX600 — Bundle hash mismatch during `axint add`

Axint computes the bundle hash locally and compares it with the registry response before writing files.

**Typical diagnostic**

```text
[AX600] Bundle hash mismatch for @namespace/slug@1.0.0
```

**What it means**

- the published bytes changed
- the registry response is inconsistent
- or your local fetch response is tampered with

**Fix**

Do not force past it. Re-publish the package or inspect the registry response first.

## Swift Validation / Auto-Fix Errors (AX700+)

These apply when you validate generated or hand-written Swift with `axint swift validate`.

### AX701 — Missing `perform()`

**Trigger**

```swift
struct SendMessageIntent: AppIntent {
    static let title: LocalizedStringResource = "Send Message"
}
```

**Fix**

```swift
struct SendMessageIntent: AppIntent {
    static let title: LocalizedStringResource = "Send Message"

    func perform() async throws -> some IntentResult {
        .result()
    }
}
```

### AX703 — `@State let` should be mutable

**Trigger**

```swift
@State let count: Int = 0
```

**Fix**

```swift
@State var count: Int = 0
```

### AX716 — Missing `import AppIntents`

**Trigger**

```swift
struct SendMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "Send Message"
    func perform() async throws -> some IntentResult { .result() }
}
```

**Fix**

```swift
import AppIntents

struct SendMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "Send Message"
    func perform() async throws -> some IntentResult { .result() }
}
```

### AX717 — Missing `import WidgetKit`

**Trigger**

```swift
import SwiftUI

struct WeatherWidget: Widget {
    var body: some WidgetConfiguration { ... }
}
```

**Fix**

```swift
import SwiftUI
import WidgetKit

struct WeatherWidget: Widget {
    var body: some WidgetConfiguration { ... }
}
```

### AX718 — Missing `import SwiftUI`

**Trigger**

```swift
struct CounterView: View {
    @State var count: Int = 0
    var body: some View { Text("\\(count)") }
}
```

**Fix**

```swift
import SwiftUI

struct CounterView: View {
    @State var count: Int = 0
    var body: some View { Text("\\(count)") }
}
```

### AX719 — AppIntent inputs should use `@Parameter`

**Trigger**

```swift
import AppIntents

struct TrailCheck: AppIntent {
    static var title: LocalizedStringResource = "Trail Check"
    var trailName: String
    func perform() async throws -> some IntentResult { .result() }
}
```

**Fix**

```swift
import AppIntents

struct TrailCheck: AppIntent {
    static var title: LocalizedStringResource = "Trail Check"

    @Parameter(title: "Trail")
    var trailName: String

    func perform() async throws -> some IntentResult { .result() }
}
```

### AX720 — Legacy main-thread dispatch in Swift 6

**Trigger**

```swift
DispatchQueue.main.async {
    self.status = "done"
}
```

**Fix**

```swift
Task { @MainActor in
    self.status = "done"
}
```

## When To File A Bug

Please open an issue if:

- the diagnostic points at valid code
- the suggested fix is wrong
- `AX200`–`AX202` show up from generated Swift
- TypeScript and Python generate materially different Swift for the same feature

Repo: [github.com/agenticempire/axint/issues](https://github.com/agenticempire/axint/issues)
