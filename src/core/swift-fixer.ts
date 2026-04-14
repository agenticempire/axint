/**
 * Swift Fixer
 *
 * Takes a Swift source file plus the diagnostics reported by the Swift
 * validator and rewrites the source to fix the mechanical issues.
 *
 * A fix is "mechanical" when we can produce the right replacement without
 * understanding semantics — e.g. `@State let` → `@State var`, or injecting
 * a stub `perform()` into an AppIntent struct.
 *
 * Non-mechanical fixes (e.g. inventing a good description string) are
 * skipped; the diagnostic remains on the report so the developer sees it.
 */

import type { Diagnostic } from "./types.js";
import { validateSwiftSource } from "./swift-validator.js";

export interface FixResult {
  source: string;
  fixed: Diagnostic[];
  remaining: Diagnostic[];
}

export function fixSwiftSource(source: string, file: string): FixResult {
  const initial = validateSwiftSource(source, file).diagnostics;

  let out = source;
  const fixed: Diagnostic[] = [];

  for (const d of initial) {
    const rewrite = applyFix(out, d);
    if (rewrite !== null) {
      out = rewrite;
      fixed.push(d);
    }
  }

  const remaining = validateSwiftSource(out, file).diagnostics;
  return { source: out, fixed, remaining };
}

function applyFix(source: string, d: Diagnostic): string | null {
  switch (d.code) {
    case "AX703":
      return fixStateLet(source, "@State");
    case "AX708":
      return fixStateLet(source, "@Binding");
    case "AX709":
      return fixStateLet(source, "@ObservedObject");
    case "AX710":
      return fixStateLet(source, "@StateObject");
    case "AX711":
      return fixStateLet(source, "@EnvironmentObject");
    case "AX701":
      return injectPerform(source, d);
    case "AX702":
      return injectWidgetBody(source, d);
    case "AX704":
      return injectIntentTitle(source, d);
    case "AX714":
      return injectAppBody(source, d);
    case "AX713":
      return injectTimelineEntryDate(source, d);
    default:
      return null;
  }
}

// ─── @Wrapper let → @Wrapper var ─────────────────────────────────────

function fixStateLet(source: string, wrapper: string): string {
  const pattern = new RegExp(`(${escape(wrapper)}\\b[^=\\n]*?)\\blet(\\s+\\w+)`, "g");
  const next = source.replace(pattern, "$1var$2");
  return next === source ? source : next;
}

// ─── Injectors ───────────────────────────────────────────────────────

function injectPerform(source: string, d: Diagnostic): string | null {
  const stub = `    func perform() async throws -> some IntentResult {\n        return .result()\n    }`;
  return injectAtStructNamed(source, d, /\bAppIntent\b/, stub);
}

function injectWidgetBody(source: string, d: Diagnostic): string | null {
  const stub = `    var body: some WidgetConfiguration {\n        EmptyWidgetConfiguration()\n    }`;
  return injectAtStructNamed(source, d, /\bWidget\b/, stub);
}

function injectIntentTitle(source: string, d: Diagnostic): string | null {
  const stub = `    static var title: LocalizedStringResource = "Intent"`;
  return injectAtStructNamed(source, d, /\bAppIntent\b/, stub);
}

function injectAppBody(source: string, d: Diagnostic): string | null {
  const stub = `    var body: some Scene {\n        WindowGroup { ContentView() }\n    }`;
  return injectAtStructNamed(source, d, /\bApp\b/, stub);
}

function injectTimelineEntryDate(source: string, d: Diagnostic): string | null {
  const stub = `    let date: Date`;
  return injectAtStructNamed(source, d, /\bTimelineEntry\b/, stub);
}

/**
 * Find the struct declaration that matched the diagnostic's line, then
 * inject `stub` as the first statement inside the struct body.
 */
function injectAtStructNamed(
  source: string,
  d: Diagnostic,
  conformance: RegExp,
  stub: string
): string | null {
  const lines = source.split("\n");
  if (!d.line || d.line > lines.length) return null;

  // The diagnostic is anchored to the `struct X: Protocol {` line. Walk
  // forward from there to find the opening brace.
  const anchorLineIdx = d.line - 1;
  let braceLine = -1;
  for (let i = anchorLineIdx; i < lines.length && i < anchorLineIdx + 5; i++) {
    const col = lines[i].indexOf("{");
    if (col !== -1 && conformance.test(lines[i])) {
      braceLine = i;
      break;
    }
    if (col !== -1 && i > anchorLineIdx) {
      braceLine = i;
      break;
    }
  }
  if (braceLine === -1) return null;

  const before = lines.slice(0, braceLine + 1);
  const after = lines.slice(braceLine + 1);
  return [...before, stub, ...after].join("\n");
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
