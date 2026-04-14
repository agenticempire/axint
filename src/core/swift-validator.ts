/**
 * Swift Source Validator
 *
 * Parses existing Swift source files and checks them against a small set of
 * rules that catch common App Intent, Widget, and SwiftUI bugs that produce
 * opaque Xcode errors ("type does not conform to protocol ...").
 *
 * This is the inverse direction of the main axint pipeline. Instead of
 * generating Swift from TypeScript, we read already-written Swift and point
 * at problems the developer (or an LLM) will otherwise discover during a
 * ten-minute build failure.
 *
 * The parser is intentionally lightweight — line/brace tracking plus
 * anchored regex. We don't need a full SwiftSyntax tree for the rules we
 * ship; we need something that runs in Node without a Swift toolchain and
 * is fast enough to put inside a build pipeline.
 */

import type { Diagnostic } from "./types.js";
import { getDiagnostic } from "./diagnostics.js";

export interface SwiftValidationResult {
  file: string;
  diagnostics: Diagnostic[];
}

interface SwiftDeclaration {
  kind: "struct" | "class";
  name: string;
  conformances: string[];
  startLine: number;
  endLine: number;
  bodyStart: number;
  bodyEnd: number;
  source: string;
}

export function validateSwiftSource(source: string, file: string): SwiftValidationResult {
  const diagnostics: Diagnostic[] = [];
  const stripped = stripCommentsAndStrings(source);
  const decls = findTypeDeclarations(stripped, source);

  for (const decl of decls) {
    if (hasConformance(decl, "AppIntent")) {
      checkAppIntentHasPerform(decl, file, diagnostics);
      checkAppIntentHasTitle(decl, file, diagnostics);
      checkAppIntentHasDescription(decl, file, diagnostics);
    }
    if (hasConformance(decl, "Widget")) {
      checkWidgetHasBody(decl, file, diagnostics);
    }
    if (hasConformance(decl, "TimelineProvider")) {
      checkTimelineProviderMethods(decl, file, diagnostics);
    }
    if (hasConformance(decl, "TimelineEntry")) {
      checkTimelineEntryHasDate(decl, file, diagnostics);
    }
    if (hasConformance(decl, "AppShortcutsProvider")) {
      checkAppShortcutsProviderHasShortcuts(decl, file, diagnostics);
    }
    if (hasConformance(decl, "App")) {
      checkAppHasBody(decl, file, diagnostics);
    }
    if (hasConformance(decl, "View")) {
      checkPropertyWrappersAreVar(decl, file, diagnostics);
    }
  }

  return { file, diagnostics };
}

function hasConformance(decl: SwiftDeclaration, protocolName: string): boolean {
  return decl.conformances.some((c) => c === protocolName);
}

// ─── Rule: AX701 — AppIntent must have a perform() function ──────────

function checkAppIntentHasPerform(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasPerform = /\bfunc\s+perform\s*\(/.test(body);
  if (!hasPerform) {
    diagnostics.push(
      makeDiagnostic("AX701", file, decl.startLine, {
        message: `AppIntent '${decl.name}' is missing a perform() function`,
        suggestion:
          "Add: func perform() async throws -> some IntentResult { return .result() }",
      })
    );
  }
}

// ─── Rule: AX702 — Widget must expose `var body: some WidgetConfiguration` ─

function checkWidgetHasBody(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasBody = /\bvar\s+body\s*:\s*some\s+WidgetConfiguration\b/.test(body);
  if (!hasBody) {
    diagnostics.push(
      makeDiagnostic("AX702", file, decl.startLine, {
        message: `Widget '${decl.name}' is missing 'var body: some WidgetConfiguration'`,
        suggestion:
          "Every Widget must expose `var body: some WidgetConfiguration` — typically StaticConfiguration or AppIntentConfiguration.",
      })
    );
  }
}

// ─── Rules: AX703 / AX708–AX711 — property wrappers must be `var` ────
//
// SwiftUI requires @State, @Binding, @ObservedObject, @StateObject, and
// @EnvironmentObject to be declared with `var` because the wrapper needs
// mutable backing storage. `let` compiles in some cases and fails at
// runtime — precisely the class of bug Xcode's "type does not conform to
// View" errors bury.

const PROPERTY_WRAPPER_RULES: Array<{ wrapper: string; code: string }> = [
  { wrapper: "@State", code: "AX703" },
  { wrapper: "@Binding", code: "AX708" },
  { wrapper: "@ObservedObject", code: "AX709" },
  { wrapper: "@StateObject", code: "AX710" },
  { wrapper: "@EnvironmentObject", code: "AX711" },
];

function checkPropertyWrappersAreVar(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const bodyLineOffset = countNewlinesUpTo(decl.source, decl.bodyStart);
  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { wrapper, code } of PROPERTY_WRAPPER_RULES) {
      const pattern = new RegExp(`${escapeRegex(wrapper)}\\b[^=\\n]*\\blet\\s+\\w+`);
      if (pattern.test(line)) {
        diagnostics.push(
          makeDiagnostic(code, file, decl.startLine + bodyLineOffset + i, {
            message: `${wrapper} property in '${decl.name}' is declared with 'let' — SwiftUI requires 'var'`,
            suggestion: `Change \`${wrapper} let\` to \`${wrapper} var\`. SwiftUI needs mutable backing storage.`,
          })
        );
      }
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Rule: AX704 — AppIntent must have a `title` ─────────────────────

function checkAppIntentHasTitle(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasTitle = /\bstatic\s+var\s+title\s*:\s*LocalizedStringResource\b/.test(body);
  if (!hasTitle) {
    diagnostics.push(
      makeDiagnostic("AX704", file, decl.startLine, {
        message: `AppIntent '${decl.name}' is missing 'static var title: LocalizedStringResource'`,
        suggestion: `Add: static var title: LocalizedStringResource = "${decl.name}"`,
      })
    );
  }
}

// ─── Rule: AX715 — AppIntent description should not be empty ─────────

function checkAppIntentHasDescription(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  // Match `static var description [: IntentDescription] = IntentDescription("...")`.
  // Optional type annotation; capture the first string literal passed to IntentDescription(...).
  const declMatch = body.match(
    /\bstatic\s+var\s+description\b(?:\s*:\s*IntentDescription)?\s*=\s*IntentDescription\s*\(\s*"([^"]*)"/
  );
  if (declMatch && declMatch[1].trim() === "") {
    diagnostics.push(
      makeDiagnostic("AX715", file, decl.startLine, {
        message: `AppIntent '${decl.name}' has an empty description — Siri and Shortcuts won't surface it`,
        suggestion:
          "Give the intent a human-readable description so Siri can understand it.",
      })
    );
  }
}

// ─── Rule: AX705–AX707 — TimelineProvider required methods ───────────

function checkTimelineProviderMethods(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);

  if (!/\bfunc\s+placeholder\s*\(/.test(body)) {
    diagnostics.push(
      makeDiagnostic("AX705", file, decl.startLine, {
        message: `TimelineProvider '${decl.name}' is missing placeholder(in:)`,
        suggestion: "Add: func placeholder(in context: Context) -> Entry { ... }",
      })
    );
  }
  if (!/\bfunc\s+getSnapshot\s*\(/.test(body)) {
    diagnostics.push(
      makeDiagnostic("AX706", file, decl.startLine, {
        message: `TimelineProvider '${decl.name}' is missing getSnapshot(in:completion:)`,
        suggestion:
          "Add: func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { ... }",
      })
    );
  }
  if (!/\bfunc\s+getTimeline\s*\(/.test(body)) {
    diagnostics.push(
      makeDiagnostic("AX707", file, decl.startLine, {
        message: `TimelineProvider '${decl.name}' is missing getTimeline(in:completion:)`,
        suggestion:
          "Add: func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) { ... }",
      })
    );
  }
}

// ─── Rule: AX713 — TimelineEntry must have `let date: Date` ──────────

function checkTimelineEntryHasDate(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasDate = /\blet\s+date\s*:\s*Date\b/.test(body);
  if (!hasDate) {
    diagnostics.push(
      makeDiagnostic("AX713", file, decl.startLine, {
        message: `TimelineEntry '${decl.name}' is missing 'let date: Date'`,
        suggestion:
          "Every TimelineEntry must declare `let date: Date`. WidgetKit reads it directly.",
      })
    );
  }
}

// ─── Rule: AX712 — AppShortcutsProvider requires `appShortcuts` ──────

function checkAppShortcutsProviderHasShortcuts(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasShortcuts = /\bstatic\s+var\s+appShortcuts\s*:\s*\[AppShortcut\]/.test(body);
  if (!hasShortcuts) {
    diagnostics.push(
      makeDiagnostic("AX712", file, decl.startLine, {
        message: `AppShortcutsProvider '${decl.name}' is missing 'static var appShortcuts: [AppShortcut]'`,
        suggestion:
          "Add: static var appShortcuts: [AppShortcut] { [ AppShortcut(intent: ..., phrases: [...]) ] }",
      })
    );
  }
}

// ─── Rule: AX714 — @main App struct must have `var body: some Scene` ──

function checkAppHasBody(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasBody = /\bvar\s+body\s*:\s*some\s+Scene\b/.test(body);
  if (!hasBody) {
    diagnostics.push(
      makeDiagnostic("AX714", file, decl.startLine, {
        message: `App '${decl.name}' is missing 'var body: some Scene'`,
        suggestion:
          "Every App must expose `var body: some Scene` — typically WindowGroup { ContentView() }.",
      })
    );
  }
}

// ─── Declaration finder ──────────────────────────────────────────────

const DECL_REGEX =
  /\b(struct|class)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*<[^>]*>)?\s*(?::\s*([^{]+?))?\s*\{/g;

function findTypeDeclarations(stripped: string, original: string): SwiftDeclaration[] {
  const decls: SwiftDeclaration[] = [];
  let match: RegExpExecArray | null;

  DECL_REGEX.lastIndex = 0;
  while ((match = DECL_REGEX.exec(stripped)) !== null) {
    const [full, kind, name, conformanceList] = match;
    const bodyStart = match.index + full.length;
    const bodyEnd = findMatchingBrace(stripped, bodyStart - 1);
    if (bodyEnd === -1) continue;

    const startLine = 1 + countNewlinesUpTo(stripped, match.index);
    const endLine = 1 + countNewlinesUpTo(stripped, bodyEnd);

    decls.push({
      kind: kind as "struct" | "class",
      name,
      conformances: parseConformances(conformanceList ?? ""),
      startLine,
      endLine,
      bodyStart,
      bodyEnd,
      source: original,
    });
  }

  return decls;
}

function parseConformances(raw: string): string[] {
  return (
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      // Conformance fragments may be `AppIntent` or `Sendable & AppIntent` —
      // split on `&` so protocol composition still matches.
      .flatMap((s) => s.split("&").map((p) => p.trim()))
  );
}

function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function countNewlinesUpTo(source: string, index: number): number {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (source[i] === "\n") count++;
  }
  return count;
}

// ─── Comment & string stripping ──────────────────────────────────────
//
// We replace comments and string literals with spaces (preserving length and
// line count) so the declaration finder doesn't get fooled by keywords
// buried inside them.

function stripCommentsAndStrings(source: string): string {
  const out: string[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out.push("  ");
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out.push(source[i] === "\n" ? "\n" : " ");
        i++;
      }
      if (i < n) {
        out.push("  ");
        i += 2;
      }
      continue;
    }
    if (ch === '"') {
      // Handle multi-line string literals ("""...""") and regular ones.
      if (source.slice(i, i + 3) === '"""') {
        out.push("   ");
        i += 3;
        while (i < n && source.slice(i, i + 3) !== '"""') {
          out.push(source[i] === "\n" ? "\n" : " ");
          i++;
        }
        if (i < n) {
          out.push("   ");
          i += 3;
        }
        continue;
      }
      out.push(" ");
      i++;
      while (i < n && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < n) {
          out.push("  ");
          i += 2;
          continue;
        }
        out.push(source[i] === "\n" ? "\n" : " ");
        i++;
      }
      if (i < n) {
        out.push(" ");
        i++;
      }
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
}

// ─── Diagnostic helper ───────────────────────────────────────────────

function makeDiagnostic(
  code: string,
  file: string,
  line: number,
  overrides: { message?: string; suggestion?: string }
): Diagnostic {
  const info = getDiagnostic(code);
  return {
    code,
    severity: info?.severity ?? "error",
    message: overrides.message ?? info?.message ?? code,
    file,
    line,
    suggestion: overrides.suggestion,
  };
}
