/**
 * `axint paint-test scaffold` — generates an XCTest file that mounts every
 * reachable SwiftUI View at canonical viewports and asserts the body
 * resolves + > 0% non-empty pixels render. Companion to swift -typecheck:
 * typecheck catches compile errors, paint catches runtime/render errors
 * that compile fine.
 */

import type { Command } from "commander";
import { scaffoldPaintTests } from "../cloud/paint-test.js";

export function registerPaintTest(program: Command): void {
  const paintTest = program
    .command("paint-test")
    .description("Generate runtime smoke tests for every reachable SwiftUI View");

  paintTest
    .command("scaffold")
    .description(
      "Walk the project, find every `struct X: View`, and emit a Swift " +
        "test file that mounts each one at canonical viewports and asserts " +
        "the body resolves + renders >0% non-empty pixels."
    )
    .option("--project <dir>", "Project directory to scan for View declarations.", ".")
    .option(
      "--out <path>",
      "Where to write the generated Swift test file. Defaults to " +
        "`<project>/SwarmPaintTests/AxintGeneratedPaintTests.swift`."
    )
    .option(
      "--module <name>",
      "Swift module name to import. Defaults to inferring from the project directory."
    )
    .option("--dry-run", "Print the generated content to stdout without writing to disk.")
    .action(
      async (options: {
        project: string;
        out?: string;
        module?: string;
        dryRun?: boolean;
      }) => {
        const result = scaffoldPaintTests({
          projectRoot: options.project,
          outputPath: options.out,
          moduleName: options.module,
          write: !options.dryRun,
        });

        if (options.dryRun) {
          process.stdout.write(result.generated);
          process.stderr.write(
            `\n— scaffolded ${result.viewCount} view assertions (${result.skipped.length} skipped)\n`
          );
        } else {
          console.log(`✓ wrote ${result.outputPath}`);
          console.log(`  ${result.viewCount} view assertions across 2 viewports`);
          if (result.skipped.length > 0) {
            console.log(`  ${result.skipped.length} skipped:`);
            for (const skip of result.skipped.slice(0, 10)) {
              console.log(`    · ${skip.name} — ${skip.reason}`);
            }
            if (result.skipped.length > 10) {
              console.log(`    … and ${result.skipped.length - 10} more`);
            }
            console.log(
              "  Add manual mounts for these in a partner test file (e.g. AxintManualPaintTests.swift)."
            );
          }
          console.log("");
          console.log("Next:");
          console.log(`  xcodebuild test -only-testing:AxintGeneratedPaintTests \\`);
          console.log(`    -scheme <YourScheme> -destination '<your-destination>'`);
        }
      }
    );
}
