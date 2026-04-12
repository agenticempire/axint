import type { Command } from "commander";
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  watch as fsWatch,
  statSync,
} from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { spawn } from "node:child_process";
import { compileFile } from "../core/compiler.js";

async function runSwiftBuild(projectPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const proc = spawn("swift", ["build"], {
      cwd: projectPath,
      stdio: ["ignore", "inherit", "inherit"],
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const dt = (performance.now() - t0).toFixed(0);
        console.log();
        console.log(`\x1b[38;5;208m─ swift build\x1b[0m`);
        console.log(`\x1b[32m✓\x1b[0m Build succeeded \x1b[90m(${dt}ms)\x1b[0m`);
        console.log();
        resolve(true);
      } else {
        console.log();
        console.log(`\x1b[38;5;208m─ swift build\x1b[0m`);
        console.log(`\x1b[31m✗\x1b[0m Build failed (exit code: ${code})`);
        console.log("\x1b[90mContinuing to watch for changes…\x1b[0m");
        console.log();
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      console.log();
      console.log(`\x1b[38;5;208m─ swift build\x1b[0m`);
      console.error(`\x1b[31m✗\x1b[0m Error: ${err.message}`);
      console.log("\x1b[90mContinuing to watch for changes…\x1b[0m");
      console.log();
      resolve(false);
    });
  });
}

export function registerWatch(program: Command) {
  program
    .command("watch")
    .description("Watch intent files and recompile on change")
    .argument("<file>", "Path to a TypeScript intent file or directory of intents")
    .option("-o, --out <dir>", "Output directory for generated Swift", ".")
    .option("--no-validate", "Skip validation of generated Swift")
    .option("--emit-info-plist", "Emit Info.plist fragments alongside Swift files")
    .option("--emit-entitlements", "Emit entitlements fragments alongside Swift files")
    .option("--format", "Pipe generated Swift through swift-format")
    .option(
      "--strict-format",
      "Fail if swift-format is missing or errors (implies --format)"
    )
    .option(
      "--swift-build",
      "Run `swift build` in the project after successful compilation"
    )
    .option(
      "--swift-project <path>",
      "Path to the Swift project root (defaults to --out parent directory)"
    )
    .action(
      async (
        file: string,
        options: {
          out: string;
          validate: boolean;
          emitInfoPlist: boolean;
          emitEntitlements: boolean;
          format: boolean;
          strictFormat: boolean;
          swiftBuild: boolean;
          swiftProject?: string;
        }
      ) => {
        const target = resolve(file);
        const isDir = existsSync(target) && statSync(target).isDirectory();
        const filesToWatch: string[] = [];

        if (isDir) {
          const { readdirSync } = await import("node:fs");
          for (const entry of readdirSync(target)) {
            if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
              filesToWatch.push(resolve(target, entry));
            }
          }
          if (filesToWatch.length === 0) {
            console.error(`\x1b[31merror:\x1b[0m No .ts files found in ${target}`);
            process.exit(1);
          }
        } else {
          if (!existsSync(target)) {
            console.error(`\x1b[31merror:\x1b[0m File not found: ${target}`);
            process.exit(1);
          }
          filesToWatch.push(target);
        }

        const swiftProjectPath = options.swiftProject ?? dirname(resolve(options.out));

        function compileOne(filePath: string): boolean {
          const t0 = performance.now();
          const result = compileFile(filePath, {
            outDir: options.out,
            validate: options.validate,
            emitInfoPlist: options.emitInfoPlist,
            emitEntitlements: options.emitEntitlements,
          });

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
          }

          if (!result.success || !result.output) {
            const errors = result.diagnostics.filter(
              (d) => d.severity === "error"
            ).length;
            console.error(`\x1b[31m✗\x1b[0m ${basename(filePath)} — ${errors} error(s)`);
            return false;
          }

          const outPath = resolve(result.output.outputPath);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, result.output.swiftCode, "utf-8");

          if (options.emitInfoPlist && result.output.infoPlistFragment) {
            const plistPath = outPath.replace(/\.swift$/, ".plist.fragment.xml");
            writeFileSync(plistPath, result.output.infoPlistFragment, "utf-8");
          }
          if (options.emitEntitlements && result.output.entitlementsFragment) {
            const entPath = outPath.replace(/\.swift$/, ".entitlements.fragment.xml");
            writeFileSync(entPath, result.output.entitlementsFragment, "utf-8");
          }

          const dt = (performance.now() - t0).toFixed(1);
          console.log(
            `\x1b[32m✓\x1b[0m ${result.output.ir.name} → ${outPath} \x1b[90m(${dt}ms)\x1b[0m`
          );
          return true;
        }

        async function compileWithFormat(filePath: string): Promise<boolean> {
          if (!options.format && !options.strictFormat) {
            return compileOne(filePath);
          }

          const t0 = performance.now();
          const result = compileFile(filePath, {
            outDir: options.out,
            validate: options.validate,
            emitInfoPlist: options.emitInfoPlist,
            emitEntitlements: options.emitEntitlements,
          });

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
          }

          if (!result.success || !result.output) {
            const errors = result.diagnostics.filter(
              (d) => d.severity === "error"
            ).length;
            console.error(`\x1b[31m✗\x1b[0m ${basename(filePath)} — ${errors} error(s)`);
            return false;
          }

          let swiftCode = result.output.swiftCode;
          try {
            const { formatSwift } = await import("../core/format.js");
            const fmt = await formatSwift(swiftCode, { strict: options.strictFormat });
            if (fmt.ran) swiftCode = fmt.formatted;
          } catch (fmtErr: unknown) {
            if (options.strictFormat) {
              console.error(`\x1b[31merror:\x1b[0m ${(fmtErr as Error).message}`);
              return false;
            }
          }

          const outPath = resolve(result.output.outputPath);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, swiftCode, "utf-8");

          if (options.emitInfoPlist && result.output.infoPlistFragment) {
            writeFileSync(
              outPath.replace(/\.swift$/, ".plist.fragment.xml"),
              result.output.infoPlistFragment,
              "utf-8"
            );
          }
          if (options.emitEntitlements && result.output.entitlementsFragment) {
            writeFileSync(
              outPath.replace(/\.swift$/, ".entitlements.fragment.xml"),
              result.output.entitlementsFragment,
              "utf-8"
            );
          }

          const dt = (performance.now() - t0).toFixed(1);
          console.log(
            `\x1b[32m✓\x1b[0m ${result.output.ir.name} → ${outPath} \x1b[90m(${dt}ms)\x1b[0m`
          );
          return true;
        }

        console.log(`\x1b[1maxint watch\x1b[0m — ${filesToWatch.length} file(s)\n`);
        let ok = 0;
        let fail = 0;
        for (const f of filesToWatch) {
          if (await compileWithFormat(f)) {
            ok++;
          } else {
            fail++;
          }
        }
        console.log();
        if (fail > 0) {
          console.log(
            `\x1b[33m⚠\x1b[0m ${ok} compiled, ${fail} failed — watching for changes…\n`
          );
        } else {
          console.log(`\x1b[32m✓\x1b[0m ${ok} compiled — watching for changes…\n`);
          if (options.swiftBuild) {
            await runSwiftBuild(swiftProjectPath);
          }
        }

        const pending = new Map<string, ReturnType<typeof setTimeout>>();
        const DEBOUNCE_MS = 150;
        let batchInProgress = false;

        function onFileChange(filePath: string) {
          const existing = pending.get(filePath);
          if (existing) clearTimeout(existing);
          pending.set(
            filePath,
            setTimeout(async () => {
              pending.delete(filePath);
              if (batchInProgress) return;

              batchInProgress = true;
              try {
                const now = new Date().toLocaleTimeString();
                console.log(`\x1b[90m[${now}]\x1b[0m ${basename(filePath)} changed`);
                const compiled = await compileWithFormat(filePath);
                console.log();
                if (compiled && options.swiftBuild) {
                  await runSwiftBuild(swiftProjectPath);
                }
              } finally {
                batchInProgress = false;
              }
            }, DEBOUNCE_MS)
          );
        }

        if (isDir) {
          const dirWatcher = fsWatch(target, { persistent: true }, (_event, filename) => {
            if (
              filename &&
              typeof filename === "string" &&
              filename.endsWith(".ts") &&
              !filename.endsWith(".d.ts")
            ) {
              onFileChange(resolve(target, filename));
            }
          });
          dirWatcher.on("error", (err) => {
            if ((err as NodeJS.ErrnoException).code === "EMFILE") {
              console.error(
                `\x1b[31m✗\x1b[0m Too many open files. Raise the limit with: ulimit -n 4096`
              );
            } else {
              console.error(`\x1b[31m✗\x1b[0m watcher error: ${err.message}`);
            }
          });
        } else {
          const parentDir = dirname(target);
          const targetBase = basename(target);
          const fileWatcher = fsWatch(
            parentDir,
            { persistent: true },
            (_event, filename) => {
              if (filename === targetBase) {
                onFileChange(target);
              }
            }
          );
          fileWatcher.on("error", (err) => {
            if ((err as NodeJS.ErrnoException).code === "EMFILE") {
              console.error(
                `\x1b[31m✗\x1b[0m Too many open files. Raise the limit with: ulimit -n 4096`
              );
            } else {
              console.error(`\x1b[31m✗\x1b[0m watcher error: ${err.message}`);
            }
          });
        }

        process.on("SIGINT", () => {
          console.log("\n\x1b[90mStopped watching.\x1b[0m");
          process.exit(0);
        });
      }
    );
}
