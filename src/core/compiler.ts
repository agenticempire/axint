/**
 * Axint Compiler
 *
 * Orchestrates the full compilation pipeline:
 *   1. Parse TypeScript intent definition → IR
 *   2. Validate IR against App Intents constraints
 *   3. Generate Swift source code
 *   4. Validate generated Swift
 *
 * This is the main entry point for the compilation process.
 */

import { readFileSync } from "node:fs";
import { parseIntentSource } from "./parser.js";
import { generateSwift } from "./generator.js";
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
  const diagnostics: Diagnostic[] = [];

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

  // 2. Parse → IR
  const ir = parseIntentSource(source, filePath);

  // 3. Validate IR
  const irDiagnostics = validateIntent(ir);
  diagnostics.push(...irDiagnostics);

  const hasErrors = irDiagnostics.some((d) => d.severity === "error");
  if (hasErrors) {
    return { success: false, diagnostics };
  }

  // 4. Generate Swift
  const swiftCode = generateSwift(ir);

  // 5. Validate generated Swift
  if (options.validate !== false) {
    const swiftDiagnostics = validateSwiftSource(swiftCode);
    diagnostics.push(...swiftDiagnostics);

    if (swiftDiagnostics.some((d) => d.severity === "error")) {
      return { success: false, diagnostics };
    }
  }

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
      ir,
      diagnostics,
    },
    diagnostics,
  };
}

/**
 * Compile a TypeScript source string directly (no file I/O).
 * Useful for MCP server and testing.
 */
export function compileSource(
  source: string,
  fileName: string = "<stdin>"
): CompileResult {
  const diagnostics: Diagnostic[] = [];

  const ir = parseIntentSource(source, fileName);

  const irDiagnostics = validateIntent(ir);
  diagnostics.push(...irDiagnostics);

  if (irDiagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  const swiftCode = generateSwift(ir);

  const swiftDiagnostics = validateSwiftSource(swiftCode);
  diagnostics.push(...swiftDiagnostics);

  return {
    success: !swiftDiagnostics.some((d) => d.severity === "error"),
    output: {
      outputPath: `${ir.name}Intent.swift`,
      swiftCode,
      ir,
      diagnostics,
    },
    diagnostics,
  };
}
