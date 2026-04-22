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

import { parseIntentSource } from "./parser.js";
import { parseViewSource } from "./view-parser.js";
import { parseWidgetSource } from "./widget-parser.js";
import { parseAppSource } from "./app-parser.js";
import { parseLiveActivitySource } from "./live-activity-parser.js";
import { parseAppEnumSource } from "./app-enum-parser.js";
import { detectSurface, type Surface } from "./surface.js";
import {
  compileSourceWithParser,
  readSourceFileOrDiagnostics,
  runCompilePipeline,
} from "./compile-pipeline.js";
import {
  generateSwift,
  generateInfoPlistFragment,
  generateEntitlementsFragment,
} from "./generator.js";
import { generateSwiftUIView } from "./view-generator.js";
import { generateSwiftWidget } from "./widget-generator.js";
import { generateSwiftApp } from "./app-generator.js";
import { generateSwiftLiveActivity } from "./live-activity-generator.js";
import { generateSwiftAppEnum } from "./app-enum-generator.js";
import { validateIntent, validateSwiftSource } from "./validator.js";
import { validateView, validateSwiftUISource } from "./view-validator.js";
import { validateWidget, validateSwiftWidgetSource } from "./widget-validator.js";
import { validateApp, validateSwiftAppSource } from "./app-validator.js";
import {
  validateLiveActivity,
  validateSwiftLiveActivitySource,
} from "./live-activity-validator.js";
import { validateAppEnum, validateSwiftAppEnumSource } from "./app-enum-validator.js";
import type {
  CompilerOutput,
  CompilerOptions,
  Diagnostic,
  IRIntent,
  IRView,
  IRWidget,
  IRApp,
  IRLiveActivity,
  IRAppEnum,
  IRType,
  IRParameter,
  IREntity,
  IRPrimitiveType,
  IRParameterSummary,
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
  const result = readSourceFileOrDiagnostics(filePath);
  if (!result.ok) {
    return {
      success: false,
      diagnostics: result.diagnostics,
    };
  }

  return compileSource(result.source, filePath, options);
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
  return compileSourceWithParser({
    source,
    fileName,
    options,
    parse: parseIntentSource,
    compileFromIR,
  });
}

/**
 * Compile from a pre-built IR (skips parsing). This is the bridge
 * that allows any frontend language (Python, Rust, Go) to emit an
 * IRIntent JSON and feed it directly into the Swift generator.
 *
 * Used by:
 *   - `compileSource()` after its own parse step
 *   - `axint compile --from-ir <file.json>` for cross-language pipelines
 *   - The Python SDK's `axint-py compile` command
 */
export function compileFromIR(
  ir: IRIntent,
  options: Partial<CompilerOptions> = {}
): CompileResult {
  return runCompilePipeline({
    ir,
    options,
    validateIR: validateIntent,
    generateSwift,
    validateGeneratedSwift: (swiftCode) => validateSwiftSource(swiftCode),
    outputFileName: (intent) => `${intent.name}Intent.swift`,
    buildOutput: ({ outputPath, swiftCode, diagnostics }) => ({
      outputPath,
      swiftCode,
      infoPlistFragment: options.emitInfoPlist
        ? generateInfoPlistFragment(ir)
        : undefined,
      entitlementsFragment: options.emitEntitlements
        ? generateEntitlementsFragment(ir)
        : undefined,
      ir,
      diagnostics,
    }),
  });
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
  return compileSourceWithParser({
    source,
    fileName,
    options,
    parse: parseViewSource,
    compileFromIR: compileViewFromIR,
  });
}

/**
 * Compile from a pre-built IRView (skips parsing).
 */
export function compileViewFromIR(
  ir: IRView,
  options: Partial<CompilerOptions> = {}
): ViewCompileResult {
  return runCompilePipeline({
    ir,
    options,
    validateIR: validateView,
    generateSwift: generateSwiftUIView,
    validateGeneratedSwift: (swiftCode) => validateSwiftUISource(swiftCode),
    outputFileName: (view) => `${view.name}.swift`,
    buildOutput: ({ outputPath, swiftCode, diagnostics }) => ({
      outputPath,
      swiftCode,
      ir,
      diagnostics,
    }),
  });
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
  return compileSourceWithParser({
    source,
    fileName,
    options,
    parse: parseWidgetSource,
    compileFromIR: compileWidgetFromIR,
  });
}

/**
 * Compile from a pre-built IRWidget (skips parsing).
 */
export function compileWidgetFromIR(
  ir: IRWidget,
  options: Partial<CompilerOptions> = {}
): WidgetCompileResult {
  return runCompilePipeline({
    ir,
    options,
    validateIR: validateWidget,
    generateSwift: generateSwiftWidget,
    validateGeneratedSwift: (swiftCode, widget) =>
      validateSwiftWidgetSource(swiftCode, widget.name),
    outputFileName: (widget) => `${widget.name}Widget.swift`,
    buildOutput: ({ outputPath, swiftCode, diagnostics }) => ({
      outputPath,
      swiftCode,
      ir,
      diagnostics,
    }),
  });
}

// ─── App Compilation ──────────────────────────────────────────────

export interface AppCompileResult {
  success: boolean;
  output?: {
    outputPath: string;
    swiftCode: string;
    ir: IRApp;
    diagnostics: Diagnostic[];
  };
  diagnostics: Diagnostic[];
}

/**
 * Compile a TypeScript app definition source string into a SwiftUI App.
 */
export function compileAppSource(
  source: string,
  fileName: string = "<stdin>",
  options: Partial<CompilerOptions> = {}
): AppCompileResult {
  return compileSourceWithParser({
    source,
    fileName,
    options,
    parse: parseAppSource,
    compileFromIR: compileAppFromIR,
  });
}

/**
 * Compile from a pre-built IRApp (skips parsing).
 */
export function compileAppFromIR(
  ir: IRApp,
  options: Partial<CompilerOptions> = {}
): AppCompileResult {
  return runCompilePipeline({
    ir,
    options,
    validateIR: validateApp,
    generateSwift: generateSwiftApp,
    validateGeneratedSwift: (swiftCode, app) =>
      validateSwiftAppSource(swiftCode, app.name),
    outputFileName: (app) => `${app.name}App.swift`,
    buildOutput: ({ outputPath, swiftCode, diagnostics }) => ({
      outputPath,
      swiftCode,
      ir,
      diagnostics,
    }),
  });
}

// ─── Live Activity Compilation ─────────────────────────────────────

export interface LiveActivityCompileResult {
  success: boolean;
  output?: {
    outputPath: string;
    swiftCode: string;
    ir: IRLiveActivity;
    diagnostics: Diagnostic[];
  };
  diagnostics: Diagnostic[];
}

/**
 * Compile a TypeScript `defineLiveActivity()` source string into
 * ActivityKit Swift.
 */
export function compileLiveActivitySource(
  source: string,
  fileName: string = "<stdin>",
  options: Partial<CompilerOptions> = {}
): LiveActivityCompileResult {
  return compileSourceWithParser({
    source,
    fileName,
    options,
    parse: parseLiveActivitySource,
    compileFromIR: compileLiveActivityFromIR,
  });
}

/**
 * Compile from a pre-built IRLiveActivity (skips parsing).
 */
export function compileLiveActivityFromIR(
  ir: IRLiveActivity,
  options: Partial<CompilerOptions> = {}
): LiveActivityCompileResult {
  return runCompilePipeline({
    ir,
    options,
    validateIR: validateLiveActivity,
    generateSwift: generateSwiftLiveActivity,
    validateGeneratedSwift: (swiftCode) => validateSwiftLiveActivitySource(swiftCode),
    outputFileName: (activity) => `${activity.name}LiveActivity.swift`,
    buildOutput: ({ outputPath, swiftCode, diagnostics }) => ({
      outputPath,
      swiftCode,
      ir,
      diagnostics,
    }),
  });
}

// ─── App Enum Compilation ──────────────────────────────────────────

export interface AppEnumCompileResult {
  success: boolean;
  output?: {
    outputPath: string;
    swiftCode: string;
    ir: IRAppEnum;
    diagnostics: Diagnostic[];
  };
  diagnostics: Diagnostic[];
}

/**
 * Compile a TypeScript `defineAppEnum()` source string into Swift.
 */
export function compileAppEnumSource(
  source: string,
  fileName: string = "<stdin>",
  options: Partial<CompilerOptions> = {}
): AppEnumCompileResult {
  return compileSourceWithParser({
    source,
    fileName,
    options,
    parse: parseAppEnumSource,
    compileFromIR: compileAppEnumFromIR,
  });
}

/**
 * Compile from a pre-built IRAppEnum (skips parsing).
 */
export function compileAppEnumFromIR(
  ir: IRAppEnum,
  options: Partial<CompilerOptions> = {}
): AppEnumCompileResult {
  return runCompilePipeline({
    ir,
    options,
    validateIR: validateAppEnum,
    generateSwift: generateSwiftAppEnum,
    validateGeneratedSwift: (swiftCode) => validateSwiftAppEnumSource(swiftCode),
    outputFileName: (appEnum) => `${appEnum.name}.swift`,
    buildOutput: ({ outputPath, swiftCode, diagnostics }) => ({
      outputPath,
      swiftCode,
      ir,
      diagnostics,
    }),
  });
}

// ─── Surface Dispatcher ────────────────────────────────────────────

/**
 * Tagged result of compiling any surface. The CLI and MCP server
 * switch on `surface` to pick the right output path, diagnostic
 * presentation, and artifact emission.
 */
export type AnyCompileResult =
  | ({ surface: "intent" } & CompileResult)
  | ({ surface: "view" } & ViewCompileResult)
  | ({ surface: "widget" } & WidgetCompileResult)
  | ({ surface: "app" } & AppCompileResult)
  | ({ surface: "liveActivity" } & LiveActivityCompileResult)
  | ({ surface: "appEnum" } & AppEnumCompileResult);

/**
 * Compile a TypeScript source string, auto-detecting whether it
 * defines an intent, view, widget, or app. Returns a diagnostic if
 * no supported `define*` call is found.
 */
export function compileAnySource(
  source: string,
  fileName: string = "<stdin>",
  options: Partial<CompilerOptions> = {}
): AnyCompileResult {
  const surface = detectSurface(source, fileName);

  if (!surface) {
    return {
      surface: "intent",
      success: false,
      diagnostics: [
        {
          code: "AX001",
          severity: "error",
          message: `No defineIntent, defineView, defineWidget, defineApp, defineLiveActivity, or defineAppEnum call found in ${fileName}`,
          file: fileName,
          suggestion:
            "Add a top-level `defineIntent({ ... })`, `defineView({ ... })`, `defineWidget({ ... })`, `defineApp({ ... })`, `defineLiveActivity({ ... })`, or `defineAppEnum({ ... })` call.",
        },
      ],
    };
  }

  return dispatchCompile(surface, source, fileName, options);
}

/**
 * Compile a TypeScript file from disk, auto-detecting the surface.
 */
export function compileAnyFile(
  filePath: string,
  options: Partial<CompilerOptions> = {}
): AnyCompileResult {
  const result = readSourceFileOrDiagnostics(filePath);
  if (!result.ok) {
    return {
      surface: "intent",
      success: false,
      diagnostics: result.diagnostics,
    };
  }

  return compileAnySource(result.source, filePath, options);
}

function dispatchCompile(
  surface: Surface,
  source: string,
  fileName: string,
  options: Partial<CompilerOptions>
): AnyCompileResult {
  switch (surface) {
    case "intent":
      return { surface, ...compileSource(source, fileName, options) };
    case "view":
      return { surface, ...compileViewSource(source, fileName, options) };
    case "widget":
      return { surface, ...compileWidgetSource(source, fileName, options) };
    case "app":
      return { surface, ...compileAppSource(source, fileName, options) };
    case "liveActivity":
      return { surface, ...compileLiveActivitySource(source, fileName, options) };
    case "appEnum":
      return { surface, ...compileAppEnumSource(source, fileName, options) };
  }
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
  const entities = normalizeEntities(data.entities);
  const parameters: IRParameter[] = ((data.parameters as unknown[]) ?? []).map((p) =>
    normalizeIRParameter(p as Record<string, unknown>, entities)
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
    parameterSummary: normalizeParameterSummary(data.parameterSummary),
    entities: entities.length > 0 ? entities : undefined,
    donateOnPerform: data.donateOnPerform as boolean | undefined,
    customResultType: data.customResultType as string | undefined,
  };
}

function normalizeIRParameter(
  param: Record<string, unknown>,
  entities: IREntity[]
): IRParameter {
  return {
    name: param.name as string,
    type: normalizeIRParameterType(param, entities),
    title: (param.title as string) ?? (param.description as string) ?? "",
    description: (param.description as string) ?? "",
    isOptional: (param.optional as boolean) ?? (param.isOptional as boolean) ?? false,
    defaultValue: param.default ?? param.defaultValue,
  };
}

function normalizeIRParameterType(
  param: Record<string, unknown>,
  entities: IREntity[]
): IRType {
  const rawType = param.type;

  if (typeof rawType === "string") {
    const normalized = rawType === "number" ? "int" : rawType;
    if (VALID_PRIMITIVES.has(normalized)) {
      return { kind: "primitive", value: normalized as IRPrimitiveType };
    }
    if (normalized === "entity") {
      const entityName = (param.entityName as string | undefined) ?? "Entity";
      const entity = entities.find((entry) => entry.name === entityName);
      return {
        kind: "entity",
        entityName,
        properties: entity?.properties ?? [],
      };
    }
    if (normalized === "enum") {
      const cases = readStringArray(param.enumCases);
      return {
        kind: "enum",
        name: enumTypeName(param.name as string | undefined),
        cases,
      };
    }
    if (normalized === "dynamicOptions") {
      return {
        kind: "dynamicOptions",
        providerName:
          (param.providerName as string | undefined) ?? "DynamicOptionsProvider",
        valueType: normalizeIRType(param.valueType ?? param.innerType ?? "string"),
      };
    }
    return { kind: "primitive", value: "string" };
  }

  return normalizeIRType(rawType, entities);
}

/**
 * Normalize a type value from JSON. The Python SDK sends types as
 * plain strings ("string", "int", etc.) while the TS IR uses
 * `{ kind: "primitive", value: "string" }`. This function handles both.
 */
function normalizeIRType(type: unknown, entities: IREntity[] = []): IRType {
  if (typeof type === "string") {
    const normalized = type === "number" ? "int" : type;
    if (VALID_PRIMITIVES.has(normalized)) {
      return { kind: "primitive", value: normalized as IRPrimitiveType };
    }
    return { kind: "primitive", value: "string" };
  }
  if (type && typeof type === "object") {
    const t = type as Record<string, unknown>;
    if (t.kind === "primitive") {
      return {
        kind: "primitive",
        value: String(t.value === "number" ? "int" : t.value) as IRPrimitiveType,
      };
    }
    if (t.kind === "array")
      return { kind: "array", elementType: normalizeIRType(t.elementType, entities) };
    if (t.kind === "optional")
      return { kind: "optional", innerType: normalizeIRType(t.innerType, entities) };
    if (t.kind === "entity") {
      const entityName = t.entityName as string;
      const entity = entities.find((entry) => entry.name === entityName);
      return {
        kind: "entity",
        entityName,
        properties:
          normalizeIRParameters(t.properties, entities) ?? entity?.properties ?? [],
      };
    }
    if (t.kind === "entityQuery") {
      return {
        kind: "entityQuery",
        entityName: t.entityName as string,
        queryType: (t.queryType as "all" | "id" | "string" | "property") ?? "id",
      };
    }
    if (t.kind === "dynamicOptions") {
      return {
        kind: "dynamicOptions",
        providerName: (t.providerName as string | undefined) ?? "DynamicOptionsProvider",
        valueType: normalizeIRType(t.valueType ?? t.innerType ?? "string", entities),
      };
    }
    if (t.kind === "enum") {
      return {
        kind: "enum",
        name: (t.name as string | undefined) ?? enumTypeName(undefined),
        cases: readStringArray(t.cases),
      };
    }
  }
  // Default fallback
  return { kind: "primitive", value: "string" };
}

function normalizeEntities(value: unknown): IREntity[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const entity = entry as Record<string, unknown>;
    const display = (entity.displayRepresentation ?? {}) as Record<string, unknown>;
    return {
      name: entity.name as string,
      displayRepresentation: {
        title: (display.title as string | undefined) ?? "name",
        subtitle: display.subtitle as string | undefined,
        image: display.image as string | undefined,
      },
      properties: normalizeIRParameters(entity.properties, []) ?? [],
      queryType:
        (entity.queryType as "all" | "id" | "string" | "property" | undefined) ?? "id",
    };
  });
}

function normalizeIRParameters(
  value: unknown,
  entities: IREntity[]
): IRParameter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) =>
    normalizeIRParameter(entry as Record<string, unknown>, entities)
  );
}

function normalizeParameterSummary(value: unknown): IRParameterSummary | undefined {
  if (typeof value === "string") {
    return { kind: "summary", template: value };
  }
  if (!value || typeof value !== "object") return undefined;

  const summary = value as Record<string, unknown>;
  if (summary.kind === "summary" && typeof summary.template === "string") {
    return {
      kind: "summary",
      template: summary.template,
    };
  }
  if (summary.kind === "when" && typeof summary.parameter === "string") {
    return {
      kind: "when",
      parameter: summary.parameter,
      then: normalizeParameterSummary(summary.then) ?? { kind: "summary", template: "" },
      otherwise: normalizeParameterSummary(summary.otherwise),
    };
  }
  if (summary.kind === "switch" && typeof summary.parameter === "string") {
    const cases = Array.isArray(summary.cases)
      ? summary.cases
          .map((entry) => {
            const item = entry as Record<string, unknown>;
            if (!("value" in item)) return null;
            const caseSummary = normalizeParameterSummary(item.summary);
            if (!caseSummary) return null;
            return {
              value: item.value as string | number | boolean,
              summary: caseSummary,
            };
          })
          .filter(
            (
              entry
            ): entry is {
              value: string | number | boolean;
              summary: IRParameterSummary;
            } => entry !== null
          )
      : [];

    return {
      kind: "switch",
      parameter: summary.parameter,
      cases,
      default: normalizeParameterSummary(summary.default),
    };
  }
  if (typeof summary.when === "string") {
    return {
      kind: "when",
      parameter: summary.when,
      then: normalizeParameterSummary(summary.then) ?? { kind: "summary", template: "" },
      otherwise: normalizeParameterSummary(summary.otherwise),
    };
  }

  if (typeof summary.switch === "string") {
    const cases = Array.isArray(summary.cases)
      ? summary.cases
          .map((entry) => {
            const item = entry as Record<string, unknown>;
            if (!("value" in item)) return null;
            const summaryValue = normalizeParameterSummary(item.summary);
            if (!summaryValue) return null;
            return {
              value: item.value as string | number | boolean,
              summary: summaryValue,
            };
          })
          .filter(
            (
              entry
            ): entry is {
              value: string | number | boolean;
              summary: IRParameterSummary;
            } => entry !== null
          )
      : [];

    return {
      kind: "switch",
      parameter: summary.switch,
      cases,
      default: normalizeParameterSummary(summary.default),
    };
  }

  return undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function enumTypeName(name: string | undefined): string {
  const base = (name ?? "Choice").replace(/[^A-Za-z0-9]+/g, " ");
  const pascal = base
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return `${pascal || "Choice"}Option`;
}
