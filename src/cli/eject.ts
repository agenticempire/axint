import type { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { ejectIntent } from "../core/eject.js";

export function registerEject(program: Command) {
  program
    .command("eject")
    .description("Eject an intent to standalone Swift with no Axint dependency")
    .argument("<file>", "Path to the TypeScript intent definition")
    .option("-o, --out <dir>", "Output directory for ejected files", ".")
    .option("--include-tests", "Generate a basic XCTest file alongside the Swift")
    .option(
      "--format",
      "Pipe generated Swift through swift-format with the Axint house style (macOS/Linux if swift-format is on $PATH)"
    )
    .action(
      async (
        file: string,
        options: {
          out: string;
          includeTests: boolean;
          format: boolean;
        }
      ) => {
        const filePath = resolve(file);

        try {
          let source: string;
          try {
            source = readFileSync(filePath, "utf-8");
          } catch (_err) {
            console.error(`\x1b[31merror:\x1b[0m Cannot read file: ${filePath}`);
            process.exit(1);
          }

          const result = await ejectIntent(source, basename(filePath), {
            outDir: options.out,
            includeTests: options.includeTests,
            format: options.format,
          });

          const filesWritten: string[] = [];

          mkdirSync(dirname(result.swiftFile.path), { recursive: true });
          writeFileSync(result.swiftFile.path, result.swiftFile.content, "utf-8");
          filesWritten.push("Swift");

          if (result.infoPlist) {
            writeFileSync(result.infoPlist.path, result.infoPlist.content, "utf-8");
            filesWritten.push("Info.plist fragment");
          }

          if (result.entitlements) {
            writeFileSync(result.entitlements.path, result.entitlements.content, "utf-8");
            filesWritten.push("entitlements fragment");
          }

          if (result.testFile) {
            writeFileSync(result.testFile.path, result.testFile.content, "utf-8");
            filesWritten.push("XCTest file");
          }

          console.log();
          console.log(
            `\x1b[32m✓\x1b[0m Ejected → ${filesWritten.length} file(s) (${filesWritten.join(", ")})`
          );
          console.log();
          console.log(`  \x1b[1mOutput directory:\x1b[0m ${resolve(options.out)}`);
          console.log();
          console.log(`  These files are now standalone and have no Axint dependency.`);
          console.log(
            `  You can commit them to version control and use them in your project.`
          );
          console.log();
        } catch (err: unknown) {
          if (
            err &&
            typeof err === "object" &&
            "format" in err &&
            typeof (err as Record<string, unknown>).format === "function"
          ) {
            console.error((err as { format: () => string }).format());
          } else {
            console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
          }
          process.exit(1);
        }
      }
    );
}
