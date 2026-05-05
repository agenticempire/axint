import type { Command } from "commander";
import { basename, resolve } from "node:path";
import { scaffoldProject } from "./scaffold.js";

const STARTERS = new Set(["calendar-agent", "basic"]);

export function registerCreate(program: Command, version: string) {
  program
    .command("create")
    .description(
      "Create a premium Axint launchpad for AI agents building Apple-native software"
    )
    .argument("[dir]", "Project directory", "axint-calendar-agent")
    .option(
      "--starter <name>",
      "Starter experience: calendar-agent or basic",
      "calendar-agent"
    )
    .option(
      "-t, --template <name>",
      "Underlying Axint template. Defaults to create-event for the calendar-agent starter"
    )
    .option("--no-install", "Skip running `npm install`")
    .option("--name <name>", "Project name (defaults to the directory name)")
    .action(
      async (
        dir: string,
        options: {
          starter: string;
          template?: string;
          install: boolean;
          name?: string;
        }
      ) => {
        const starter = options.starter.trim().toLowerCase();
        if (!STARTERS.has(starter)) {
          console.error(
            `\x1b[31merror:\x1b[0m Unknown starter "${options.starter}". Expected calendar-agent or basic.`
          );
          process.exit(1);
        }

        const targetDir = resolve(dir);
        const projectName = options.name ?? basename(targetDir);
        const template =
          options.template ??
          (starter === "calendar-agent" ? "create-event" : "create-event");

        try {
          const result = await scaffoldProject({
            targetDir,
            projectName,
            template,
            version,
            install: options.install,
            experience: starter === "basic" ? "compiler" : "launchpad",
          });

          console.log();
          console.log(
            `  \x1b[38;5;208m◆\x1b[0m \x1b[1mcreate-axint-app\x1b[0m · Apple-native launchpad ready`
          );
          console.log();
          console.log(`    Starter: \x1b[1m${starter}\x1b[0m`);
          console.log(`    Source:  intents/${template}.ts`);
          console.log(`    Files:   ${result.files.length} written to ${targetDir}`);
          if (result.proofFile) console.log(`    Proof:   ${result.proofFile}`);
          if (result.shareFile) console.log(`    Share:   ${result.shareFile}`);
          console.log();
          console.log(`  \x1b[1mNext:\x1b[0m`);
          console.log(`    cd ${dir}`);
          if (options.install) {
            console.log(`    npm run proof`);
          } else {
            console.log(`    npm install`);
            console.log(`    npm run proof`);
          }
          if (result.shareFile) {
            console.log(`    open ${result.shareFile}`);
          }
          console.log();
          console.log(
            `  \x1b[2mAgent prompt: .axint/agent-prompts/codex.md, claude.md, cursor.md\x1b[0m`
          );
          console.log(`  \x1b[2mCloud check:   npm run cloud:check\x1b[0m`);
          console.log();
        } catch (err: unknown) {
          console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
          process.exit(1);
        }
      }
    );
}
