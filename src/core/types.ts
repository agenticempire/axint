/**
 * Axint Core Types
 *
 * Intermediate Representation (IR) and compiler types for the
 * TypeScript → Swift App Intent compilation pipeline.
 */

// ─── IR Types ────────────────────────────────────────────────────────

/** Primitive types supported by App Intents */
export type IRPrimitiveType =
  | "string"
  | "int"
  | "double"
  | "float"
  | "boolean"
  | "date"
  | "duration"
  | "url";

/** Type node in the IR */
export type IRType =
  | { kind: "primitive"; value: IRPrimitiveType }
  | { kind: "array"; elementType: IRType }
  | { kind: "optional"; innerType: IRType }
  | { kind: "entity"; entityName: string; properties: IRParameter[] }
  | { kind: "entityQuery"; entityName: string; queryType: "all" | "id" | "string" | "property" }
  | { kind: "dynamicOptions"; valueType: IRType; providerName: string }
  | { kind: "enum"; name: string; cases: string[] };

/** A single parameter in an intent definition */
export interface IRParameter {
  name: string;
  type: IRType;
  title: string;
  description: string;
  isOptional: boolean;
  defaultValue?: unknown;
}

/**
 * Display representation configuration for an entity.
 * Maps which properties to show in Siri and Shortcuts UI.
 */
export interface DisplayRepresentation {
  title: string;
  subtitle?: string;
  image?: string;
}

/**
 * An App Entity definition for complex, domain-specific data types.
 * Entities can be queried and used as parameter types in intents.
 */
export interface IREntity {
  name: string;
  displayRepresentation: DisplayRepresentation;
  properties: IRParameter[];
  queryType: "all" | "id" | "string" | "property";
}

/** The main IR node representing a compiled intent */
export interface IRIntent {
  name: string;
  title: string;
  description: string;
  domain?: string;
  category?: string;
  parameters: IRParameter[];
  returnType: IRType;
  sourceFile: string;
  /** Entitlements required by this intent (e.g., "com.apple.developer.siri") */
  entitlements?: string[];
  /** Info.plist keys required by this intent (e.g., "NSCalendarsUsageDescription") */
  infoPlistKeys?: Record<string, string>;
  /** Whether the intent should be exposed to Spotlight indexing */
  isDiscoverable?: boolean;
  /** App Entities used by this intent */
  entities?: IREntity[];
  /** Whether to donate this intent to Spotlight/Siri when performed */
  donateOnPerform?: boolean;
  /** Custom result type (SwiftUI view or custom struct) to return */
  customResultType?: string;
}

// ─── Compiler Types ──────────────────────────────────────────────────

export interface CompilerOptions {
  /** Output directory for generated Swift files */
  outDir: string;
  /** Whether to run validation after generation */
  validate?: boolean;
  /** Target iOS/macOS version */
  target?: "ios16" | "ios17" | "ios18" | "ios26" | "macos13" | "macos14" | "macos15" | "macos26";
  /** Whether to emit an Info.plist fragment alongside the Swift file */
  emitInfoPlist?: boolean;
  /** Whether to emit an entitlements fragment alongside the Swift file */
  emitEntitlements?: boolean;
  /** Whether to run swift-format on the output (requires swift-format on PATH) */
  format?: boolean;
}

export interface CompilerOutput {
  /** Path to the generated Swift file */
  outputPath: string;
  /** The generated Swift source code */
  swiftCode: string;
  /** Info.plist fragment (if emitInfoPlist is true) */
  infoPlistFragment?: string;
  /** Entitlements fragment (if emitEntitlements is true) */
  entitlementsFragment?: string;
  /** The intermediate representation */
  ir: IRIntent;
  /** Validation diagnostics */
  diagnostics: Diagnostic[];
}

// ─── Diagnostics ─────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

// ─── Param Type Registry ─────────────────────────────────────────────

/**
 * Canonical set of supported param types.
 * Single source of truth — parser, SDK, and docs all derive from this.
 * To add a new type: add it to IRPrimitiveType, PARAM_TYPES, and SWIFT_TYPE_MAP.
 */
export const PARAM_TYPES: ReadonlySet<IRPrimitiveType> = new Set<IRPrimitiveType>([
  "string",
  "int",
  "double",
  "float",
  "boolean",
  "date",
  "duration",
  "url",
]);

/**
 * Legacy alias: "number" → "int" for backwards compatibility with v0.1.x files.
 * Parser will accept "number" and rewrite it to "int" with a deprecation warning.
 */
export const LEGACY_PARAM_ALIASES: Record<string, IRPrimitiveType> = {
  number: "int",
};

// ─── Swift Type Mapping ──────────────────────────────────────────────

export const SWIFT_TYPE_MAP: Record<IRPrimitiveType, string> = {
  string: "String",
  int: "Int",
  double: "Double",
  float: "Float",
  boolean: "Bool",
  date: "Date",
  duration: "Measurement<UnitDuration>",
  url: "URL",
};

/**
 * Convert an IRType to its Swift type string.
 */
export function irTypeToSwift(type: IRType): string {
  switch (type.kind) {
    case "primitive":
      return SWIFT_TYPE_MAP[type.value];
    case "array":
      return `[${irTypeToSwift(type.elementType)}]`;
    case "optional":
      return `${irTypeToSwift(type.innerType)}?`;
    case "entity":
      return type.entityName;
    case "entityQuery":
      return `${type.entityName}Query`;
    case "dynamicOptions":
      return `[DynamicOptionsResult<${irTypeToSwift(type.valueType)}>]`;
    case "enum":
      return type.name;
  }
}
