/**
 * Axint Widget Validator
 *
 * Validates IRWidget for correctness and compatibility with WidgetKit,
 * and validates generated Swift widget code.
 */

import type { IRWidget, Diagnostic } from "./types.js";

/**
 * Validate a widget IR before code generation.
 */
export function validateWidget(widget: IRWidget): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // AX410: Widget name must be PascalCase
  if (!isPascalCase(widget.name)) {
    diagnostics.push({
      code: "AX410",
      severity: "error",
      message: `Widget name must be PascalCase, got: ${widget.name}`,
      file: widget.sourceFile,
      suggestion: `Rename to: ${toPascalCase(widget.name)}Widget`,
    });
  }

  // AX411: Widget must have at least one supported family
  if (!widget.families || widget.families.length === 0) {
    diagnostics.push({
      code: "AX411",
      severity: "error",
      message: "Widget must have at least one supported family",
      file: widget.sourceFile,
      suggestion: 'Add at least one family: families: ["systemSmall"]',
    });
  }

  // AX412: Widget must have a non-empty body
  if (!widget.body || widget.body.length === 0) {
    diagnostics.push({
      code: "AX412",
      severity: "error",
      message: "Widget must have a non-empty body",
      file: widget.sourceFile,
      suggestion: 'Add a body: body: [view.text("Widget content")]',
    });
  }

  // AX413: Entry field names must be valid Swift identifiers
  for (const entry of widget.entry) {
    if (!isValidSwiftIdentifier(entry.name)) {
      diagnostics.push({
        code: "AX413",
        severity: "error",
        message: `Invalid entry field name: ${entry.name}`,
        file: widget.sourceFile,
        suggestion: `Rename to a valid Swift identifier (alphanumeric + underscore, start with letter)`,
      });
    }
  }

  // AX414: Duplicate entry field names
  const entryNames = new Set<string>();
  for (const entry of widget.entry) {
    if (entryNames.has(entry.name)) {
      diagnostics.push({
        code: "AX414",
        severity: "error",
        message: `Duplicate entry field: ${entry.name}`,
        file: widget.sourceFile,
      });
    }
    entryNames.add(entry.name);
  }

  // AX415: displayName must not be empty
  if (!widget.displayName || widget.displayName.trim().length === 0) {
    diagnostics.push({
      code: "AX415",
      severity: "error",
      message: "displayName must not be empty",
      file: widget.sourceFile,
      suggestion: 'Add a displayName: displayName: "My Widget"',
    });
  }

  return diagnostics;
}

/**
 * Validate generated Swift widget code.
 */
export function validateSwiftWidgetSource(
  swiftCode: string,
  _widgetName?: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // AX420: Check for required WidgetKit import
  if (!swiftCode.includes("import WidgetKit")) {
    diagnostics.push({
      code: "AX420",
      severity: "error",
      message: "Generated widget code must import WidgetKit",
    });
  }

  // AX421: Check for Widget protocol conformance
  if (!swiftCode.includes(": Widget")) {
    diagnostics.push({
      code: "AX421",
      severity: "error",
      message: `Generated widget struct must conform to Widget protocol`,
    });
  }

  // AX422: Check for TimelineProvider conformance
  if (!swiftCode.includes(": TimelineProvider")) {
    diagnostics.push({
      code: "AX422",
      severity: "error",
      message: `Generated provider struct must conform to TimelineProvider protocol`,
    });
  }

  return diagnostics;
}

// ─── Helpers ────────────────────────────────────────────────────────

function isPascalCase(str: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(str);
}

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isValidSwiftIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !isSwiftKeyword(name);
}

const SWIFT_KEYWORDS = new Set([
  "associatedtype",
  "class",
  "deinit",
  "enum",
  "extension",
  "fileprivate",
  "func",
  "import",
  "init",
  "inout",
  "internal",
  "let",
  "open",
  "operator",
  "private",
  "protocol",
  "public",
  "rethrows",
  "static",
  "struct",
  "subscript",
  "typealias",
  "var",
  "break",
  "case",
  "continue",
  "default",
  "defer",
  "do",
  "else",
  "fallthrough",
  "for",
  "guard",
  "if",
  "in",
  "repeat",
  "return",
  "switch",
  "where",
  "while",
  "as",
  "Any",
  "catch",
  "false",
  "is",
  "nil",
  "super",
  "self",
  "Self",
  "throw",
  "throws",
  "true",
  "try",
  "_",
]);

function isSwiftKeyword(name: string): boolean {
  return SWIFT_KEYWORDS.has(name);
}
