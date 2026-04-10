/**
 * swift-format integration (optional post-processor)
 *
 * After codegen, optionally pipe the emitted Swift through Apple's
 * `swift-format` tool with a house style file that mirrors Apple's own
 * codebase. This is the last stage of the pipeline that runs before
 * writing to disk.
 *
 * `swift-format` ships with the Swift toolchain on macOS. If the binary
 * isn't on $PATH (Linux CI, Windows, containers) we log a warning and
 * return the source unchanged rather than failing the build — the
 * generator already emits valid, well-indented Swift without it.
 */

import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface FormatOptions {
  /** Hard timeout in ms for the swift-format call (default 8s) */
  timeoutMs?: number;
  /** Throw on failure instead of returning the original source */
  strict?: boolean;
}

export interface FormatResult {
  formatted: string;
  ran: boolean;
  reason?: string;
}

/** The house style file — tracks Apple's swift-format defaults + Axint tweaks. */
export const SWIFT_FORMAT_CONFIG = {
  version: 1,
  lineLength: 100,
  indentation: { spaces: 4 },
  tabWidth: 4,
  maximumBlankLines: 1,
  respectsExistingLineBreaks: true,
  lineBreakBeforeControlFlowKeywords: false,
  lineBreakBeforeEachArgument: false,
  lineBreakBeforeEachGenericRequirement: false,
  prioritizeKeepingFunctionOutputTogether: false,
  indentConditionalCompilationBlocks: true,
  lineBreakAroundMultilineExpressionChainComponents: false,
  fileScopedDeclarationPrivacy: { accessLevel: "private" },
  rules: {
    AllPublicDeclarationsHaveDocumentation: false,
    AlwaysUseLowerCamelCase: true,
    AmbiguousTrailingClosureOverload: true,
    BeginDocumentationCommentWithOneLineSummary: false,
    DoNotUseSemicolons: true,
    DontRepeatTypeInStaticProperties: true,
    FileScopedDeclarationPrivacy: true,
    FullyIndirectEnum: true,
    GroupNumericLiterals: true,
    IdentifiersMustBeASCII: true,
    NeverForceUnwrap: false,
    NeverUseForceTry: false,
    NeverUseImplicitlyUnwrappedOptionals: false,
    NoBlockComments: false,
    NoCasesWithOnlyFallthrough: true,
    NoEmptyTrailingClosureParentheses: true,
    NoLabelsInCasePatterns: true,
    NoLeadingUnderscores: false,
    NoParensAroundConditions: true,
    NoVoidReturnOnFunctionSignature: true,
    OneCasePerLine: true,
    OneVariableDeclarationPerLine: true,
    OnlyOneTrailingClosureArgument: true,
    OrderedImports: true,
    ReturnVoidInsteadOfEmptyTuple: true,
    UseEarlyExits: false,
    UseLetInEveryBoundCaseVariable: true,
    UseShorthandTypeNames: true,
    UseSingleLinePropertyGetter: true,
    UseSynthesizedInitializer: true,
    UseTripleSlashForDocumentationComments: true,
    UseWhereClausesInForLoops: false,
    ValidateDocumentationComments: false,
  },
} as const;

/**
 * Run swift-format against a Swift source string and return the formatted
 * output. Falls back to the original source if swift-format is unavailable.
 */
export async function formatSwift(
  source: string,
  options: FormatOptions = {}
): Promise<FormatResult> {
  const available = await hasSwiftFormat();
  if (!available) {
    if (options.strict) {
      throw new Error(
        "swift-format not found on $PATH. Install Xcode + Command Line Tools, or drop --format."
      );
    }
    return {
      formatted: source,
      ran: false,
      reason: "swift-format not found on $PATH",
    };
  }

  const configPath = join(
    tmpdir(),
    `axint-swift-format-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  await writeFile(configPath, JSON.stringify(SWIFT_FORMAT_CONFIG, null, 2));

  try {
    const result = await runSwiftFormat(source, configPath, options.timeoutMs ?? 8_000);
    if (result.code === 0) {
      return { formatted: result.stdout, ran: true };
    }
    if (options.strict) {
      throw new Error(`swift-format failed: ${result.stderr}`);
    }
    return {
      formatted: source,
      ran: false,
      reason: `swift-format exited ${result.code}: ${result.stderr}`,
    };
  } finally {
    await unlink(configPath).catch(() => undefined);
  }
}

function hasSwiftFormat(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("swift-format", ["--version"], { stdio: "pipe" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

function runSwiftFormat(
  source: string,
  configPath: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn("swift-format", ["format", "--configuration", configPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        stdout,
        stderr: stderr + `\n[format] killed after ${timeoutMs}ms`,
        code: 124,
      });
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.stdin?.write(source);
    child.stdin?.end();
  });
}
