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
import {
  type SwiftDeclaration,
  countNewlinesUpTo,
  escapeRegex,
  findMatchingBrace,
  findTypeDeclarations,
  hasConformance,
  makeDiagnostic,
  stripCommentsAndStrings,
} from "./swift-ast.js";
import { checkConcurrency } from "./swift-validator-concurrency.js";
import { checkLiveActivities } from "./swift-validator-live-activities.js";

export interface SwiftValidationResult {
  file: string;
  diagnostics: Diagnostic[];
}

export function validateSwiftSource(source: string, file: string): SwiftValidationResult {
  const diagnostics: Diagnostic[] = [];
  const stripped = stripCommentsAndStrings(source);
  const decls = findTypeDeclarations(stripped, source);

  checkRequiredFrameworkImports(decls, source, file, diagnostics);

  for (const decl of decls) {
    if (hasConformance(decl, "AppIntent")) {
      checkAppIntentHasPerform(decl, file, diagnostics);
      checkAppIntentHasTitle(decl, file, diagnostics);
      checkAppIntentHasDescription(decl, file, diagnostics);
      checkAppIntentParametersUseParameterWrapper(decl, file, diagnostics);
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

  checkConcurrency(decls, source, file, diagnostics);
  checkLiveActivities(decls, source, file, diagnostics);
  checkContainerAccessibilityIdentifierPropagation(source, stripped, file, diagnostics);

  return { file, diagnostics };
}

const ACCESSIBILITY_CONTAINER_NAMES = [
  "VStack",
  "HStack",
  "ZStack",
  "LazyVStack",
  "LazyHStack",
  "LazyVGrid",
  "LazyHGrid",
  "Grid",
  "Group",
  "ScrollView",
  "List",
  "Form",
  "Section",
  "NavigationStack",
  "NavigationSplitView",
  "HSplitView",
  "VSplitView",
];

function checkContainerAccessibilityIdentifierPropagation(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const containerPattern = ACCESSIBILITY_CONTAINER_NAMES.join("|");
  const re = new RegExp(
    `\\b(${containerPattern})\\s*(?:<[^>{}]*>)?\\s*(?:\\([^{}]*\\))?\\s*\\{`,
    "g"
  );
  let match: RegExpExecArray | null;

  while ((match = re.exec(stripped)) !== null) {
    const [full, containerName] = match;
    const openBraceIndex = match.index + full.lastIndexOf("{");
    const closeBraceIndex = findMatchingBrace(stripped, openBraceIndex);
    if (closeBraceIndex === -1) continue;

    const body = stripped.slice(openBraceIndex + 1, closeBraceIndex);
    if (!/\.accessibilityIdentifier\s*\(/.test(body)) continue;

    const after = stripped.slice(closeBraceIndex + 1, closeBraceIndex + 900);
    const modifierChain = after.match(
      /^\s*(?:(?:\.[A-Za-z_][A-Za-z0-9_]*\s*(?:\([^)]*\))?\s*)*)\.accessibilityIdentifier\s*\(/s
    );
    if (!modifierChain) continue;

    const identifierOffset = modifierChain[0].lastIndexOf(".accessibilityIdentifier");
    const absoluteOffset = closeBraceIndex + 1 + identifierOffset;
    diagnostics.push(
      makeDiagnostic("AX736", file, 1 + countNewlinesUpTo(source, absoluteOffset), {
        message: `${containerName} has an accessibilityIdentifier while nested controls also define identifiers; UI tests may match the container and hide child identifiers`,
        suggestion:
          "Put the identifier on the specific button/text/row the test needs, or assert on a visible child element instead of tagging the whole container.",
      })
    );
  }
}

function checkRequiredFrameworkImports(
  decls: SwiftDeclaration[],
  source: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const hasAppIntentSurface = decls.some(
    (decl) =>
      hasConformance(decl, "AppIntent") || hasConformance(decl, "AppShortcutsProvider")
  );
  const hasWidgetSurface = decls.some(
    (decl) =>
      hasConformance(decl, "Widget") ||
      hasConformance(decl, "TimelineProvider") ||
      hasConformance(decl, "TimelineEntry")
  );
  const hasSwiftUISurface = decls.some(
    (decl) => hasConformance(decl, "View") || hasConformance(decl, "App")
  );

  const hasAppIntentsImport = /^\s*import\s+AppIntents\b/m.test(source);
  const hasWidgetKitImport = /^\s*import\s+WidgetKit\b/m.test(source);
  const hasSwiftUIImport = /^\s*import\s+SwiftUI\b/m.test(source);

  if (hasAppIntentSurface && !hasAppIntentsImport) {
    diagnostics.push(
      makeDiagnostic("AX716", file, 1, {
        message:
          "This file declares AppIntent-facing types but does not import AppIntents",
        suggestion: "Add `import AppIntents` at the top of the file.",
      })
    );
  }

  if (hasWidgetSurface && !hasWidgetKitImport) {
    diagnostics.push(
      makeDiagnostic("AX717", file, 1, {
        message:
          "This file declares WidgetKit-facing types but does not import WidgetKit",
        suggestion: "Add `import WidgetKit` at the top of the file.",
      })
    );
  }

  if (hasSwiftUISurface && !hasSwiftUIImport) {
    diagnostics.push(
      makeDiagnostic("AX718", file, 1, {
        message: "This file declares SwiftUI-facing types but does not import SwiftUI",
        suggestion: "Add `import SwiftUI` at the top of the file.",
      })
    );
  }
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

// ─── Rule: AX704 — AppIntent must have a `title` ─────────────────────

function checkAppIntentHasTitle(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasTitle = /\bstatic\s+var\s+title\s*:\s*LocalizedStringResource\b/.test(body);
  const hasLetTitle = /\bstatic\s+let\s+title\s*:\s*LocalizedStringResource\b/.test(body);
  if (!hasTitle) {
    diagnostics.push(
      makeDiagnostic("AX704", file, decl.startLine, {
        message: hasLetTitle
          ? `AppIntent '${decl.name}' declares title with 'static let'; AppIntents expect 'static var title: LocalizedStringResource'`
          : `AppIntent '${decl.name}' is missing 'static var title: LocalizedStringResource'`,
        suggestion: hasLetTitle
          ? "Change `static let title` to `static var title` and keep the existing title value."
          : `Add: static var title: LocalizedStringResource = "${decl.name}"`,
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

// ─── Rule: AX719 — AppIntent input properties should use @Parameter ──

const APP_INTENT_INSTANCE_PROPERTY =
  /^\s*(?:public|internal|private|fileprivate|open)?\s*(?:var|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=/{\n]+?)(?:\s*=.*)?$/;

const APP_INTENT_KNOWN_NON_PARAMETER_PROPERTIES = new Set([
  "openAppWhenRun",
  "authenticationPolicy",
  "isDiscoverable",
]);

function checkAppIntentParametersUseParameterWrapper(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const bodyLineOffset = countNewlinesUpTo(decl.source, decl.bodyStart);
  const lines = body.split("\n");

  const pendingAttributes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      pendingAttributes.length = 0;
      continue;
    }

    if (trimmed.startsWith("@")) {
      const inline = trimmed.match(/^(@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)\s+(.*)$/);
      if (inline && /\b(?:var|let)\s+/.test(inline[2] ?? "")) {
        pendingAttributes.push(inline[1]!);
        line = line.replace(inline[1]!, "");
      } else {
        pendingAttributes.push(trimmed);
        continue;
      }
    }

    if (
      /^\s*(?:static|func|init\b|subscript\b|typealias\b|enum\b|struct\b|class\b|actor\b)/.test(
        line
      )
    ) {
      pendingAttributes.length = 0;
      continue;
    }

    const match = line.match(APP_INTENT_INSTANCE_PROPERTY);
    if (!match) {
      pendingAttributes.length = 0;
      continue;
    }

    const [, name] = match;
    const hasInitializer = /=/.test(line);
    const hasParameterAttribute = pendingAttributes.some((attr) =>
      attr.startsWith("@Parameter")
    );
    const hasStateAttribute = pendingAttributes.some((attr) => attr.startsWith("@State"));

    if (hasStateAttribute) {
      diagnostics.push(
        makeDiagnostic("AX719", file, decl.startLine + bodyLineOffset + i, {
          message: `AppIntent property '${name}' uses @State, which is only valid for SwiftUI views`,
          suggestion: `Use @Parameter for user input, or remove @State and initialize \`${name}\` if it is internal intent state.`,
        })
      );
      pendingAttributes.length = 0;
      continue;
    }

    if (
      !hasInitializer &&
      !hasParameterAttribute &&
      !APP_INTENT_KNOWN_NON_PARAMETER_PROPERTIES.has(name)
    ) {
      diagnostics.push(
        makeDiagnostic("AX719", file, decl.startLine + bodyLineOffset + i, {
          message: `AppIntent property '${name}' looks like an input but is missing @Parameter`,
          suggestion: `Add \`@Parameter(title: "${humanizeIdentifier(
            name
          )}")\` above \`${name}\`, or initialize it if it is internal state rather than user input.`,
        })
      );
    }

    pendingAttributes.length = 0;
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
  const dateMatches = body.match(/\blet\s+date\s*:\s*Date\b/g) ?? [];
  const hasDate = dateMatches.length > 0;
  if (!hasDate) {
    diagnostics.push(
      makeDiagnostic("AX713", file, decl.startLine, {
        message: `TimelineEntry '${decl.name}' is missing 'let date: Date'`,
        suggestion:
          "Every TimelineEntry must declare `let date: Date`. WidgetKit reads it directly.",
      })
    );
  }
  if (dateMatches.length > 1) {
    diagnostics.push(
      makeDiagnostic("AX750", file, decl.startLine, {
        message: `TimelineEntry '${decl.name}' declares 'let date: Date' more than once`,
        suggestion:
          "Keep exactly one `let date: Date` property. WidgetKit requires it, but duplicate stored properties do not compile.",
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

function humanizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
