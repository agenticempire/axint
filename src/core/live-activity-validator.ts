/**
 * Axint Live Activity IR Validator
 *
 * Structural sanity checks for an `IRLiveActivity` before it hits the
 * generator. Catches problems that are easy to make in TS but hard to
 * debug once they become Swift compiler errors:
 *
 *   - names that won't compile or read oddly in Swift
 *   - field names that collide with reserved keywords
 *   - empty regions that the generator can't fill
 *
 * Diagnostic codes: AX770–AX779.
 */

import type { Diagnostic, IRLiveActivity } from "./types.js";

export function validateLiveActivity(activity: IRLiveActivity): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!isPascalCase(activity.name)) {
    diagnostics.push({
      code: "AX770",
      severity: "error",
      message: `Live Activity name must be PascalCase, got: ${activity.name}`,
      file: activity.sourceFile,
      suggestion: "Use a PascalCase type name like PizzaDelivery or OrderStatus.",
    });
  }

  if (activity.contentState.length === 0) {
    diagnostics.push({
      code: "AX771",
      severity: "error",
      message: "Live Activity contentState must declare at least one field",
      file: activity.sourceFile,
      suggestion: "Add a field: contentState: { progress: activityState.double(...) }",
    });
  }

  checkFieldNames(activity.attributes, "attributes", activity.sourceFile, diagnostics);
  checkFieldNames(
    activity.contentState,
    "contentState",
    activity.sourceFile,
    diagnostics
  );

  const { dynamicIsland } = activity;
  if (dynamicIsland.expanded.length === 0) {
    diagnostics.push(region("AX774", "expanded", activity.sourceFile));
  }
  if (dynamicIsland.compactLeading.length === 0) {
    diagnostics.push(region("AX775", "compactLeading", activity.sourceFile));
  }
  if (dynamicIsland.compactTrailing.length === 0) {
    diagnostics.push(region("AX776", "compactTrailing", activity.sourceFile));
  }
  if (dynamicIsland.minimal.length === 0) {
    diagnostics.push(region("AX777", "minimal", activity.sourceFile));
  }
  if (activity.lockScreen.length === 0) {
    diagnostics.push({
      code: "AX778",
      severity: "error",
      message: "Live Activity lockScreen body must not be empty",
      file: activity.sourceFile,
    });
  }

  return diagnostics;
}

export function validateSwiftLiveActivitySource(swiftCode: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!/\bimport\s+ActivityKit\b/.test(swiftCode)) {
    diagnostics.push({
      code: "AX779",
      severity: "error",
      message: "Generated Live Activity code must import ActivityKit",
    });
  }
  return diagnostics;
}

// ─── Internals ──────────────────────────────────────────────────────

function checkFieldNames(
  fields: IRLiveActivity["attributes"],
  label: "attributes" | "contentState",
  sourceFile: string,
  diagnostics: Diagnostic[]
): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (!isSwiftIdentifier(field.name)) {
      diagnostics.push({
        code: label === "attributes" ? "AX772" : "AX773",
        severity: "error",
        message: `Invalid Swift identifier in ${label}: ${field.name}`,
        file: sourceFile,
      });
    }
    if (seen.has(field.name)) {
      diagnostics.push({
        code: label === "attributes" ? "AX772" : "AX773",
        severity: "error",
        message: `Duplicate ${label} field: ${field.name}`,
        file: sourceFile,
      });
    }
    seen.add(field.name);
  }
}

function region(code: string, name: string, file: string): Diagnostic {
  return {
    code,
    severity: "error",
    message: `Dynamic Island ${name} region must not be empty`,
    file,
    suggestion: `Add at least one view to dynamicIsland.${name}.`,
  };
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function isSwiftIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !SWIFT_KEYWORDS.has(name);
}

const SWIFT_KEYWORDS: ReadonlySet<string> = new Set([
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
]);
