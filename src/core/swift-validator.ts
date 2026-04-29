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

  checkRequiredFrameworkImports(decls, source, stripped, file, diagnostics);

  for (const decl of decls) {
    checkDuplicateStoredProperties(decl, file, diagnostics);

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
      checkViewBodyReferencesDeclaredProperties(decl, file, diagnostics);
    }
  }

  checkConcurrency(decls, source, file, diagnostics);
  checkLiveActivities(decls, source, file, diagnostics);
  checkContainerAccessibilityIdentifierPropagation(source, stripped, file, diagnostics);
  checkInteractiveInputOverlayHitTesting(source, stripped, file, diagnostics);
  checkInvalidSwiftUIFrameOverloads(source, stripped, file, diagnostics);
  checkTypeErasedSwiftUIModifierChains(source, stripped, file, diagnostics);
  checkOpaqueViewReturnsNeedExplicitReturn(source, stripped, file, diagnostics);

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

function checkInteractiveInputOverlayHitTesting(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const lines = source.split("\n");
  const strippedLines = stripped.split("\n");

  for (let i = 0; i < strippedLines.length; i++) {
    const inputMatch = strippedLines[i]?.match(
      /\b(TextField|TextEditor|SecureField)\s*\(/
    );
    if (!inputMatch) continue;

    const windowStart = i;
    const windowEnd = Math.min(strippedLines.length, i + 18);
    const windowLines = strippedLines.slice(windowStart, windowEnd);
    const windowText = windowLines.join("\n");

    if (!/\.overlay\s*(?:\(|\{)/.test(windowText)) continue;
    if (/\.allowsHitTesting\s*\(\s*false\s*\)/.test(windowText)) continue;

    const overlayLineOffset = windowLines.findIndex((line) =>
      /\.overlay\s*(?:\(|\{)/.test(line)
    );
    const overlayLine =
      overlayLineOffset >= 0 ? windowStart + overlayLineOffset + 1 : i + 1;
    const inputKind = inputMatch[1];
    const nearbySource = lines.slice(windowStart, windowEnd).join("\n");

    if (!/\boverlay\b/i.test(nearbySource)) continue;

    diagnostics.push(
      makeDiagnostic("AX764", file, overlayLine, {
        message: `${inputKind} has an overlay without .allowsHitTesting(false), which can block taps, focus, or text entry`,
        suggestion:
          "If the overlay is decorative or placeholder-only, add `.allowsHitTesting(false)` to the overlay content. Otherwise move the hit target so it does not sit on top of the text input.",
      })
    );
  }
}

function checkInvalidSwiftUIFrameOverloads(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const frameCall = /\.frame\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = frameCall.exec(stripped)) !== null) {
    const openParen = stripped.indexOf("(", match.index);
    const closeParen = findMatchingParen(stripped, openParen);
    if (openParen === -1 || closeParen === -1) continue;

    const args = stripped.slice(openParen + 1, closeParen);
    if (!/\bmaxWidth\s*:/.test(args) || !/\bheight\s*:/.test(args)) continue;

    diagnostics.push(
      makeDiagnostic("AX765", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "SwiftUI frame(maxWidth:height:alignment:) is not a valid overload and will fail Xcode compilation",
        suggestion:
          "Use `.frame(maxWidth:alignment:)` and chain a separate `.frame(height:alignment:)`, or use `maxHeight:` when you intend the flexible frame overload.",
      })
    );
  }
}

const TYPE_ERASING_SWIFTUI_MODIFIERS = new Set([
  "labelStyle",
  "buttonStyle",
  "controlSize",
  "background",
  "overlay",
  "mask",
  "clipShape",
  "popover",
  "sheet",
  "toolbar",
]);

const KNOWN_SWIFTUI_VIEW_MODIFIERS = new Set([
  "accessibilityIdentifier",
  "accessibilityLabel",
  "accessibilityHint",
  "accessibilityValue",
  "animation",
  "bold",
  "clipShape",
  "controlSize",
  "disabled",
  "font",
  "foregroundColor",
  "foregroundStyle",
  "frame",
  "help",
  "id",
  "labelStyle",
  "layoutPriority",
  "opacity",
  "padding",
  "position",
  "shadow",
  "tint",
]);

function checkTypeErasedSwiftUIModifierChains(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const expressionStart = /\b(Label|Button|Image|TextField|TextEditor)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = expressionStart.exec(stripped)) !== null) {
    const callOpen = stripped.indexOf("(", match.index);
    const callClose = findMatchingParen(stripped, callOpen);
    if (callOpen === -1 || callClose === -1) continue;

    const chain = stripped.slice(callClose + 1, callClose + 900);
    const modifiers = collectLeadingModifierChain(chain);
    const firstTypeEraser = modifiers.findIndex((modifier) =>
      TYPE_ERASING_SWIFTUI_MODIFIERS.has(modifier.name)
    );
    if (firstTypeEraser < 0) continue;

    const risky = modifiers
      .slice(firstTypeEraser + 1)
      .find((modifier) => looksLikeProjectSpecificModifier(modifier.name));
    if (!risky) continue;

    diagnostics.push(
      makeDiagnostic(
        "AX766",
        file,
        1 + countNewlinesUpTo(source, callClose + 1 + risky.offset),
        {
          message: `.${risky.name}(...) appears after .${modifiers[firstTypeEraser]!.name}(...), which can erase the concrete SwiftUI type before a project-specific modifier runs`,
          suggestion:
            "Move the project-specific modifier before the type-erasing SwiftUI modifier, or rewrite it as a generic View modifier so Xcode does not report `value of type 'some View' has no member ...`.",
        }
      )
    );
  }
}

function checkOpaqueViewReturnsNeedExplicitReturn(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const declaration =
    /\b(?:(func)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)|(var)\s+([A-Za-z_][A-Za-z0-9_]*))\s*(?:async\s+)?(?:throws\s+)?(?:->|:)\s*some\s+View\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = declaration.exec(stripped)) !== null) {
    const kind = match[1] ? "func" : "var";
    const name = match[2] ?? match[4] ?? "unnamed";
    if (kind === "var" && name === "body") continue;
    if (hasViewBuilderAttribute(stripped, match.index)) continue;

    const openBrace = stripped.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(stripped, openBrace);
    if (openBrace === -1 || closeBrace === -1) continue;

    const body = stripped.slice(openBrace + 1, closeBrace);
    if (!/\b(?:let|var)\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(body)) continue;
    if (hasTopLevelReturn(body)) continue;
    if (!endsWithLikelyViewExpression(body)) continue;

    diagnostics.push(
      makeDiagnostic("AX767", file, 1 + countNewlinesUpTo(source, match.index), {
        message: `${kind} '${name}' returns some View after local declarations but has no explicit return`,
        suggestion:
          "Add `return` before the final view expression, or mark the helper with `@ViewBuilder` if it intentionally contains multiple result-builder statements.",
      })
    );
  }
}

function hasViewBuilderAttribute(stripped: string, declarationIndex: number): boolean {
  const prefix = stripped.slice(Math.max(0, declarationIndex - 180), declarationIndex);
  return /@ViewBuilder\s*(?:\n|\s)*(?:private|fileprivate|internal|public|static|\s)*$/.test(
    prefix
  );
}

function hasTopLevelReturn(body: string): boolean {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (ch === "}" || ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (
      depth === 0 &&
      /\breturn\b/.test(body.slice(i, i + 12)) &&
      !/[A-Za-z0-9_]/.test(body[i - 1] ?? "") &&
      !/[A-Za-z0-9_]/.test(body[i + 6] ?? "")
    ) {
      return true;
    }
  }
  return false;
}

function endsWithLikelyViewExpression(body: string): boolean {
  const cleaned = body.trim().replace(/;+\s*$/, "");
  return /(?:VStack|HStack|ZStack|Text|Button|ScrollView|List|LazyVStack|LazyHStack|Group|Section|ForEach|AnyView|Image|Label|Form|NavigationStack|NavigationSplitView|HSplitView|VSplitView)\s*(?:\(|\{)/.test(
    cleaned
  );
}

function collectLeadingModifierChain(
  source: string
): Array<{ name: string; offset: number }> {
  const modifiers: Array<{ name: string; offset: number }> = [];
  let index = 0;

  while (index < source.length) {
    const prefix = source.slice(index).match(/^\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*/);
    if (!prefix) break;
    const name = prefix[1]!;
    const nameOffset = index + prefix[0].lastIndexOf(name);
    index += prefix[0].length;

    if (source[index] === "(") {
      const close = findMatchingParen(source, index);
      if (close === -1) break;
      index = close + 1;
    } else if (source[index] === "{") {
      const close = findMatchingBrace(source, index);
      if (close === -1) break;
      index = close + 1;
    }

    modifiers.push({ name, offset: nameOffset });
  }

  return modifiers;
}

function looksLikeProjectSpecificModifier(name: string): boolean {
  if (KNOWN_SWIFTUI_VIEW_MODIFIERS.has(name)) return false;
  if (!/^[a-z][A-Za-z0-9_]*$/.test(name)) return false;
  return /(?:Icon|Pill|Card|Badge|Chip|Row|Tile|Avatar|Swarm|Agent|Project)/.test(name);
}

function findMatchingParen(source: string, openIndex: number): number {
  if (openIndex < 0 || source[openIndex] !== "(") return -1;
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function checkDuplicateStoredProperties(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (!["struct", "class", "actor"].includes(decl.kind)) return;

  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const strippedBody = stripCommentsAndStrings(body);
  const lines = body.split("\n");
  const strippedLines = strippedBody.split("\n");
  const seen = new Map<string, number>();
  let depth = 0;

  for (let i = 0; i < strippedLines.length; i++) {
    const strippedLine = strippedLines[i] ?? "";
    const rawLine = lines[i] ?? "";
    const trimmed = strippedLine.trim();

    if (
      depth === 0 &&
      trimmed &&
      !trimmed.includes("{") &&
      !trimmed.includes("}") &&
      !/\bfunc\b|\binit\b|\bsubscript\b/.test(trimmed)
    ) {
      const match = rawLine.match(
        /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)*(?:(?:public|private|fileprivate|internal|open|static|weak|unowned|nonisolated)\s+)*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/
      );
      const name = match?.[1];
      if (name) {
        const previousLine = seen.get(name);
        if (previousLine !== undefined) {
          diagnostics.push(
            makeDiagnostic("AX737", file, decl.startLine + i, {
              message: `${decl.kind} '${decl.name}' declares stored property '${name}' more than once`,
              suggestion: `Remove the duplicate \`${name}\` declaration. The first declaration appears near line ${previousLine}.`,
            })
          );
        } else {
          seen.set(name, decl.startLine + i);
        }
      }
    }

    for (const ch of strippedLine) {
      if (ch === "{") depth++;
      if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }
}

function checkRequiredFrameworkImports(
  decls: SwiftDeclaration[],
  source: string,
  stripped: string,
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
  const hasAppKitImport = /^\s*import\s+AppKit\b/m.test(source);

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

  checkAppKitTypeImports(source, stripped, hasAppKitImport, file, diagnostics);
}

const APPKIT_TYPE_NAMES = [
  "NSPasteboard",
  "NSImage",
  "NSColor",
  "NSWorkspace",
  "NSOpenPanel",
  "NSSavePanel",
  "NSView",
  "NSWindow",
  "NSEvent",
];

function checkAppKitTypeImports(
  source: string,
  stripped: string,
  hasAppKitImport: boolean,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (hasAppKitImport) return;

  for (const typeName of APPKIT_TYPE_NAMES) {
    const match = new RegExp(`\\b${typeName}\\b`).exec(stripped);
    if (!match) continue;
    diagnostics.push(
      makeDiagnostic("AX738", file, 1 + countNewlinesUpTo(source, match.index), {
        message: `This file uses ${typeName} but does not import AppKit`,
        suggestion:
          "Add `import AppKit` at the top of the file, or wrap the AppKit usage in `#if os(macOS)` with an AppKit import.",
      })
    );
    return;
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

function checkViewBodyReferencesDeclaredProperties(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const typeBody = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const strippedTypeBody = stripCommentsAndStrings(typeBody);
  const bodyMatch = /\bvar\s+body\s*:\s*some\s+View\s*\{/.exec(strippedTypeBody);
  if (!bodyMatch) return;

  const bodyOpen = bodyMatch.index + bodyMatch[0].lastIndexOf("{");
  const bodyClose = findMatchingBrace(strippedTypeBody, bodyOpen);
  if (bodyClose === -1) return;

  const bodySource = strippedTypeBody.slice(bodyOpen + 1, bodyClose);
  const declared = collectTopLevelPropertyNames(typeBody, strippedTypeBody);
  const localNames = collectLocalNames(bodySource);
  const reported = new Set<string>();
  const identifierPattern = /\b([a-z][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = identifierPattern.exec(bodySource)) !== null) {
    const name = match[1]!;
    const prev = bodySource[match.index - 1] ?? "";
    const next = nextNonWhitespace(bodySource, match.index + name.length);

    if (prev === "." || /[A-Za-z0-9_]/.test(prev)) continue;
    if (next === ":" || next === "(") continue;
    if (
      declared.has(name) ||
      localNames.has(name) ||
      VIEW_BODY_KNOWN_IDENTIFIERS.has(name)
    )
      continue;
    if (reported.has(name)) continue;

    reported.add(name);
    const absoluteOffset = decl.bodyStart + bodyOpen + 1 + match.index;
    diagnostics.push(
      makeDiagnostic("AX739", file, 1 + countNewlinesUpTo(decl.source, absoluteOffset), {
        message: `SwiftUI view '${decl.name}' references '${name}' in body but the property is not declared in the view`,
        suggestion: `Declare \`${name}\` as @State, @Binding, @Environment, a stored property, or a local value before using it in \`body\`.`,
      })
    );
  }
}

const VIEW_BODY_KNOWN_IDENTIFIERS = new Set([
  "true",
  "false",
  "nil",
  "self",
  "some",
  "if",
  "else",
  "elseif",
  "endif",
  "for",
  "in",
  "let",
  "var",
  "guard",
  "switch",
  "case",
  "return",
  "try",
  "await",
  "async",
  "throws",
  "os",
  "macOS",
  "iOS",
  "visionOS",
]);

function collectTopLevelPropertyNames(
  typeBody: string,
  strippedTypeBody: string
): Set<string> {
  const names = new Set<string>();
  const lines = typeBody.split("\n");
  const strippedLines = strippedTypeBody.split("\n");
  let depth = 0;

  for (let i = 0; i < strippedLines.length; i++) {
    const strippedLine = strippedLines[i] ?? "";
    const rawLine = lines[i] ?? "";
    const match =
      depth === 0
        ? rawLine.match(
            /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)*(?:(?:public|private|fileprivate|internal|open|static|weak|unowned|nonisolated)\s+)*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/
          )
        : null;
    if (match?.[1]) names.add(match[1]);
    const funcMatch =
      depth === 0
        ? rawLine.match(
            /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)*(?:(?:public|private|fileprivate|internal|open|static|nonisolated)\s+)*func\s+([A-Za-z_][A-Za-z0-9_]*)\b/
          )
        : null;
    if (funcMatch?.[1]) names.add(funcMatch[1]);

    for (const ch of strippedLine) {
      if (ch === "{") depth++;
      if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }

  return names;
}

function collectLocalNames(bodySource: string): Set<string> {
  const names = new Set<string>();
  for (const match of bodySource.matchAll(
    /\{\s*\(?\s*((?:[A-Za-z_][A-Za-z0-9_]*|_)(?:\s*,\s*(?:[A-Za-z_][A-Za-z0-9_]*|_))*)\s*\)?\s+in\b/g
  )) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim();
      if (name && name !== "_") names.add(name);
    }
  }
  for (const match of bodySource.matchAll(
    /\b(?:if|guard)\s+(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g
  )) {
    names.add(match[1]!);
  }
  for (const match of bodySource.matchAll(
    /\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g
  )) {
    names.add(match[1]!);
  }
  return names;
}

function nextNonWhitespace(source: string, index: number): string {
  for (let i = index; i < source.length; i++) {
    const ch = source[i] ?? "";
    if (!/\s/.test(ch)) return ch;
  }
  return "";
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
