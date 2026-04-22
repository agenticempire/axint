import type { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, printDsl } from "../core/axint-dsl/index.js";

export function registerFormat(program: Command) {
  program
    .command("format")
    .description("Format a .axint file in canonical style (prints to stdout by default)")
    .argument("<file>", "Path to the .axint source file")
    .option("-w, --write", "Rewrite the file in place instead of printing to stdout")
    .action(async (file: string, options: { write?: boolean }) => {
      const filePath = resolve(file);

      let source: string;
      try {
        source = readFileSync(filePath, "utf-8");
      } catch {
        console.error(`\x1b[31merror:\x1b[0m Cannot read file: ${filePath}`);
        process.exit(1);
      }

      const parsed = parse(source, { sourceFile: filePath });

      const errors = parsed.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        for (const d of errors) {
          const where = `${d.span.start.line}:${d.span.start.column}`;
          console.error(
            `\x1b[31merror\x1b[0m[${d.code}] ${filePath}:${where}  ${d.message}`
          );
          const hint = d.fix?.suggestedEdit?.text;
          if (hint) console.error(`  = help: ${hint}`);
        }
        console.error(
          `\x1b[31mformat:\x1b[0m refusing to format a file with parse errors — fix the errors above and retry`
        );
        process.exit(1);
      }

      const output = printDsl(parsed.file);

      if (options.write) {
        if (output === source) return;
        writeFileSync(filePath, output, "utf-8");
        return;
      }

      process.stdout.write(output);
    });
}
