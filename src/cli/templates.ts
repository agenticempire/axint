import type { Command } from "commander";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { listTemplates, getTemplate } from "../templates/index.js";

export function registerTemplates(program: Command) {
  program
    .command("templates")
    .description("List bundled intent templates")
    .option("--json", "Output as JSON")
    .option(
      "--export <name>",
      "Export a template's TypeScript source to stdout or a file"
    )
    .option(
      "--export-to <path>",
      "Write the exported template to a file instead of stdout (requires --export)"
    )
    .action((options: { json: boolean; export?: string; exportTo?: string }) => {
      if (options.export) {
        const tpl = getTemplate(options.export);
        if (!tpl) {
          console.error(
            `\x1b[31merror:\x1b[0m Unknown template "${options.export}". Run \`axint templates\` to see available ones.`
          );
          process.exit(1);
        }
        if (options.exportTo) {
          const outPath = resolve(options.exportTo);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, tpl.source, "utf-8");
          console.log(`\x1b[32m✓\x1b[0m Exported "${options.export}" → ${outPath}`);
        } else {
          console.log(tpl.source);
        }
        return;
      }

      const templates = listTemplates();

      if (options.json) {
        console.log(JSON.stringify(templates, null, 2));
        return;
      }

      console.log();
      console.log(
        `  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · ${templates.length} bundled templates`
      );
      console.log();

      for (const t of templates) {
        console.log(`  \x1b[38;5;208m◆\x1b[0m ${t.name.padEnd(22)} ${t.description}`);
      }

      console.log();
      console.log(`  \x1b[2mUsage: axint init --template <name>\x1b[0m`);
      console.log(`  \x1b[2mExport: axint templates --export <name>\x1b[0m`);
      console.log();
    });
}
