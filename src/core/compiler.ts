/**
 * Axint Compiler
 *
 * Orchestrates the full compilation pipeline:
 *   1. Parse TypeScript intent definition → IR
 *   2. Validate IR against App Intents constraints
 *   3. Generate Swift source code
 *   4. Validate generated Swift
 *   5. Optionally emit Info.plist and entitlements fragments
 *
 * This is the main entry point for the compilation process.
 */

import { readFileSync } from "node:fs";
import { parseIntentSource, ParserError } from "./parser.js";
import { parseViewSource } from "./view-parser.js";
import { parseWidgetSource } from "./widget-parser.js";
import {
  generateSwift,
  generateInfoPlistFragment,
  generateEntitlementsFragment,
} from "./generator.js";
import { generateSwiftUIView } from "./view-generator.js";
import { generateSwiftWidget } from "./widget-generator.js";
import { validateIntent, validateSwiftSource } from "./validator.js";
import { validateView, validateSwiftUISource } from "./view-validator.js";
import { validateWidget, validateSwiftWidgetSource } from "./widget-validator.js";
import type {
  CompilerOutput,
  CompilerOptions,
  Diagnostic,
  IRIntent,
  IRView,
  IRWidget,
  IRType,
  IRParameter,
  IRPrimitiveType,
} from "./types.js";

export interface CompileResult {
  success: boolean;
  output?: CompilerOutput;
  diagnostics: Diagnostic[];
}

/**
 * Compile a TypeScript intent definition file into Swift.
 */
export function compileFile(
  filePath: string,
  options: Partial<CompilerOptions> = {}
): CompileResult {
  // 1. Read source
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch (_err) {
    return {
      success: false,
      diagnostics: [
        {
          code: "AX000",
          severity: "error",
          message: `Cannot read file: ${filePath}`,
          file: filePath,
        },
      ],
    };
  }

  return compileSource(source, filePath, options);
}

/**
 * Compile a TypeScript source string directly (no file I/O).
 * Useful for MCP server and testing.
 */
export function compileSource(
  source: string,
  fileName: string = "<stdin>",
  options: Partial<CompilerOptions> = {}
): CompileResult {
  // 1. Parse → IR (catch ParserError as a diagnostic so the caller
  //    sees a clean error list instead of an uncaught exception)
  let ir;
  try {
    ir = parseIntentSource(source, fileName);
  } catch (err) {
    if (err instanceof ParserError) {
      return {
        success: false,
        diagnostics: [
          {
            code: err.code,
            severity: "error",
            message: err.message,
            file: err.file,
            line: err.line,
            suggestion: err.suggestion,
          },
        ],
      };
    }
    throw err;
  }

  return compileFromIR(ir, options);
}

/**
 * Compile from a pre-built IR (skips parsing). This is the bridge
 * that allows any frontend language (Python, Rust, Go) to emit an
 * IRIntent JSON and feed it directly into the Swift generator.
 *
 * Used by:
 *   - `compileSource()` after its own parse step
 *   - `axint compile --from-ir <file.json>` for cross-language pipelines
 *   - The Python SDK's `axintai compile` command
 */
export function compileFromIR(
  ir: IRIntent,
  options: Partial<CompilerOptions> = {}
): CompileResult {
  const diagnostics: Diagnostic[] = [];

  // 1. Validate IR
  const irDiagnostics = validateIntent(ir);
  diagnostics.push(...irDiagnostics);

  if (irDiagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  // 2. Generate Swift
  const swiftCode = generateSwift(ir);

  // 3. Validate generated Swift
  if (options.validate !== false) {
    const swiftDiagnostics = validateSwiftSource(swiftCode);
    diagnostics.push(...swiftDiagnostics);

    if (swiftDiagnostics.some((d) => d.severity === "error")) {
      return { success: false, diagnostics };
    }
  }

  // 4. Optional fragments
  const infoPlistFragment = options.emitInfoPlist
    ? generateInfoPlistFragment(ir)
    : undefined;
  const entitlementsFragment = options.emitEntitlements
    ? generateEntitlementsFragment(ir)
    : undefined;

  // 5. Build output
  const intentFileName = `${ir.name}Intent.swift`;
  const outputPath = options.outDir
    ? `${options.outDir}/${intentFileName}`
    : intentFileName;

  return {
    success: true,
    output: {
      outputPath,
      swiftCode,
      infoPlistFragment,
      entitlementsFragment,
      ir,
      diagnostics,
    },
    diagnostics,
  };
}

// ─── View Compilation ──────────────────────────────────────────────

export interface ViewCompileResult {
  success: boolean;
  output?: {
    outputPath: string;
    swiftCode: string;
    ir: IRView;
    diagnostics: Diagnostic[];
  };
  diagnostics: Diagnostic[];
}

/**
 * Compile a TypeScript view definition source string into SwiftUI.
 */
export function compileViewSource(
  source: string,
  fileName: string = "<stdin>",
  options: Partial<CompilerOptions> = {}
): ViewCompileResult {
  let ir: IRView;
  try {
    ir = parseViewSource(source, fileName);
  } catch (err) {
    if (err instanceof ParserError) {
      return {
        success: false,
        diagnostics: [
          {
            code: err.code,
            severity: "error",
            message: err.message,
            file: err.file,
            line: err.line,
            suggestion: err.suggestion,
          },
        ],
      };
    }
    throw err;
  }

  return compileViewFromIR(ir, options);
}

/**
 * Compile from a pre-built IRView (skips parsing).
 */
export function compileViewFromIR(
  ir: IRView,
  options: Partial<CompilerOptions> = {}
): ViewCompileResult {
  const diagnostics: Diagnostic[] = [];

  const viewDiagnostics = validateView(ir);
  diagnostics.push(...viewDiagnostics);

  if (viewDiagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  const swiftCode = generateSwiftUIView(ir);

  if (options.validate !== false) {
    const swiftDiagnostics = validateSwiftUISource(swiftCode);
    diagnostics.push(...swiftDiagnostics);

    if (swiftDiagnostics.some((d) => d.severity === "error")) {
      return { success: false, diagnostics };
    }
  }

  const viewFileName = `${ir.name}.swift`;
  const outputPath = options.outDir ? `${options.outDir}/${viewFileName}` : viewFileName;

  return {
    success: true,
    output: {
      outputPath,
      swiftCode,
      ir,
      diagnostics,
    },
    diagnostics,
  };
}

// ─── Widget Compilation ────────────────────────────────────────────

export interface WidgetCompileResult {
  success: boolean;
  output?: {
    outputPath: string;
    swiftCode: string;
    ir: IRWidget;
    diagnostics: Diagnostic[];
  };
  diagnostics: Diagnostic[];
}

/**
 * Compile a TypeScript widget definition source string into WidgetKit.
 */
export function compileWidgetSource(
  source: string,
  fileName: string = "<stdin>",
  options: Partial<CompilerOptions> = {}
): WidgetCompileResult {
  let ir: IRWidget;
  try {
    ir = parseWidgetSource(source, fileName);
  } catch (err) {
    if (err instanceof ParserError) {
      return {
        success: false,
        diagnostics: [
          {
            code: err.code,
            severity: "error",
            message: err.message,
            file: err.file,
            line: err.line,
            suggestion: err.suggestion,
          },
        ],
      };
    }
    throw err;
  }

  return compileWidgetFromIR(ir, options);
}

/**
 * Compile from a pre-built IRWidget (skips parsing).
 */
export function compileWidgetFromIR(
  ir: IRWidget,
  options: Partial<CompilerOptions> = {}
): WidgetCompileResult {
  const diagnostics: Diagnostic[] = [];

  const widgetDiagnostics = validateWidget(ir);
  diagnostics.push(...widgetDiagnostics);

  if (widgetDiagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  const swiftCode = generateSwiftWidget(ir);

  if (options.validate !== false) {
    const swiftDiagnostics = validateSwiftWidgetSource(swiftCode, ir.name);
    diagnostics.push(...swiftDiagnostics);

    if (swiftDiagnostics.some((d) => d.severity === "error")) {
      return { success: false, diagnostics };
    }
  }

  const widgetFileName = `${ir.name}Widget.swift`;
  const outputPath = options.outDir
    ? `${options.outDir}/${widgetFileName}`
    : widgetFileName;

  return {
    success: true,
    output: {
      outputPath,
      swiftCode,
      ir,
      diagnostics,
    },
    diagnostics,
  };
}

// ─── Cross-Language IR Bridge ───────────────────────────────────────

/** Valid primitive type strings from any SDK */
const VALID_PRIMITIVES = new Set<string>([
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
 * Parse a raw JSON object into a typed IRIntent. Accepts the flat
 * format that the Python SDK's `IntentIR.to_dict()` produces, where
 * parameter types are plain strings rather than `{ kind, value }` objects.
 *
 * This is the key function that bridges the Python → TypeScript gap.
 */
export function irFromJSON(data: Record<string, unknown>): IRIntent {
  const parameters: IRParameter[] = ((data.parameters as unknown[]) ?? []).map(
    (p: unknown) => {
      const param = p as Record<string, unknown>;
      return {
        name: param.name as string,
        type: normalizeIRType(param.type),
        title: (param.title as string) ?? (param.description as string) ?? "",
        description: (param.description as string) ?? "",
        isOptional: (param.optional as boolean) ?? (param.isOptional as boolean) ?? false,
        defaultValue: param.default ?? param.defaultValue,
      };
    }
  );

  return {
    name: data.name as string,
    title: data.title as string,
    description: data.description as string,
    domain: data.domain as string | undefined,
    parameters,
    returnType: data.returnType
      ? normalizeIRType(data.returnType)
      : { kind: "primitive", value: "string" },
    sourceFile: (data.sourceFile as string) ?? undefined,
    entitlements: (data.entitlements as string[]) ?? undefined,
    infoPlistKeys: (data.infoPlistKeys as Record<string, string>) ?? undefined,
    isDiscoverable: (data.isDiscoverable as boolean) ?? true,
  };
}

/**
 * Normalize a type value from JSON. The Python SDK sends types as
 * plain strings ("string", "int", etc.) while the TS IR uses
 * `{ kind: "primitive", value: "string" }`. This function handles both.
 */
function normalizeIRType(type: unknown): IRType {
  if (typeof type === "string") {
    const normalized = type === "number" ? "int" : type;
    if (VALID_PRIMITIVES.has(normalized)) {
      return { kind: "primitive", value: normalized as IRPrimitiveType };
    }
    return { kind: "primitive", value: "string" };
  }
  if (type && typeof type === "object") {
    const t = type as Record<string, unknown>;
    if (t.kind === "primitive") return type as IRType;
    if (t.kind === "array")
      return { kind: "array", elementType: normalizeIRType(t.elementType) };
    if (t.kind === "optional")
      return { kind: "optional", innerType: normalizeIRType(t.innerType) };
    if (t.kind === "entity") return type as IRType;
    if (t.kind === "enum") return type as IRType;
  }
  // Default fallback
  return { kind: "primitive", value: "string" };
}
