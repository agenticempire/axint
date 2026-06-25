import type { Command } from "commander";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateAppIntentsTestingHarness } from "../apple-intelligence/appintents-testing.js";

export function registerAppIntents(program: Command) {
  const appintents = program
    .command("appintents")
    .description(
      "Generate App Intents proof scaffolds for Siri, Shortcuts, and Spotlight"
    );

  appintents
    .command("test")
    .description("Generate an AppIntentsTesting readiness harness from Swift source")
    .argument("<file>", "Swift file containing AppIntent/AppEntity declarations")
    .option("--module <name>", "Swift module name for @testable import", "YourApp")
    .option("--out <path>", "Write the generated harness to a Swift file")
    .action(
      (
        file: string,
        options: {
          module: string;
          out?: string;
        }
      ) => {
        try {
          const sourcePath = resolve(file);
          const swiftSource = readFileSync(sourcePath, "utf-8");
          const harness = generateAppIntentsTestingHarness({
            swiftSource,
            moduleName: options.module,
            fileName: sourcePath,
          });

          if (options.out) {
            const outPath = resolve(options.out);
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, harness, "utf-8");
            console.log(`wrote AppIntentsTesting harness: ${outPath}`);
            return;
          }

          console.log(harness);
        } catch (error) {
          console.error(`error: ${(error as Error).message}`);
          process.exitCode = 1;
        }
      }
    );
}
