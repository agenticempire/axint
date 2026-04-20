import type { Command } from "commander";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { validateSwiftSource } from "../core/swift-validator.js";
import type { Diagnostic } from "../core/types.js";
import {
  printRepairArtifactLines,
  tryEmitRepairArtifacts,
} from "../repair/repair-artifacts.js";

export function registerValidateSwift(program: Command) {
  program
    .command("validate-swift")
    .description(
      "Validate existing Swift sources (App Intents, Widgets, SwiftUI views) against Axint's rules"
    )
    .argument("<path>", "Swift file or directory to validate")
    .option("--quiet", "Only print errors, not the success banner")
    .option("--json", "Emit a machine-readable JSON report to stdout")
    .option(
      "--no-fix-packet",
      "Skip writing the local Fix Packet under .axint/fix/latest.{json,md}"
    )
    .option(
      "--fix-packet-dir <dir>",
      "Directory for the emitted Fix Packet artifacts",
      ".axint/fix"
    )
    .action(
      async (
        pathArg: string,
        options: {
          quiet?: boolean;
          json?: boolean;
          fixPacket?: boolean;
          fixPacketDir: string;
        }
      ) => {
        const target = resolve(pathArg);
        const files = collectSwiftFiles(target);

        if (files.length === 0) {
          console.error(`\x1b[31merror:\x1b[0m no .swift files found at ${pathArg}`);
          process.exit(1);
        }

        const all: Diagnostic[] = [];
        for (const file of files) {
          const source = readFileSync(file, "utf-8");
          const result = validateSwiftSource(source, file);
          all.push(...result.diagnostics);
        }

        const errors = all.filter((d) => d.severity === "error");
        let repairArtifacts:
          | ReturnType<typeof tryEmitRepairArtifacts>["artifacts"]
          | null = null;

        if (options.fixPacket !== false) {
          const repairResult = tryEmitRepairArtifacts(
            {
              success: errors.length === 0,
              surface: "swift",
              diagnostics: all,
              source: files.length === 1 ? readFileSync(files[0], "utf-8") : undefined,
              fileName:
                files.length === 1
                  ? files[0].split(/[\\/]/).pop()
                  : (target.split(/[\\/]/).pop() ?? "swift-validation"),
              filePath: files.length === 1 ? files[0] : target,
              language: "swift",
              packetDir: options.fixPacketDir,
              command: "validate_swift",
            },
            process.cwd()
          );
          repairArtifacts = repairResult.artifacts;
          if (repairResult.error) {
            console.error(
              `\x1b[33mwarning:\x1b[0m Fix Packet skipped — ${repairResult.error.message}`
            );
          }
        }

        if (options.json) {
          const payload = {
            ok: errors.length === 0,
            filesScanned: files.length,
            diagnostics: all,
            fixPacketPath: repairArtifacts?.packet.jsonPath ?? null,
            checkSummaryPath: repairArtifacts?.check.jsonPath ?? null,
          };
          process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
          process.exit(errors.length > 0 ? 1 : 0);
        }

        for (const d of all) {
          printDiagnostic(d);
        }

        if (errors.length > 0) {
          if (repairArtifacts) {
            printRepairArtifactLines(repairArtifacts, console.error);
          }
          console.error(
            `\n\x1b[31m✗\x1b[0m ${errors.length} error${errors.length === 1 ? "" : "s"} in ${files.length} file${files.length === 1 ? "" : "s"}`
          );
          process.exit(1);
        }

        if (!options.quiet) {
          if (repairArtifacts) {
            printRepairArtifactLines(repairArtifacts, console.log);
          }
          console.log(
            `\x1b[32m✓\x1b[0m ${files.length} Swift file${files.length === 1 ? "" : "s"} passed axint validation`
          );
        }
      }
    );
}

function collectSwiftFiles(target: string): string[] {
  const stat = safeStat(target);
  if (!stat) return [];
  if (stat.isFile()) {
    return target.endsWith(".swift") ? [target] : [];
  }
  const out: string[] = [];
  walk(target, out);
  return out;
}

function safeStat(target: string) {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules" || entry.name === ".build") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && extname(entry.name) === ".swift") {
      out.push(full);
    }
  }
}

function printDiagnostic(d: Diagnostic) {
  const loc = d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : "";
  const color =
    d.severity === "error"
      ? "\x1b[31m"
      : d.severity === "warning"
        ? "\x1b[33m"
        : "\x1b[36m";
  console.error(
    `${loc ? loc + " " : ""}${color}${d.severity}\x1b[0m[${d.code}]: ${d.message}`
  );
  if (d.suggestion) {
    console.error(`  \x1b[2mhelp:\x1b[0m ${d.suggestion}`);
  }
}
