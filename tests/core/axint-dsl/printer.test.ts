/**
 * Canonical printer tests.
 *
 * Four contracts the formatter holds:
 *
 *   1. Grammar productions — each canonical shape in spec/language/grammar.md
 *      round-trips byte-for-byte through `printDsl(parse(x))` when the input
 *      is already canonical. Each production gets its own tiny fixture so a
 *      regression points at exactly one construct.
 *
 *   2. Idempotence — `format(format(x)) === format(x)` for everything in the
 *      canonical corpus. Formatting twice must not drift.
 *
 *   3. Semantic equivalence — lowering the reprinted source produces an IR
 *      equal to the original modulo provenance spans. The formatter may
 *      rewrite shapes (inline `{ … }` → multi-line block), but it must never
 *      change meaning.
 *
 *   4. Canonical examples — every `spec/language/examples/*.axint` file is
 *      round-tripped byte-for-byte. This is the strongest form of the
 *      grammar-production check, and `readdirSync` auto-enrolls new examples.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { lower, parse, printDsl } from "../../../src/core/axint-dsl/index.js";
import type { Diagnostic } from "../../../src/core/axint-dsl/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "../../../spec/language/examples");

// ─── helpers ─────────────────────────────────────────────────────────

function format(source: string, sourceFile = "fixture.axint"): string {
  const parsed = parse(source, { sourceFile });
  const errors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    const lines = errors
      .map((d) => `${d.code} @ ${d.span.start.line}:${d.span.start.column}  ${d.message}`)
      .join("\n");
    throw new Error(`parse errors:\n${lines}`);
  }
  return printDsl(parsed.file);
}

/**
 * Strip `sourceFile` provenance and `undefined` holes, then sort keys so
 * `toEqual` compares structure only. Mirrors the canonicalizer in
 * round-trip.test.ts — inlined to keep this file self-contained.
 */
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

interface LowerSnapshot {
  readonly intents: unknown;
  readonly entities: unknown;
  readonly diagnostics: readonly DiagnosticSummary[];
}

interface DiagnosticSummary {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

function loweredSnapshot(source: string): LowerSnapshot {
  const parsed = parse(source, { sourceFile: "fixture.axint" });
  const lowered = lower(parsed.file, { sourceFile: "fixture.axint" });
  return {
    intents: canonicalize(lowered.intents),
    entities: canonicalize(lowered.entities),
    diagnostics: [...parsed.diagnostics, ...lowered.diagnostics].map(summarize),
  };
}

function summarize(d: Diagnostic): DiagnosticSummary {
  return { code: d.code, severity: d.severity, message: d.message };
}

// ─── production fixtures ─────────────────────────────────────────────

// Each entry's `source` is already in canonical form. The test asserts
// `format(parse(source)) === source`, so any regression in a single
// construct fails its own named test rather than one omnibus fixture.
const productions: readonly { readonly name: string; readonly source: string }[] = [
  {
    name: "minimal intent",
    source: `intent Hello {
  title: "Hello"
  description: "Say hello."
}
`,
  },
  {
    name: "domain meta",
    source: `intent A {
  title: "A"
  description: "a"
  domain: "messaging"
}
`,
  },
  {
    name: "category meta",
    source: `intent A {
  title: "A"
  description: "a"
  category: "focus"
}
`,
  },
  {
    name: "discoverable meta",
    source: `intent A {
  title: "A"
  description: "a"
  discoverable: true
}
`,
  },
  {
    name: "donateOnPerform meta",
    source: `intent A {
  title: "A"
  description: "a"
  donateOnPerform: false
}
`,
  },
  {
    name: "all meta clauses in grammar order",
    source: `intent A {
  title: "A"
  description: "a"
  domain: "productivity"
  category: "focus"
  discoverable: true
  donateOnPerform: false
}
`,
  },
  {
    name: "string param",
    source: `intent A {
  title: "A"
  description: "a"

  param who: string {
    description: "Name"
  }
}
`,
  },
  {
    name: "int param with default",
    source: `intent A {
  title: "A"
  description: "a"

  param level: int {
    description: "Level"
    default: 75
  }
}
`,
  },
  {
    name: "double param with decimal default",
    source: `intent A {
  title: "A"
  description: "a"

  param ratio: double {
    description: "Ratio"
    default: 1.5
  }
}
`,
  },
  {
    name: "decimal default keeps trailing zero",
    source: `intent A {
  title: "A"
  description: "a"

  param ratio: double {
    description: "Ratio"
    default: 1.0
  }
}
`,
  },
  {
    name: "float param",
    source: `intent A {
  title: "A"
  description: "a"

  param pitch: float {
    description: "Pitch"
  }
}
`,
  },
  {
    name: "boolean param with default",
    source: `intent A {
  title: "A"
  description: "a"

  param on: boolean {
    description: "On"
    default: true
  }
}
`,
  },
  {
    name: "date param",
    source: `intent A {
  title: "A"
  description: "a"

  param dueOn: date {
    description: "Due"
  }
}
`,
  },
  {
    name: "duration param with string default",
    source: `intent A {
  title: "A"
  description: "a"

  param length: duration {
    description: "Length"
    default: "1h"
  }
}
`,
  },
  {
    name: "url param",
    source: `intent A {
  title: "A"
  description: "a"

  param href: url {
    description: "Link"
  }
}
`,
  },
  {
    name: "optional param",
    source: `intent A {
  title: "A"
  description: "a"

  param note: string? {
    description: "Note"
  }
}
`,
  },
  {
    name: "array param",
    source: `intent A {
  title: "A"
  description: "a"

  param tags: [string] {
    description: "Tags"
  }
}
`,
  },
  {
    name: "optional array param",
    source: `intent A {
  title: "A"
  description: "a"

  param tags: [string]? {
    description: "Tags"
  }
}
`,
  },
  {
    name: "enum-typed param with identifier default",
    source: `enum Priority { low medium high }

intent A {
  title: "A"
  description: "a"

  param level: Priority {
    description: "Priority"
    default: medium
  }
}
`,
  },
  {
    name: "enum with single case",
    source: `enum Mode { single }
`,
  },
  {
    name: "dynamic options provider",
    source: `intent A {
  title: "A"
  description: "a"

  param region: string {
    description: "Region"
    options: dynamic RegionOptions
  }
}
`,
  },
  {
    name: "summary template",
    source: `intent A {
  title: "A"
  description: "a"

  param who: string {
    description: "Name"
  }

  summary: "Hi, \${who}!"
}
`,
  },
  {
    name: "summary when with otherwise",
    source: `intent A {
  title: "A"
  description: "a"

  param who: string {
    description: "Who"
  }

  param note: string? {
    description: "Note"
  }

  summary when note {
    then: "Hi \${who} — \${note}"
    otherwise: "Hi \${who}"
  }
}
`,
  },
  {
    name: "summary switch with default",
    source: `intent A {
  title: "A"
  description: "a"

  param mood: string {
    description: "Mood"
  }

  summary switch mood {
    case "happy": "Yay"
    case "sad": "Oh"
    default: "Noted"
  }
}
`,
  },
  {
    name: "summary switch with boolean case and nested when",
    source: `intent A {
  title: "A"
  description: "a"

  param flag: boolean {
    description: "Flag"
  }

  param note: string? {
    description: "Note"
  }

  summary switch flag {
    case true: summary when note {
      then: "On with \${note}"
      otherwise: "On"
    }
    case false: "Off"
    default: "Unknown"
  }
}
`,
  },
  {
    name: "returns primitive",
    source: `intent A {
  title: "A"
  description: "a"

  returns: string
}
`,
  },
  {
    name: "returns named entity",
    source: `entity Contact {
  display {
    title: name
  }

  property id: string {
    description: "ID"
  }

  property name: string {
    description: "Name"
  }

  query: property
}

intent A {
  title: "A"
  description: "a"

  returns: Contact
}
`,
  },
  {
    name: "returns array of entity",
    source: `entity Contact {
  display {
    title: name
  }

  property id: string {
    description: "ID"
  }

  property name: string {
    description: "Name"
  }

  query: property
}

intent A {
  title: "A"
  description: "a"

  returns: [Contact]
}
`,
  },
  {
    name: "entitlements block",
    source: `intent A {
  title: "A"
  description: "a"

  entitlements {
    "com.apple.developer.siri"
    "com.apple.developer.healthkit"
  }
}
`,
  },
  {
    name: "infoPlistKeys block",
    source: `intent A {
  title: "A"
  description: "a"

  infoPlistKeys {
    "NSCalendarsUsageDescription": "Needs calendar access."
    "NSLocationWhenInUseUsageDescription": "Needs location."
  }
}
`,
  },
  {
    name: "entity with display title only",
    source: `entity Thing {
  display {
    title: name
  }

  property id: string {
    description: "ID"
  }

  property name: string {
    description: "Name"
  }

  query: property
}
`,
  },
  {
    name: "entity with display subtitle and image",
    source: `entity Thing {
  display {
    title: name
    subtitle: region
    image: "figure.hiking"
  }

  property id: string {
    description: "ID"
  }

  property name: string {
    description: "Name"
  }

  property region: string {
    description: "Region"
  }

  query: property
}
`,
  },
  {
    name: "entity with all query",
    source: `entity Thing {
  display {
    title: name
  }

  property id: string {
    description: "ID"
  }

  property name: string {
    description: "Name"
  }

  query: all
}
`,
  },
  {
    name: "multiple declarations separated by one blank line",
    source: `enum Priority { low high }

intent A {
  title: "A"
  description: "a"
}

intent B {
  title: "B"
  description: "b"
}
`,
  },
];

describe("printer grammar productions", () => {
  for (const { name, source } of productions) {
    it(`${name} round-trips byte-for-byte`, () => {
      expect(format(source)).toBe(source);
    });
  }
});

// ─── canonical example corpus ────────────────────────────────────────

const exampleFiles = readdirSync(examplesDir)
  .filter((f) => f.endsWith(".axint"))
  .sort();

describe("printer canonical examples", () => {
  for (const file of exampleFiles) {
    it(`${file} round-trips byte-for-byte`, () => {
      const source = readFileSync(join(examplesDir, file), "utf-8");
      expect(format(source, file)).toBe(source);
    });
  }
});

// ─── idempotence ─────────────────────────────────────────────────────

// Formatting twice must match formatting once. Covers the canonical
// examples plus a couple of deliberately-messy inputs (inline single-line
// param block, extra blank lines) to prove the formatter converges on a
// single shape rather than tracking the input layout.
const messyInputs: readonly { readonly name: string; readonly source: string }[] = [
  {
    name: "inline single-line param body",
    source: `intent Plan {
  title: "Plan"
  description: "Plan a thing."

  param what: string { description: "Thing" }
  param where: string? { description: "Place" }
}
`,
  },
  {
    name: "extra blank lines around clauses",
    source: `intent Hello {


  title: "Hello"

  description: "Say hello."


}
`,
  },
];

describe("printer idempotence", () => {
  for (const file of exampleFiles) {
    it(`${file} is stable under repeated formatting`, () => {
      const source = readFileSync(join(examplesDir, file), "utf-8");
      const once = format(source, file);
      const twice = format(once, file);
      expect(twice).toBe(once);
    });
  }

  for (const { name, source } of messyInputs) {
    it(`${name} converges after one pass`, () => {
      const once = format(source);
      const twice = format(once);
      expect(twice).toBe(once);
    });
  }
});

// ─── semantic equivalence ────────────────────────────────────────────

// The formatter may rewrite layout — it must never change meaning. For
// every input source we lower both the original and the reprint, then
// compare the IR modulo provenance. Diagnostics must match in code +
// severity + message (spans are allowed to drift since reprints are
// re-numbered).
describe("printer preserves semantics", () => {
  for (const file of exampleFiles) {
    it(`${file} lowers to the same IR after reprinting`, () => {
      const source = readFileSync(join(examplesDir, file), "utf-8");
      const reprinted = format(source, file);
      expect(loweredSnapshot(reprinted)).toEqual(loweredSnapshot(source));
    });
  }

  for (const { name, source } of messyInputs) {
    it(`${name} lowers to the same IR after reprinting`, () => {
      const reprinted = format(source);
      expect(loweredSnapshot(reprinted)).toEqual(loweredSnapshot(source));
    });
  }
});
