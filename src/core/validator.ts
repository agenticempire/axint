/**
 * Axint Validator
 *
 * Validates generated Swift App Intent code against Apple's API surface.
 * Returns diagnostics with error codes, locations, and fix suggestions.
 */

import type { Diagnostic, IRIntent, IRParameter, IRType, IREntity } from "./types.js";

/** Apple-recommended maximum parameters per intent for usability */
const MAX_PARAMETERS = 10;

/** Maximum title length before Siri may truncate display */
const MAX_TITLE_LENGTH = 60;

const HEALTHKIT_ENTITLEMENT_KEYS = new Set([
  "com.apple.developer.healthkit",
  "com.apple.developer.healthkit.background-delivery",
]);

const HEALTHKIT_ENTITLEMENT_ALIASES = new Map<string, string>([
  ["healthkit", "com.apple.developer.healthkit"],
  ["healthkit.read", "com.apple.developer.healthkit"],
  ["healthkit.write", "com.apple.developer.healthkit"],
]);

const HEALTHKIT_USAGE_DESCRIPTION_KEYS = [
  "NSHealthShareUsageDescription",
  "NSHealthUpdateUsageDescription",
  "NSHealthClinicalHealthRecordsShareUsageDescription",
];

const HEALTHKIT_USAGE_DESCRIPTION_ALIASES = new Map<string, string[]>([
  [
    "HealthUsageDescription",
    ["NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription"],
  ],
]);

const PRIVACY_USAGE_DESCRIPTION_PATTERN = /^NS[A-Za-z0-9]+UsageDescription$/;

const APP_SCHEMA_DOMAINS = new Set([
  "assistant",
  "audio",
  "books",
  "browser",
  "calendar",
  "camera",
  "clock",
  "files",
  "journaling",
  "mail",
  "maps",
  "messages",
  "notes",
  "phone",
  "photos",
  "presentation",
  "reader",
  "reminders",
  "spreadsheet",
  "system-search",
  "visual-intelligence",
  "whiteboard",
  "word-processor",
]);

const APP_INTENT_CONFORMANCES = new Set([
  "LongRunningIntent",
  "CancellableIntent",
  "UndoableIntent",
  "RunSystemShortcutIntent",
  "ProgressReportingIntent",
  "SnippetIntent",
  "SystemIntent",
  "ShowInAppSearchResultsIntent",
  "TargetContentProvidingIntent",
  "URLRepresentableIntent",
  "OpenIntent",
  "DeleteIntent",
  "SetValueIntent",
  "ControlConfigurationIntent",
  "WidgetConfigurationIntent",
]);

const ENTITY_OWNERSHIP_VALUES = new Set(["unknown", "shared", "public"]);

/**
 * Validate an IR intent for App Intents framework compliance.
 */
export function validateIntent(intent: IRIntent): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const infoPlistKeys = intent.infoPlistKeys ?? {};

  // Rule: Intent name must be PascalCase and non-empty
  if (!intent.name || !/^[A-Z][a-zA-Z0-9]*$/.test(intent.name)) {
    diagnostics.push({
      code: "AX100",
      severity: "error",
      message: `Intent name "${intent.name}" must be PascalCase (e.g., "CreateEvent")`,
      file: intent.sourceFile,
      line: intent.spans?.name?.line,
      column: intent.spans?.name?.column,
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
      line: intent.spans?.title?.line,
      column: intent.spans?.title?.column,
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
      line: intent.spans?.description?.line,
      column: intent.spans?.description?.column,
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
        line: param.span?.line,
        column: param.span?.column,
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
        line: param.span?.line,
        column: param.span?.column,
        suggestion: "Add a description for better Siri/Shortcuts display",
      });
    }
  }

  // Rule: a literal default must match the declared param type, otherwise
  // the generated Swift (`var x: String = 8`) fails to build under a green check
  for (const param of intent.parameters) {
    const mismatch = checkDefaultMatchesType(param);
    if (mismatch) {
      diagnostics.push({
        code: "AX127",
        severity: "error",
        message: mismatch.message,
        file: intent.sourceFile,
        line: param.defaultSpan?.line ?? param.span?.line,
        column: param.defaultSpan?.column ?? param.span?.column,
        suggestion: mismatch.suggestion,
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
      line: intent.spans?.title?.line,
      column: intent.spans?.title?.column,
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
        line: param.span?.line,
        column: param.span?.column,
        suggestion: "Each parameter in a single intent must have a unique name",
      });
    }
    seen.add(param.name);
  }

  if (intent.schemaDomain && !APP_SCHEMA_DOMAINS.has(intent.schemaDomain)) {
    diagnostics.push({
      code: "AX119",
      severity: "error",
      message: `Unknown Apple app schema domain "${intent.schemaDomain}"`,
      file: intent.sourceFile,
      suggestion: `Use one of: ${[...APP_SCHEMA_DOMAINS].join(", ")}`,
    });
  }

  if (intent.schema && !isSafeSwiftExpression(intent.schema)) {
    diagnostics.push({
      code: "AX120",
      severity: "error",
      message: `Intent schema expression "${intent.schema}" is not safe to emit`,
      file: intent.sourceFile,
      suggestion:
        'Use a simple Swift schema reference, e.g. ".mail.createDraft" or "AppSchema.MailIntent.createDraft".',
    });
  }

  for (const conformance of intent.conformsTo ?? []) {
    if (!APP_INTENT_CONFORMANCES.has(conformance)) {
      diagnostics.push({
        code: "AX121",
        severity: "error",
        message: `Unsupported App Intent conformance "${conformance}"`,
        file: intent.sourceFile,
        suggestion: `Use one of: ${[...APP_INTENT_CONFORMANCES].join(", ")}`,
      });
    }
  }

  for (const [label, expression] of [
    ["supportedModes", intent.supportedModes],
    ["allowedExecutionTargets", intent.allowedExecutionTargets],
  ] as const) {
    if (expression && !isSafeSwiftOptionExpression(expression)) {
      diagnostics.push({
        code: "AX122",
        severity: "error",
        message: `${label} expression "${expression}" is not safe to emit`,
        file: intent.sourceFile,
        suggestion:
          'Use a simple Swift option expression like ".foreground", ".background", ".main", or "[.main, .widgetKitExtension]".',
      });
    }
  }

  // Rule: Entitlement strings must look like reverse-DNS identifiers
  for (const ent of intent.entitlements ?? []) {
    const canonicalEntitlement = HEALTHKIT_ENTITLEMENT_ALIASES.get(ent);
    if (canonicalEntitlement) {
      diagnostics.push({
        code: "AX117",
        severity: "warning",
        message: `Entitlement "${ent}" looks like shorthand for HealthKit, not the real Apple entitlement key`,
        file: intent.sourceFile,
        suggestion: `Use "${canonicalEntitlement}" so the capability matches Apple's entitlement name`,
      });
      continue;
    }

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
  for (const key of Object.keys(infoPlistKeys)) {
    const healthKitAliases = HEALTHKIT_USAGE_DESCRIPTION_ALIASES.get(key);
    if (healthKitAliases) {
      diagnostics.push({
        code: "AX118",
        severity: "warning",
        message: `Info.plist key "${key}" looks like shorthand, not Apple's real HealthKit usage-description key`,
        file: intent.sourceFile,
        suggestion: `Use ${healthKitAliases.join(" and/or ")} with user-facing copy that matches the HealthKit access you request`,
      });
      continue;
    }

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

  const hasHealthKitEntitlement = (intent.entitlements ?? []).some(
    (entitlement) =>
      HEALTHKIT_ENTITLEMENT_KEYS.has(entitlement) ||
      HEALTHKIT_ENTITLEMENT_ALIASES.has(entitlement)
  );
  const declaredHealthKitUsageKeys = HEALTHKIT_USAGE_DESCRIPTION_KEYS.filter(
    (key) => key in infoPlistKeys
  );

  if (hasHealthKitEntitlement && declaredHealthKitUsageKeys.length === 0) {
    diagnostics.push({
      code: "AX114",
      severity: "warning",
      message:
        "HealthKit entitlements were declared, but no HealthKit privacy usage descriptions were provided",
      file: intent.sourceFile,
      suggestion:
        "Add NSHealthShareUsageDescription and/or NSHealthUpdateUsageDescription with user-facing copy that matches the HealthKit access you request",
    });
  }

  if (!hasHealthKitEntitlement && declaredHealthKitUsageKeys.length > 0) {
    diagnostics.push({
      code: "AX115",
      severity: "warning",
      message:
        "HealthKit privacy usage descriptions were declared, but the HealthKit entitlement is missing",
      file: intent.sourceFile,
      suggestion:
        "Enable the HealthKit capability (com.apple.developer.healthkit) or remove the stray NSHealth*UsageDescription keys if this intent does not use HealthKit",
    });
  }

  for (const [key, value] of Object.entries(infoPlistKeys)) {
    if (!PRIVACY_USAGE_DESCRIPTION_PATTERN.test(key)) continue;
    if (!isPlaceholderUsageDescription(value)) continue;

    diagnostics.push({
      code: "AX116",
      severity: "warning",
      message: `Privacy usage description "${key}" is empty or still reads like placeholder copy`,
      file: intent.sourceFile,
      suggestion:
        "Replace it with a concrete user-facing explanation of what the app reads or writes and why",
    });
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

  if (entity.schemaDomain && !APP_SCHEMA_DOMAINS.has(entity.schemaDomain)) {
    diagnostics.push({
      code: "AX123",
      severity: "error",
      message: `Unknown Apple app schema domain "${entity.schemaDomain}"`,
      file: sourceFile,
      suggestion: `Use one of: ${[...APP_SCHEMA_DOMAINS].join(", ")}`,
    });
  }

  if (entity.schema && !isSafeSwiftExpression(entity.schema)) {
    diagnostics.push({
      code: "AX124",
      severity: "error",
      message: `Entity schema expression "${entity.schema}" is not safe to emit`,
      file: sourceFile,
      suggestion:
        'Use a simple Swift schema reference, e.g. ".messages.message" or "AppSchema.MessagesEntity.message".',
    });
  }

  if (entity.ownership && !ENTITY_OWNERSHIP_VALUES.has(entity.ownership)) {
    diagnostics.push({
      code: "AX125",
      severity: "error",
      message: `Entity ownership "${entity.ownership}" is not valid`,
      file: sourceFile,
      suggestion: 'Use "unknown", "shared", or "public".',
    });
  }

  if (
    entity.intentValueRepresentation &&
    !isSafeIntentValueRepresentation(entity.intentValueRepresentation)
  ) {
    diagnostics.push({
      code: "AX126",
      severity: "error",
      message: "intentValueRepresentation must be a single safe Swift expression",
      file: sourceFile,
      suggestion:
        "Use a ValueRepresentation(...) or IntentValueRepresentation(...) expression and avoid semicolons, comments, or braces.",
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

interface DefaultMismatch {
  message: string;
  suggestion: string;
}

/**
 * Defaults are emitted verbatim into the generated Swift property, so a
 * default whose JS type disagrees with the declared param type produces
 * Swift that cannot compile. Returns the mismatch, or null when the
 * default is absent or valid.
 */
function checkDefaultMatchesType(param: IRParameter): DefaultMismatch | null {
  if (param.defaultValue === undefined) return null;
  return checkDefaultAgainst(param.name, param.defaultValue, param.type);
}

function checkDefaultAgainst(
  name: string,
  value: unknown,
  type: IRType
): DefaultMismatch | null {
  switch (type.kind) {
    case "optional":
      return checkDefaultAgainst(name, value, type.innerType);
    case "dynamicOptions":
      return checkDefaultAgainst(name, value, type.valueType);
    case "primitive":
      return checkPrimitiveDefault(name, value, type.value);
    case "array":
      if (!Array.isArray(value)) {
        return {
          message: `Parameter "${name}" declares an array type but its default is ${describeDefault(value)}`,
          suggestion: `Change the default to an array literal, or change the param to ${suggestedHelperFor(value)}.`,
        };
      }
      for (const element of value) {
        const elementMismatch = checkDefaultAgainst(name, element, type.elementType);
        if (elementMismatch) return elementMismatch;
      }
      return null;
    case "enum":
      if (typeof value === "string" && type.cases.includes(value)) return null;
      return {
        message: `Parameter "${name}" has default ${describeDefault(value)}, which is not one of its enum cases`,
        suggestion: `Use one of: ${type.cases.join(", ")}.`,
      };
    case "entity":
    case "entityCollection":
    case "entityQuery":
      return {
        message: `Parameter "${name}" is an entity reference and cannot take a literal default`,
        suggestion:
          "Remove the default — entity values are resolved at runtime by the entity query.",
      };
  }
}

function checkPrimitiveDefault(
  name: string,
  value: unknown,
  primitive: string
): DefaultMismatch | null {
  const change = (to: string) =>
    `Change the default to ${to}, or change the param to ${suggestedHelperFor(value)}.`;

  switch (primitive) {
    case "string":
      if (typeof value === "string") return null;
      return {
        message: `Parameter "${name}" is declared param.string() but its default is ${describeDefault(value)}`,
        suggestion: change(`a string (e.g. ${JSON.stringify(String(value))})`),
      };
    case "int":
      if (typeof value === "number" && Number.isInteger(value)) return null;
      return {
        message: `Parameter "${name}" is declared as an integer but its default is ${describeDefault(value)}`,
        suggestion: change("a whole number (e.g. 8)"),
      };
    case "double":
    case "float":
      if (typeof value === "number" && Number.isFinite(value)) return null;
      return {
        message: `Parameter "${name}" is declared param.${primitive}() but its default is ${describeDefault(value)}`,
        suggestion: change("a number (e.g. 1.5)"),
      };
    case "boolean":
      if (typeof value === "boolean") return null;
      return {
        message: `Parameter "${name}" is declared param.boolean() but its default is ${describeDefault(value)}`,
        suggestion: change("true or false"),
      };
    case "url":
      if (typeof value === "string" && value.trim().length > 0) return null;
      return {
        message: `Parameter "${name}" is declared param.url() but its default is ${describeDefault(value)}`,
        suggestion: change('a non-empty URL string (e.g. "https://example.com")'),
      };
    case "date":
    case "duration":
      return {
        message: `Parameter "${name}" is declared param.${primitive}() — ${primitive} params do not support literal defaults`,
        suggestion: `Remove the default and set the initial ${primitive} inside perform(), or change the param to ${suggestedHelperFor(value)}.`,
      };
    default:
      return null;
  }
}

function describeDefault(value: unknown): string {
  if (typeof value === "string") return `the string ${JSON.stringify(value)}`;
  if (typeof value === "number") return `the number ${value}`;
  if (typeof value === "boolean") return `the boolean ${value}`;
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

function suggestedHelperFor(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? "param.int(...)" : "param.double(...)";
  }
  if (typeof value === "boolean") return "param.boolean(...)";
  if (Array.isArray(value)) return "param.array(...)";
  return "param.string(...)";
}

function toPascalCase(s: string): string {
  if (!s) return "UnnamedIntent";
  return s
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

function isPlaceholderUsageDescription(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;

  const normalized = trimmed.toLowerCase();
  return (
    normalized.startsWith("todo") ||
    normalized.startsWith("tbd") ||
    normalized === "placeholder" ||
    normalized === "change me" ||
    normalized.includes("<#") ||
    normalized.includes("your usage description") ||
    normalized.includes("insert usage description")
  );
}

function isSafeSwiftExpression(expression: string): boolean {
  return /^\.?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(expression);
}

function isSafeSwiftOptionExpression(expression: string): boolean {
  return /^[A-Za-z0-9_.,\s[\]()]+$/.test(expression) && !/[{};:]/.test(expression);
}

function isSafeIntentValueRepresentation(expression: string): boolean {
  return (
    /^(?:IntentValueRepresentation|ValueRepresentation)\s*\([^{};]*\)$/.test(
      expression.trim()
    ) && !/\/\/|\/\*/.test(expression)
  );
}
