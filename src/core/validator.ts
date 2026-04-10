/**
 * Axint Validator
 *
 * Validates generated Swift App Intent code against Apple's API surface.
 * Returns diagnostics with error codes, locations, and fix suggestions.
 */

import type { Diagnostic, IRIntent, IREntity } from "./types.js";

/** Apple-recommended maximum parameters per intent for usability */
const MAX_PARAMETERS = 10;

/** Maximum title length before Siri may truncate display */
const MAX_TITLE_LENGTH = 60;

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
  if (intent.parameters.length > MAX_PARAMETERS) {
    diagnostics.push({
      code: "AX105",
      severity: "warning",
      message: `Intent has ${intent.parameters.length} parameters. Apple recommends ${MAX_PARAMETERS} or fewer for usability.`,
      file: intent.sourceFile,
      suggestion:
        "Consider splitting into multiple intents or grouping parameters into an entity",
    });
  }

  // Rule: Title should not exceed 60 characters (Siri display constraint)
  if (intent.title && intent.title.length > MAX_TITLE_LENGTH) {
    diagnostics.push({
      code: "AX106",
      severity: "warning",
      message: `Intent title is ${intent.title.length} characters. Siri display may truncate titles over ${MAX_TITLE_LENGTH} characters.`,
      file: intent.sourceFile,
    });
  }

  // Rule: Parameter names must be unique within an intent
  const seen = new Set<string>();
  for (const param of intent.parameters) {
    if (seen.has(param.name)) {
      diagnostics.push({
        code: "AX107",
        severity: "error",
        message: `Duplicate parameter name "${param.name}"`,
        file: intent.sourceFile,
        suggestion: "Each parameter in a single intent must have a unique name",
      });
    }
    seen.add(param.name);
  }

  // Rule: Entitlement strings must look like reverse-DNS identifiers
  for (const ent of intent.entitlements ?? []) {
    if (!/^[a-zA-Z0-9._-]+$/.test(ent) || !ent.includes(".")) {
      diagnostics.push({
        code: "AX108",
        severity: "warning",
        message: `Entitlement "${ent}" does not look like a valid reverse-DNS identifier`,
        file: intent.sourceFile,
        suggestion:
          'Use reverse-DNS, e.g., "com.apple.developer.siri" or "com.apple.security.app-sandbox"',
      });
    }
  }

  // Rule: Info.plist keys must start with "NS" or other known prefixes
  for (const key of Object.keys(intent.infoPlistKeys ?? {})) {
    if (!/^(NS|UI|LS|CF|CA|CK)[A-Za-z0-9]+$/.test(key)) {
      diagnostics.push({
        code: "AX109",
        severity: "warning",
        message: `Info.plist key "${key}" does not match Apple's usual naming conventions`,
        file: intent.sourceFile,
        suggestion:
          'Apple keys generally start with "NS" (e.g., "NSCalendarsUsageDescription")',
      });
    }
  }

  // Validate all entities
  if (intent.entities) {
    for (const entity of intent.entities) {
      diagnostics.push(...validateEntity(entity, intent.sourceFile));
    }
  }

  return diagnostics;
}

/**
 * Validate an IREntity for App Intents framework compliance.
 */
export function validateEntity(entity: IREntity, sourceFile: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Rule AX110: Entity name must be PascalCase
  if (!entity.name || !/^[A-Z][a-zA-Z0-9]*$/.test(entity.name)) {
    diagnostics.push({
      code: "AX110",
      severity: "error",
      message: `Entity name "${entity.name}" must be PascalCase (e.g., "Task", "Playlist")`,
      file: sourceFile,
      suggestion: `Rename to "${toPascalCase(entity.name)}"`,
    });
  }

  // Rule AX111: Entity must have at least one property
  if (entity.properties.length === 0) {
    diagnostics.push({
      code: "AX111",
      severity: "error",
      message: `Entity "${entity.name}" must have at least one property`,
      file: sourceFile,
      suggestion: "Add properties to define the entity's structure",
    });
  }

  // Rule AX112: Display title must reference an existing property
  const titleProp = entity.displayRepresentation.title;
  const propertyNames = new Set(entity.properties.map((p) => p.name));
  if (titleProp && !propertyNames.has(titleProp)) {
    diagnostics.push({
      code: "AX112",
      severity: "warning",
      message: `Display title "${titleProp}" does not reference an existing property`,
      file: sourceFile,
      suggestion: `Available properties: ${[...propertyNames].join(", ")}`,
    });
  }

  // Rule AX113: Query type must be valid
  const validQueryTypes = ["all", "id", "string", "property"];
  if (!validQueryTypes.includes(entity.queryType)) {
    diagnostics.push({
      code: "AX113",
      severity: "error",
      message: `Entity query type "${entity.queryType}" is not valid`,
      file: sourceFile,
      suggestion: `Use one of: ${validQueryTypes.join(", ")}`,
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
