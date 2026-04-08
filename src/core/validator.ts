/**
 * Axint Validator
 *
 * Validates generated Swift App Intent code against Apple's API surface.
 * Returns diagnostics with error codes, locations, and fix suggestions.
 */

import type { Diagnostic, IRIntent } from "./types.js";

/**
 * Validate an IR intent for App Intents framework compliance.
 */
export function validateIntent(intent: IRIntent): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Rule: Intent name must be PascalCase and non-empty
  if (!intent.name || !/^[A-Z][a-zA-Z0-9]*$/.test(intent.name)) {
    diagnostics.push({
      code: "AX100",
      severity: "error",
      message: `Intent name "${intent.name}" must be PascalCase (e.g., "CreateEvent")`,
      file: intent.sourceFile,
      suggestion: `Rename to "${toPascalCase(intent.name)}"`,
    });
  }

  // Rule: Title must not be empty
  if (!intent.title || intent.title.trim().length === 0) {
    diagnostics.push({
      code: "AX101",
      severity: "error",
      message: "Intent title must not be empty",
      file: intent.sourceFile,
      suggestion: "Add a human-readable title for Siri and Shortcuts display",
    });
  }

  // Rule: Description must not be empty
  if (!intent.description || intent.description.trim().length === 0) {
    diagnostics.push({
      code: "AX102",
      severity: "error",
      message: "Intent description must not be empty",
      file: intent.sourceFile,
      suggestion: "Add a description explaining what this intent does",
    });
  }

  // Rule: Parameter names must be valid Swift identifiers
  for (const param of intent.parameters) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(param.name)) {
      diagnostics.push({
        code: "AX103",
        severity: "error",
        message: `Parameter name "${param.name}" is not a valid Swift identifier`,
        file: intent.sourceFile,
        suggestion: `Rename to "${param.name.replace(/[^a-zA-Z0-9_]/g, "_")}"`,
      });
    }

    // Rule: Parameter description should not be empty
    if (!param.description || param.description.trim().length === 0) {
      diagnostics.push({
        code: "AX104",
        severity: "warning",
        message: `Parameter "${param.name}" has no description — Siri will display it without context`,
        file: intent.sourceFile,
        suggestion: "Add a description for better Siri/Shortcuts display",
      });
    }
  }

  // Rule: Max 10 parameters per intent (App Intents recommendation)
  if (intent.parameters.length > 10) {
    diagnostics.push({
      code: "AX105",
      severity: "warning",
      message: `Intent has ${intent.parameters.length} parameters. Apple recommends 10 or fewer for usability.`,
      file: intent.sourceFile,
      suggestion: "Consider splitting into multiple intents or grouping parameters into an entity",
    });
  }

  // Rule: Title should not exceed 60 characters (Siri display constraint)
  if (intent.title && intent.title.length > 60) {
    diagnostics.push({
      code: "AX106",
      severity: "warning",
      message: `Intent title is ${intent.title.length} characters. Siri display may truncate titles over 60 characters.`,
      file: intent.sourceFile,
    });
  }

  return diagnostics;
}

/**
 * Validate generated Swift source code for basic correctness.
 */
export function validateSwiftSource(swift: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Check for required import
  if (!swift.includes("import AppIntents")) {
    diagnostics.push({
      code: "AX200",
      severity: "error",
      message: 'Generated Swift is missing "import AppIntents"',
    });
  }

  // Check for AppIntent conformance
  if (!swift.includes(": AppIntent")) {
    diagnostics.push({
      code: "AX201",
      severity: "error",
      message: "Generated struct does not conform to AppIntent protocol",
    });
  }

  // Check for perform function
  if (!swift.includes("func perform()")) {
    diagnostics.push({
      code: "AX202",
      severity: "error",
      message: "Generated struct is missing the perform() function",
    });
  }

  return diagnostics;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function toPascalCase(s: string): string {
  if (!s) return "UnnamedIntent";
  return s
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}
