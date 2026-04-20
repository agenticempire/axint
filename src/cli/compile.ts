import type { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import {
  compileAnyFile,
  compileFromIR,
  irFromJSON,
  type AnyCompileResult,
} from "../core/compiler.js";
import type { Diagnostic } from "../core/types.js";
import { emitFixPacketArtifacts } from "../repair/fix-packet.js";

/**
 * Count non-blank lines in a source string. Blank lines (whitespace
 * only) don't carry semantic weight on either the TS or Swift side
 * and would distort the ratio toward whichever input was more
 * generously formatted.
 */
export function countNonBlankLines(source: string): number {
  let count = 0;
  for (const line of source.split("\n")) {
    if (line.trim().length > 0) count++;
  }
  return count;
}

/**
 * Render a Swift-over-TS size ratio (e.g. "0.42x" meaning the Swift
 * output is 42% the size of the TS input, i.e. compressed; "1.50x"
 * meaning the Swift output grew to 150% of the TS input, i.e.
 * expanded). Callers pick the right label based on the ratio.
 * `null` means the ratio is not meaningful - either side has zero
 * non-blank lines.
 */
export function compressionRatio(tsLines: number, swiftLines: number): string | null {
  if (tsLines === 0 || swiftLines === 0) return null;
  return `${(swiftLines / tsLines).toFixed(2)}x`;
}

interface UnifiedOutput {
  outputPath: string;
  swiftCode: string;
  diagnostics: Diagnostic[];
  irName: string;
  infoPlistFragment?: string;
  entitlementsFragment?: string;
}

/**
 * Flatten the surface-specific result shape into a single output
 * view so downstream CLI formatting doesn't have to fork on surface.
 */
function unifyOutput(result: AnyCompileResult): UnifiedOutput | null {
  if (!result.success || !result.output) return null;

  if (result.surface === "intent") {
    return {
      outputPath: result.output.outputPath,
      swiftCode: result.output.swiftCode,
      diagnostics: result.output.diagnostics,
      irName: result.output.ir.name,
      infoPlistFragment: result.output.infoPlistFragment,
      entitlementsFragment: result.output.entitlementsFragment,
    };
  }

  return {
    outputPath: result.output.outputPath,
    swiftCode: result.output.swiftCode,
    diagnostics: result.output.diagnostics,
    irName: result.output.ir.name,
  };
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    const prefix =
      d.severity === "error"
        ? "\x1b[31merror\x1b[0m"
        : d.severity === "warning"
          ? "\x1b[33mwarning\x1b[0m"
          : "\x1b[36minfo\x1b[0m";

    console.error(`  ${prefix}[${d.code}]: ${d.message}`);
    if (d.file) console.error(`    --> ${d.file}${d.line ? `:${d.line}` : ""}`);
    if (d.suggestion) console.error(`    = help: ${d.suggestion}`);
    console.error();
  }
}

export function registerCompile(program: Command) {
  program
    .command("compile")
    .description("Compile a TypeScript surface (intent, view, widget, or app) into Swift")
    .argument("<file>", "Path to the TypeScript surface definition")
    .option("-o, --out <dir>", "Output directory for generated Swift", ".")
    .option("--no-validate", "Skip validation of generated Swift")
    .option("--stdout", "Print generated Swift to stdout instead of writing a file")
    .option("--json", "Output result as JSON (machine-readable)")
    .option(
      "--emit-info-plist",
      "Emit a <Name>.plist.fragment.xml with NSAppIntentsDomains next to the Swift file (intents only)"
    )
    .option(
      "--emit-entitlements",
      "Emit a <Name>.entitlements.fragment.xml next to the Swift file (intents only)"
    )
    .option(
      "--sandbox",
      "Run stage 4 validation: swift build in an SPM sandbox (macOS only)"
    )
    .option(
      "--format",
      "Pipe generated Swift through swift-format with the Axint house style (macOS/Linux if swift-format is on $PATH)"
    )
    .option(
      "--strict-format",
      "Fail the build if swift-format is missing or errors (implies --format)"
    )
    .option(
      "--from-ir",
      "Treat <file> as intent IR JSON (from Python SDK or any language) instead of TypeScript. Use - to read from stdin."
    )
    .option(
      "--no-fix-packet",
      "Skip writing the local Fix Packet under .axint/fix/latest.{json,md}"
    )
    .option(
      "--fix-packet-dir <dir>",
      "Directory for the emitted Fix Packet artifacts",
      ".axint/fix"
    )
    .action(
      async (
        file: string,
        options: {
          out: string;
          validate: boolean;
          stdout: boolean;
          json: boolean;
          emitInfoPlist: boolean;
          emitEntitlements: boolean;
          sandbox: boolean;
          format: boolean;
          strictFormat: boolean;
          fromIr: boolean;
          fixPacket: boolean;
          fixPacketDir: string;
        }
      ) => {
        const filePath = resolve(file);

        try {
          let surface: "intent" | "view" | "widget" | "app";
          let output: UnifiedOutput | null;
          let diagnostics: Diagnostic[];
          let success: boolean;
          let inputSource: string | undefined;
          let inputFilePath: string | undefined;
          const language: "typescript" | "json" = options.fromIr ? "json" : "typescript";

          if (options.fromIr) {
            let irRaw: string;
            if (file === "-") {
              const chunks: Buffer[] = [];
              for await (const chunk of process.stdin) {
                chunks.push(chunk as Buffer);
              }
              irRaw = Buffer.concat(chunks).toString("utf-8");
            } else {
              irRaw = readFileSync(filePath, "utf-8");
            }
            inputSource = irRaw;
            inputFilePath = file === "-" ? undefined : filePath;

            let parsed: unknown;
            try {
              parsed = JSON.parse(irRaw);
            } catch {
              console.error(`\x1b[31merror:\x1b[0m Invalid JSON in ${file}`);
              process.exit(1);
            }

            const irData = Array.isArray(parsed)
              ? (parsed[0] as Record<string, unknown>)
              : (parsed as Record<string, unknown>);
            if (!irData || typeof irData !== "object") {
              console.error(
                `\x1b[31merror:\x1b[0m Expected an IR object or array in ${file}`
              );
              process.exit(1);
            }

            const ir = irFromJSON(irData);
            const result = compileFromIR(ir, {
              outDir: options.out,
              validate: options.validate,
              emitInfoPlist: options.emitInfoPlist,
              emitEntitlements: options.emitEntitlements,
            });
            surface = "intent";
            diagnostics = result.diagnostics;
            success = result.success;
            output =
              result.success && result.output
                ? {
                    outputPath: result.output.outputPath,
                    swiftCode: result.output.swiftCode,
                    diagnostics: result.output.diagnostics,
                    irName: result.output.ir.name,
                    infoPlistFragment: result.output.infoPlistFragment,
                    entitlementsFragment: result.output.entitlementsFragment,
                  }
                : null;
          } else {
            try {
              inputSource = readFileSync(filePath, "utf-8");
              inputFilePath = filePath;
            } catch {
              inputSource = undefined;
              inputFilePath = filePath;
            }
            const result = compileAnyFile(filePath, {
              outDir: options.out,
              validate: options.validate,
              emitInfoPlist: options.emitInfoPlist,
              emitEntitlements: options.emitEntitlements,
            });
            surface = result.surface;
            diagnostics = result.diagnostics;
            success = result.success;
            output = unifyOutput(result);

            if (
              result.surface !== "intent" &&
              (options.emitInfoPlist || options.emitEntitlements)
            ) {
              console.error(
                `\x1b[33mwarning:\x1b[0m --emit-info-plist and --emit-entitlements apply to intents only; ignored for ${result.surface}.`
              );
            }
          }

          let packetArtifacts: ReturnType<typeof emitFixPacketArtifacts> | null = null;
          if (options.fixPacket) {
            try {
              const resolvedOutputPath =
                success && output && !options.stdout
                  ? resolve(output.outputPath)
                  : undefined;
              packetArtifacts = emitFixPacketArtifacts(
                {
                  success,
                  surface,
                  diagnostics,
                  source: inputSource,
                  fileName:
                    file === "-"
                      ? "stdin.ir.json"
                      : inputFilePath
                        ? basename(inputFilePath)
                        : basename(filePath),
                  filePath: inputFilePath,
                  language,
                  outputPath: resolvedOutputPath,
                  infoPlistPath:
                    success &&
                    output &&
                    !options.stdout &&
                    surface === "intent" &&
                    options.emitInfoPlist &&
                    output.infoPlistFragment
                      ? resolve(output.outputPath).replace(
                          /\.swift$/,
                          ".plist.fragment.xml"
                        )
                      : undefined,
                  entitlementsPath:
                    success &&
                    output &&
                    !options.stdout &&
                    surface === "intent" &&
                    options.emitEntitlements &&
                    output.entitlementsFragment
                      ? resolve(output.outputPath).replace(
                          /\.swift$/,
                          ".entitlements.fragment.xml"
                        )
                      : undefined,
                  packetDir: options.fixPacketDir,
                  command: "compile",
                },
                process.cwd()
              );
            } catch (packetErr: unknown) {
              console.error(
                `\x1b[33mwarning:\x1b[0m Fix Packet skipped — ${(packetErr as Error).message}`
              );
            }
          }

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success,
                  surface,
                  swift: output?.swiftCode ?? null,
                  outputPath: output?.outputPath ?? null,
                  infoPlistFragment: output?.infoPlistFragment ?? null,
                  entitlementsFragment: output?.entitlementsFragment ?? null,
                  diagnostics: diagnostics.map((d) => ({
                    code: d.code,
                    severity: d.severity,
                    message: d.message,
                    file: d.file,
                    line: d.line,
                    suggestion: d.suggestion,
                  })),
                },
                null,
                2
              )
            );
            if (!success) process.exit(1);
            return;
          }

          printDiagnostics(diagnostics);

          if (!success || !output) {
            if (packetArtifacts) {
              console.error(`\x1b[36m→\x1b[0m Fix Packet → ${packetArtifacts.jsonPath}`);
            }
            const errorCount = diagnostics.filter((d) => d.severity === "error").length;
            console.error(
              `\x1b[31mCompilation failed with ${errorCount} error(s)\x1b[0m`
            );
            process.exit(1);
          }

          if (options.format || options.strictFormat) {
            try {
              const { formatSwift } = await import("../core/format.js");
              const fmt = await formatSwift(output.swiftCode, {
                strict: options.strictFormat,
              });
              if (fmt.ran) {
                output.swiftCode = fmt.formatted;
              } else {
                console.error(
                  `\x1b[33mwarning:\x1b[0m swift-format skipped — ${fmt.reason}`
                );
              }
            } catch (fmtErr: unknown) {
              if (options.strictFormat) {
                console.error(`\x1b[31merror:\x1b[0m ${(fmtErr as Error).message}`);
                process.exit(1);
              }
              console.error(
                `\x1b[33mwarning:\x1b[0m swift-format skipped — ${(fmtErr as Error).message}`
              );
            }
          }

          if (options.stdout) {
            console.log(output.swiftCode);
          } else {
            const outPath = resolve(output.outputPath);
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, output.swiftCode, "utf-8");
            console.log(
              `\x1b[32m✓\x1b[0m Compiled ${surface} ${output.irName} → ${outPath}`
            );

            // Show TS-to-Swift compression so authors can eyeball whether
            // a definition expanded the way they expected. Skipped for
            // --from-ir since "TS lines" isn't meaningful there.
            if (!options.fromIr && inputSource) {
              try {
                const tsLines = countNonBlankLines(inputSource);
                const swiftLines = countNonBlankLines(output.swiftCode);
                const ratio = compressionRatio(tsLines, swiftLines);
                if (ratio !== null) {
                  const label = swiftLines > tsLines ? "Expansion" : "Compression";
                  console.log(
                    `\x1b[36m→\x1b[0m ${label}: ${tsLines} TS → ${swiftLines} Swift (${ratio})`
                  );
                }
              } catch {
                // Non-fatal: we just skip the ratio if the TS source
                // can't be re-read for any reason.
              }
            }

            if (
              surface === "intent" &&
              options.emitInfoPlist &&
              output.infoPlistFragment
            ) {
              const plistPath = outPath.replace(/\.swift$/, ".plist.fragment.xml");
              writeFileSync(plistPath, output.infoPlistFragment, "utf-8");
              console.log(`\x1b[32m✓\x1b[0m Info.plist fragment → ${plistPath}`);
            }

            if (
              surface === "intent" &&
              options.emitEntitlements &&
              output.entitlementsFragment
            ) {
              const entPath = outPath.replace(/\.swift$/, ".entitlements.fragment.xml");
              writeFileSync(entPath, output.entitlementsFragment, "utf-8");
              console.log(`\x1b[32m✓\x1b[0m Entitlements fragment → ${entPath}`);
            }

            if (packetArtifacts) {
              console.log(`\x1b[36m→\x1b[0m Fix Packet → ${packetArtifacts.jsonPath}`);
            }
          }

          if (options.sandbox && !options.stdout) {
            try {
              const { sandboxCompile } = await import("../core/sandbox.js");
              console.log();
              console.log(`\x1b[36m→\x1b[0m Stage 4: SPM sandbox compile...`);
              const sandboxResult = await sandboxCompile(output.swiftCode, {
                intentName: output.irName,
              });
              if (sandboxResult.ok) {
                console.log(
                  `\x1b[32m✓\x1b[0m Swift builds cleanly (${sandboxResult.durationMs}ms in ${sandboxResult.sandboxPath})`
                );
              } else {
                console.error(
                  `\x1b[31m✗\x1b[0m Sandbox compile failed:\n${sandboxResult.stderr}`
                );
                process.exit(1);
              }
            } catch (sbErr: unknown) {
              console.error(
                `\x1b[33mwarning:\x1b[0m sandbox compile skipped — ${(sbErr as Error).message}`
              );
            }
          }

          const warnings = diagnostics.filter((d) => d.severity === "warning").length;
          if (warnings > 0) {
            console.log(`  ${warnings} warning(s)`);
          }
        } catch (err: unknown) {
          if (
            err &&
            typeof err === "object" &&
            "format" in err &&
            typeof (err as Record<string, unknown>).format === "function"
          ) {
            console.error((err as { format: () => string }).format());
          } else {
            console.error(`\x1b[31merror:\x1b[0m ${err}`);
          }
          process.exit(1);
        }
      }
    );
}
