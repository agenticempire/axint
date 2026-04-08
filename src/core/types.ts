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
  | "number"
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
}

// ─── Compiler Types ──────────────────────────────────────────────────

export interface CompilerOptions {
  /** Output directory for generated Swift files */
  outDir: string;
  /** Whether to run validation after generation */
  validate?: boolean;
  /** Target iOS/macOS version */
  target?: "ios16" | "ios17" | "ios18" | "macos13" | "macos14" | "macos15";
}

export interface CompilerOutput {
  /** Path to the generated Swift file */
  outputPath: string;
  /** The generated Swift source code */
  swiftCode: string;
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
  "number",
  "boolean",
  "date",
  "duration",
  "url",
]);

// ─── Swift Type Mapping ──────────────────────────────────────────────

export const SWIFT_TYPE_MAP: Record<IRPrimitiveType, string> = {
  string: "String",
  number: "Int",
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
    case "enum":
      return type.name;
  }
}
