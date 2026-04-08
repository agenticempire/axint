/**
 * Axint CLI
 *
 * The command-line interface for the Axint compiler.
 *
 *   axint compile <file>     Compile TS intent → Swift App Intent
 *   axint validate <file>    Validate a compiled intent
 *   axint --version           Show version
 */

import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFile } from "../core/compiler.js";

// Read version from package.json so it stays in sync
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));
const VERSION = pkg.version as string;

const program = new Command();

program
  .name("axint")
  .description(
    "The open-source compiler that transforms AI agent definitions into native Apple App Intents."
  )
  .version(VERSION);

// ─── compile ─────────────────────────────────────────────────────────

program
  .command("compile")
  .description("Compile a TypeScript intent definition into Swift")
  .argument("<file>", "Path to the TypeScript intent definition")
  .option("-o, --out <dir>", "Output directory for generated Swift", ".")
  .option("--no-validate", "Skip validation of generated Swift")
  .option("--stdout", "Print generated Swift to stdout instead of writing a file")
  .option("--json", "Output result as JSON (machine-readable)")
  .action(
    (
      file: string,
      options: { out: string; validate: boolean; stdout: boolean; json: boolean }
    ) => {
      const filePath = resolve(file);

      try {
        const result = compileFile(filePath, {
          outDir: options.out,
          validate: options.validate,
        });

        // JSON mode — output everything as structured JSON and exit
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: result.success,
                swift: result.output?.swiftCode ?? null,
                outputPath: result.output?.outputPath ?? null,
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

        // Print diagnostics
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

        if (options.stdout) {
          console.log(result.output.swiftCode);
        } else {
          const outPath = resolve(result.output.outputPath);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, result.output.swiftCode, "utf-8");
          console.log(`\x1b[32m✓\x1b[0m Compiled ${result.output.ir.name} → ${outPath}`);
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

// ─── validate ────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate a TypeScript intent definition without generating output")
  .argument("<file>", "Path to the TypeScript intent definition")
  .action((file: string) => {
    const filePath = resolve(file);

    try {
      const result = compileFile(filePath, { validate: true });

      for (const d of result.diagnostics) {
        const prefix =
          d.severity === "error"
            ? "\x1b[31merror\x1b[0m"
            : d.severity === "warning"
              ? "\x1b[33mwarning\x1b[0m"
              : "\x1b[36minfo\x1b[0m";
        console.error(`  ${prefix}[${d.code}]: ${d.message}`);
        if (d.suggestion) console.error(`    = help: ${d.suggestion}`);
      }

      if (result.success) {
        console.log(`\x1b[32m✓\x1b[0m Valid intent definition`);
      } else {
        process.exit(1);
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
  });

program.parse();
