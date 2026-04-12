import type { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { compileFile, compileFromIR, irFromJSON } from "../core/compiler.js";

export function registerCompile(program: Command) {
  program
    .command("compile")
    .description("Compile a TypeScript intent definition into Swift")
    .argument("<file>", "Path to the TypeScript intent definition")
    .option("-o, --out <dir>", "Output directory for generated Swift", ".")
    .option("--no-validate", "Skip validation of generated Swift")
    .option("--stdout", "Print generated Swift to stdout instead of writing a file")
    .option("--json", "Output result as JSON (machine-readable)")
    .option(
      "--emit-info-plist",
      "Emit a <Name>.plist.fragment.xml with NSAppIntentsDomains next to the Swift file"
    )
    .option(
      "--emit-entitlements",
      "Emit a <Name>.entitlements.fragment.xml next to the Swift file"
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
      "Treat <file> as IR JSON (from Python SDK or any language) instead of TypeScript. Use - to read from stdin."
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
        }
      ) => {
        const filePath = resolve(file);

        try {
          let result;

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
            result = compileFromIR(ir, {
              outDir: options.out,
              validate: options.validate,
              emitInfoPlist: options.emitInfoPlist,
              emitEntitlements: options.emitEntitlements,
            });
          } else {
            result = compileFile(filePath, {
              outDir: options.out,
              validate: options.validate,
              emitInfoPlist: options.emitInfoPlist,
              emitEntitlements: options.emitEntitlements,
            });
          }

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: result.success,
                  swift: result.output?.swiftCode ?? null,
                  outputPath: result.output?.outputPath ?? null,
                  infoPlistFragment: result.output?.infoPlistFragment ?? null,
                  entitlementsFragment: result.output?.entitlementsFragment ?? null,
                  diagnostics: result.diagnostics.map((d) => ({
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
            if (!result.success) process.exit(1);
            return;
          }

          for (const d of result.diagnostics) {
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

          if (!result.success || !result.output) {
            console.error(
              `\x1b[31mCompilation failed with ${result.diagnostics.filter((d) => d.severity === "error").length} error(s)\x1b[0m`
            );
            process.exit(1);
          }

          if (options.format || options.strictFormat) {
            try {
              const { formatSwift } = await import("../core/format.js");
              const fmt = await formatSwift(result.output.swiftCode, {
                strict: options.strictFormat,
              });
              if (fmt.ran) {
                result.output.swiftCode = fmt.formatted;
              } else if (!options.json) {
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
            console.log(result.output.swiftCode);
          } else {
            const outPath = resolve(result.output.outputPath);
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, result.output.swiftCode, "utf-8");
            console.log(
              `\x1b[32m✓\x1b[0m Compiled ${result.output.ir.name} → ${outPath}`
            );

            if (options.emitInfoPlist && result.output.infoPlistFragment) {
              const plistPath = outPath.replace(/\.swift$/, ".plist.fragment.xml");
              writeFileSync(plistPath, result.output.infoPlistFragment, "utf-8");
              console.log(`\x1b[32m✓\x1b[0m Info.plist fragment → ${plistPath}`);
            }

            if (options.emitEntitlements && result.output.entitlementsFragment) {
              const entPath = outPath.replace(/\.swift$/, ".entitlements.fragment.xml");
              writeFileSync(entPath, result.output.entitlementsFragment, "utf-8");
              console.log(`\x1b[32m✓\x1b[0m Entitlements fragment → ${entPath}`);
            }
          }

          if (options.sandbox && !options.stdout) {
            try {
              const { sandboxCompile } = await import("../core/sandbox.js");
              console.log();
              console.log(`\x1b[36m→\x1b[0m Stage 4: SPM sandbox compile...`);
              const sandboxResult = await sandboxCompile(result.output.swiftCode, {
                intentName: result.output.ir.name,
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

          const warnings = result.diagnostics.filter(
            (d) => d.severity === "warning"
          ).length;
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
