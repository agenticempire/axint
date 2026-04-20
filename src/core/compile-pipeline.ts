import { readFileSync } from "node:fs";
import { ParserError } from "./parser.js";
import type { CompilerOptions, Diagnostic } from "./types.js";

type CompileFailure = {
  success: false;
  diagnostics: Diagnostic[];
};

type CompileSuccess<TOutput> = {
  success: true;
  output: TOutput;
  diagnostics: Diagnostic[];
};

export type GenericCompileResult<TOutput> = CompileFailure | CompileSuccess<TOutput>;

export function readSourceFileOrDiagnostics(
  filePath: string
): { ok: true; source: string } | { ok: false; diagnostics: Diagnostic[] } {
  try {
    return {
      ok: true,
      source: readFileSync(filePath, "utf-8"),
    };
  } catch {
    return {
      ok: false,
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
}

export function compileSourceWithParser<TIR, TOutput>(args: {
  source: string;
  fileName: string;
  options: Partial<CompilerOptions>;
  parse: (source: string, fileName: string) => TIR;
  compileFromIR: (
    ir: TIR,
    options: Partial<CompilerOptions>
  ) => { success: boolean; output?: TOutput; diagnostics: Diagnostic[] };
}): { success: boolean; output?: TOutput; diagnostics: Diagnostic[] } {
  let ir: TIR;
  try {
    ir = args.parse(args.source, args.fileName);
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

  return args.compileFromIR(ir, args.options);
}

export function runCompilePipeline<TIR, TOutput>(args: {
  ir: TIR;
  options: Partial<CompilerOptions>;
  validateIR: (ir: TIR) => Diagnostic[];
  generateSwift: (ir: TIR) => string;
  validateGeneratedSwift?: (swiftCode: string, ir: TIR) => Diagnostic[];
  outputFileName: (ir: TIR) => string;
  buildOutput: (payload: {
    outputPath: string;
    swiftCode: string;
    ir: TIR;
    diagnostics: Diagnostic[];
  }) => TOutput;
}): GenericCompileResult<TOutput> {
  const diagnostics: Diagnostic[] = [];

  const irDiagnostics = args.validateIR(args.ir);
  diagnostics.push(...irDiagnostics);

  if (hasErrorDiagnostics(irDiagnostics)) {
    return { success: false, diagnostics };
  }

  const swiftCode = args.generateSwift(args.ir);

  if (args.options.validate !== false && args.validateGeneratedSwift) {
    const swiftDiagnostics = args.validateGeneratedSwift(swiftCode, args.ir);
    diagnostics.push(...swiftDiagnostics);

    if (hasErrorDiagnostics(swiftDiagnostics)) {
      return { success: false, diagnostics };
    }
  }

  const outputPath = buildOutputPath(args.outputFileName(args.ir), args.options.outDir);

  return {
    success: true,
    output: args.buildOutput({
      outputPath,
      swiftCode,
      ir: args.ir,
      diagnostics,
    }),
    diagnostics,
  };
}

function buildOutputPath(fileName: string, outDir?: string): string {
  return outDir ? `${outDir}/${fileName}` : fileName;
}

function hasErrorDiagnostics(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
