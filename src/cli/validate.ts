import type { Command } from "commander";
import { resolve } from "node:path";
import { compileFile } from "../core/compiler.js";

export function registerValidate(program: Command) {
  program
    .command("validate")
    .description("Validate a TypeScript intent definition without generating output")
    .argument("<file>", "Path to the TypeScript intent definition")
    .option(
      "--sandbox",
      "Run stage 4 validation: swift build in an SPM sandbox (macOS only)"
    )
    .action(async (file: string, options: { sandbox: boolean }) => {
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

        if (!result.success) {
          process.exit(1);
        }

        if (options.sandbox && result.output) {
          const { sandboxCompile } = await import("../core/sandbox.js");
          console.log(`\x1b[36m→\x1b[0m Stage 4: SPM sandbox compile...`);
          const sandboxResult = await sandboxCompile(result.output.swiftCode, {
            intentName: result.output.ir.name,
          });
          if (!sandboxResult.ok) {
            console.error(`\x1b[31m✗\x1b[0m ${sandboxResult.stderr}`);
            process.exit(1);
          }
          console.log(
            `\x1b[32m✓\x1b[0m Valid intent definition (sandbox-verified, ${sandboxResult.durationMs}ms)`
          );
        } else {
          console.log(`\x1b[32m✓\x1b[0m Valid intent definition`);
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
}
