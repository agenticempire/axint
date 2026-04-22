/**
 * Round-trip invariant: a `.axint` file and its equivalent TypeScript
 * `defineIntent` source must lower to the same IR, down to field values and
 * absent fields. This is the migration contract from spec/language/ir-mapping.md
 * §Round-trip invariant — without it the TS surface and the DSL drift and the
 * "byte-identical IR" promise becomes a lie.
 *
 * Each fixture pairs a hand-written `.axint` source with the `defineIntent`
 * TypeScript that the DSL is meant to be interchangeable with. The fixtures
 * cover the intersection of features both frontends currently support —
 * primitives, optionals, entity references, defaults, entitlements, infoPlist
 * keys, and the three `parameterSummary` shapes. Array-typed and enum-typed
 * params aren't here because the TS surface parser doesn't resolve them yet;
 * when it does, add paired fixtures and this test will tighten automatically.
 */
import { describe, expect, it } from "vitest";
import { lower, parse } from "../../../src/core/axint-dsl/index.js";
import { parseIntentSource } from "../../../src/core/parser.js";
import type { IRIntent } from "../../../src/core/types.js";

interface Fixture {
  readonly name: string;
  readonly axint: string;
  readonly ts: string;
}

const fixtures: readonly Fixture[] = [
  {
    name: "minimal intent",
    axint: `intent Hello {
  title: "Hello"
  description: "A minimal App Intent that says hello."
}`,
    ts: `import { defineIntent } from "@axint/compiler";
export default defineIntent({
  name: "Hello",
  title: "Hello",
  description: "A minimal App Intent that says hello.",
});`,
  },
  {
    name: "string params with optional and domain",
    axint: `intent SendMessage {
  title: "Send Message"
  description: "Sends a message."
  domain: "messaging"

  param recipient: string {
    description: "Who to send the message to"
  }

  param urgent: boolean? {
    description: "Mark as urgent"
  }
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Sends a message.",
  domain: "messaging",
  params: {
    recipient: param.string("Who to send the message to"),
    urgent: param.boolean("Mark as urgent", { required: false }),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "int default and entitlements",
    axint: `intent SetBrightness {
  title: "Set Brightness"
  description: "Sets the brightness."

  param level: int {
    description: "Brightness percentage"
    default: 75
  }

  entitlements {
    "com.apple.developer.siri"
  }
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "SetBrightness",
  title: "Set Brightness",
  description: "Sets the brightness.",
  entitlements: ["com.apple.developer.siri"],
  params: {
    level: param.int("Brightness percentage", { default: 75 }),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "date, duration, url with two optionals",
    axint: `intent LogHealth {
  title: "Log Health"
  description: "Logs a health event."

  param occurredAt: date {
    description: "When the event occurred"
  }

  param length: duration {
    description: "How long it lasted"
  }

  param source: url? {
    description: "Source URL"
  }

  param note: string? {
    description: "Optional note"
  }
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "LogHealth",
  title: "Log Health",
  description: "Logs a health event.",
  params: {
    occurredAt: param.date("When the event occurred"),
    length: param.duration("How long it lasted"),
    source: param.url("Source URL", { required: false }),
    note: param.string("Optional note", { required: false }),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "entitlements and infoPlistKeys",
    axint: `intent CreateEvent {
  title: "Create Event"
  description: "Creates a calendar event."
  domain: "productivity"

  param eventTitle: string {
    description: "Event title"
  }

  param startDate: date {
    description: "Event start"
  }

  param length: duration {
    description: "Event duration"
  }

  entitlements {
    "com.apple.developer.siri"
  }

  infoPlistKeys {
    "NSCalendarsUsageDescription": "Axint needs calendar access."
  }
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "CreateEvent",
  title: "Create Event",
  description: "Creates a calendar event.",
  domain: "productivity",
  entitlements: ["com.apple.developer.siri"],
  infoPlistKeys: {
    NSCalendarsUsageDescription: "Axint needs calendar access.",
  },
  params: {
    eventTitle: param.string("Event title"),
    startDate: param.date("Event start"),
    length: param.duration("Event duration"),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "category, discoverable, donateOnPerform",
    axint: `intent Dim {
  title: "Dim Lights"
  description: "Dims the lights."
  category: "smart-home"
  discoverable: true
  donateOnPerform: false

  param level: int {
    description: "Brightness 0-100"
  }
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "Dim",
  title: "Dim Lights",
  description: "Dims the lights.",
  category: "smart-home",
  isDiscoverable: true,
  donateOnPerform: false,
  params: {
    level: param.int("Brightness 0-100"),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "simple parameterSummary",
    axint: `intent Greet {
  title: "Greet"
  description: "Greet someone."

  param who: string {
    description: "Name"
  }

  summary: "Hi, \${who}!"
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "Greet",
  title: "Greet",
  description: "Greet someone.",
  parameterSummary: "Hi, \${who}!",
  params: {
    who: param.string("Name"),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "when parameterSummary",
    axint: `intent Plan {
  title: "Plan"
  description: "Plan a thing."

  param what: string { description: "Thing" }
  param where: string? { description: "Place" }

  summary when where {
    then: "Plan \${what} in \${where}"
    otherwise: "Plan \${what}"
  }
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "Plan",
  title: "Plan",
  description: "Plan a thing.",
  parameterSummary: {
    when: "where",
    then: "Plan \${what} in \${where}",
    otherwise: "Plan \${what}",
  },
  params: {
    what: param.string("Thing"),
    where: param.string("Place", { required: false }),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "switch parameterSummary with default",
    axint: `intent Rate {
  title: "Rate"
  description: "Rate it."

  param mood: string {
    description: "Mood"
  }

  summary switch mood {
    case "happy": "Thanks!"
    case "sad": "Sorry to hear"
    default: "Noted"
  }
}`,
    ts: `import { defineIntent, param } from "@axint/compiler";
export default defineIntent({
  name: "Rate",
  title: "Rate",
  description: "Rate it.",
  parameterSummary: {
    switch: "mood",
    cases: [
      { value: "happy", summary: "Thanks!" },
      { value: "sad", summary: "Sorry to hear" },
    ],
    default: "Noted",
  },
  params: {
    mood: param.string("Mood"),
  },
  perform: async () => ({}),
});`,
  },
  {
    name: "entity reference",
    axint: `entity Trail {
  display {
    title: name
    subtitle: region
    image: "figure.hiking"
  }

  property id: string {
    description: "Trail ID"
  }

  property name: string {
    description: "Trail name"
  }

  property region: string {
    description: "Region"
  }

  query: property
}

intent PlanTrail {
  title: "Plan Trail"
  description: "Plan a trail outing."

  param trail: Trail {
    description: "Trail to open"
  }
}`,
    ts: `import { defineIntent, defineEntity, param } from "@axint/compiler";

defineEntity({
  name: "Trail",
  display: { title: "name", subtitle: "region", image: "figure.hiking" },
  properties: {
    id: param.string("Trail ID"),
    name: param.string("Trail name"),
    region: param.string("Region"),
  },
  query: "property",
});

export default defineIntent({
  name: "PlanTrail",
  title: "Plan Trail",
  description: "Plan a trail outing.",
  params: {
    trail: param.entity("Trail", "Trail to open"),
  },
  perform: async () => ({}),
});`,
  },
];

// The DSL and TS paths both stamp the intent with the sourceFile they were
// given. That field isn't part of the contract — it's provenance. Strip it
// before comparing, along with any undefined-valued field JSON.stringify
// already hides but structural equality doesn't.
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (key === "sourceFile") continue;
    const v = source[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

function lowerDsl(source: string): IRIntent {
  const parsed = parse(source, { sourceFile: "fixture.axint" });
  const lowered = lower(parsed.file, { sourceFile: "fixture.axint" });
  const diagnostics = [...parsed.diagnostics, ...lowered.diagnostics];
  if (diagnostics.length > 0) {
    const lines = diagnostics
      .map((d) => `${d.code} @ ${d.span.start.line}:${d.span.start.column}  ${d.message}`)
      .join("\n");
    throw new Error(`DSL fixture produced diagnostics:\n${lines}`);
  }
  const [intent] = lowered.intents;
  if (!intent) throw new Error("DSL fixture produced no intent");
  return intent;
}

describe("axint-dsl round-trip", () => {
  for (const { name, axint, ts } of fixtures) {
    it(name, () => {
      const fromDsl = canonicalize(lowerDsl(axint));
      const fromTs = canonicalize(parseIntentSource(ts, "fixture.ts"));
      expect(fromDsl).toEqual(fromTs);
    });
  }
});
