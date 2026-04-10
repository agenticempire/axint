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
import {
  generateSwift,
  generateInfoPlistFragment,
  generateEntitlementsFragment,
} from "./generator.js";
import { validateIntent, validateSwiftSource } from "./validator.js";
import type { CompilerOutput, CompilerOptions, Diagnostic } from "./types.js";

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
  const diagnostics: Diagnostic[] = [];

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

  // 2. Validate IR
  const irDiagnostics = validateIntent(ir);
  diagnostics.push(...irDiagnostics);

  if (irDiagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  // 3. Generate Swift
  const swiftCode = generateSwift(ir);

  // 4. Validate generated Swift
  if (options.validate !== false) {
    const swiftDiagnostics = validateSwiftSource(swiftCode);
    diagnostics.push(...swiftDiagnostics);

    if (swiftDiagnostics.some((d) => d.severity === "error")) {
      return { success: false, diagnostics };
    }
  }

  // 5. Optional fragments
  const infoPlistFragment = options.emitInfoPlist
    ? generateInfoPlistFragment(ir)
    : undefined;
  const entitlementsFragment = options.emitEntitlements
    ? generateEntitlementsFragment(ir)
    : undefined;

  // 6. Build output
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
