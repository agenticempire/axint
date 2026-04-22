/**
 * Axint App Enum IR Validator
 *
 * Structural sanity checks for an `IRAppEnum` before codegen. Catches
 * things that would otherwise only show up as Swift compiler errors:
 *
 *   - enum names that won't compile
 *   - case values that aren't valid Swift identifiers or collide with
 *     reserved keywords
 *   - duplicate cases
 *   - empty enums
 *
 * Diagnostic codes: AX790–AX799.
 */

import type { Diagnostic, IRAppEnum } from "./types.js";

export function validateAppEnum(appEnum: IRAppEnum): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!isPascalCase(appEnum.name)) {
    diagnostics.push({
      code: "AX790",
      severity: "error",
      message: `App Enum name must be PascalCase, got: ${appEnum.name}`,
      file: appEnum.sourceFile,
      suggestion: "Use a PascalCase type name like PizzaSize or OrderStatus.",
    });
  }

  if (appEnum.cases.length === 0) {
    diagnostics.push({
      code: "AX791",
      severity: "error",
      message: "App Enum must declare at least one case",
      file: appEnum.sourceFile,
    });
    return diagnostics;
  }

  const seen = new Set<string>();
  for (const c of appEnum.cases) {
    if (!isSwiftIdentifier(c.value)) {
      diagnostics.push({
        code: "AX792",
        severity: "error",
        message: `Case value "${c.value}" is not a valid Swift identifier`,
        file: appEnum.sourceFile,
        suggestion: "Use lowerCamelCase: small, mediumLarge, extraLarge",
      });
    }
    if (seen.has(c.value)) {
      diagnostics.push({
        code: "AX793",
        severity: "error",
        message: `Duplicate case value: ${c.value}`,
        file: appEnum.sourceFile,
      });
    }
    seen.add(c.value);

    if (!c.title.trim()) {
      diagnostics.push({
        code: "AX794",
        severity: "error",
        message: `Case "${c.value}" must have a non-empty title`,
        file: appEnum.sourceFile,
      });
    }
  }

  return diagnostics;
}

export function validateSwiftAppEnumSource(swiftCode: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!/\bimport\s+AppIntents\b/.test(swiftCode)) {
    diagnostics.push({
      code: "AX795",
      severity: "error",
      message: "Generated App Enum code must import AppIntents",
    });
  }
  if (!/:\s*String\s*,\s*AppEnum\b/.test(swiftCode)) {
    diagnostics.push({
      code: "AX796",
      severity: "error",
      message: "App Enum must conform to both String and AppEnum",
    });
  }
  return diagnostics;
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
