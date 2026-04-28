import type { Command } from "commander";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { validateSwiftSource } from "../core/swift-validator.js";
import type { Diagnostic } from "../core/types.js";
import { getAxintLoginState } from "../core/credentials.js";
import {
  renderRepairArtifactLines,
  tryEmitRepairArtifacts,
} from "../repair/repair-artifacts.js";

export function registerValidateSwift(program: Command) {
  program
    .command("validate-swift")
    .description(
      "Validate existing Swift sources (App Intents, Widgets, SwiftUI views) against Axint's rules"
    )
    .argument("<paths...>", "Swift file(s) or directories to validate")
    .option("--quiet", "Only print errors, not the success banner")
    .option("--json", "Emit a machine-readable JSON report to stdout")
    .option("--color", "Force ANSI color output even when stdout/stderr are not TTYs")
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
        pathArgs: string[],
        options: {
          quiet?: boolean;
          json?: boolean;
          color?: boolean;
          fixPacket?: boolean;
          fixPacketDir: string;
        }
      ) => {
        const color = shouldUseColor(options.color === true);
        const targets = pathArgs.map((pathArg) => ({
          input: pathArg,
          resolved: resolve(pathArg),
        }));
        const files = new Set<string>();
        const missingTargets: string[] = [];

        for (const target of targets) {
          const targetFiles = collectSwiftFiles(target.resolved);
          if (targetFiles.length === 0) {
            missingTargets.push(target.input);
            continue;
          }
          for (const file of targetFiles) files.add(file);
        }

        if (missingTargets.length > 0) {
          printLine(
            "error",
            `no .swift files found at ${missingTargets.join(", ")}`,
            color,
            console.error
          );
          process.exit(1);
        }

        const all: Diagnostic[] = [];
        const filesToScan = [...files].sort();

        for (const file of filesToScan) {
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
              source:
                filesToScan.length === 1
                  ? readFileSync(filesToScan[0], "utf-8")
                  : undefined,
              fileName:
                filesToScan.length === 1
                  ? filesToScan[0].split(/[\\/]/).pop()
                  : "swift-validation",
              filePath:
                filesToScan.length === 1
                  ? filesToScan[0]
                  : targets.length === 1
                    ? targets[0]!.resolved
                    : process.cwd(),
              language: "swift",
              packetDir: options.fixPacketDir,
              command: "validate_swift",
            },
            process.cwd()
          );
          repairArtifacts = repairResult.artifacts;
          if (repairResult.error) {
            console.error(
              color
                ? `\x1b[33mwarning:\x1b[0m Fix Packet skipped — ${repairResult.error.message}`
                : `warning: Fix Packet skipped — ${repairResult.error.message}`
            );
          }
        }

        if (options.json) {
          const payload = {
            ok: errors.length === 0,
            filesScanned: filesToScan.length,
            diagnostics: all,
            fixPacketPath: repairArtifacts?.packet.jsonPath ?? null,
            checkSummaryPath: repairArtifacts?.check.jsonPath ?? null,
          };
          process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
          process.exit(errors.length > 0 ? 1 : 0);
        }

        for (const d of all) {
          printDiagnostic(d, color);
        }

        if (errors.length > 0) {
          if (repairArtifacts) {
            printRepairArtifactLinesWithColor(repairArtifacts, color, console.error);
          }
          printLine(
            "error",
            `${errors.length} error${errors.length === 1 ? "" : "s"} in ${filesToScan.length} file${filesToScan.length === 1 ? "" : "s"}`,
            color,
            console.error,
            "\n"
          );
          process.exit(1);
        }

        if (!options.quiet) {
          if (repairArtifacts) {
            printRepairArtifactLinesWithColor(repairArtifacts, color, console.log);
          }
          printLine(
            "success",
            `${filesToScan.length} Swift file${filesToScan.length === 1 ? "" : "s"} passed axint validation`,
            color,
            console.log
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

function printDiagnostic(d: Diagnostic, color: boolean) {
  const loc = d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : "";
  const severityColor =
    d.severity === "error"
      ? "\x1b[31m"
      : d.severity === "warning"
        ? "\x1b[33m"
        : "\x1b[36m";
  const severityLabel = color ? `${severityColor}${d.severity}\x1b[0m` : d.severity;
  console.error(`${loc ? loc + " " : ""}${severityLabel}[${d.code}]: ${d.message}`);
  if (d.suggestion) {
    console.error(
      color ? `  \x1b[2mhelp:\x1b[0m ${d.suggestion}` : `  help: ${d.suggestion}`
    );
  }
}

function shouldUseColor(forceColor: boolean): boolean {
  if (forceColor) return true;
  if ("NO_COLOR" in process.env) return false;
  return process.stdout.isTTY === true && process.stderr.isTTY === true;
}

function printRepairArtifactLinesWithColor(
  artifacts: NonNullable<ReturnType<typeof tryEmitRepairArtifacts>["artifacts"]>,
  color: boolean,
  writeLine: (line: string) => void
) {
  for (const line of renderRepairArtifactLines(artifacts, {
    signedIn: getAxintLoginState().signedIn,
  })) {
    writeLine(color ? line : stripAnsi(line));
  }
}

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
}

function printLine(
  kind: "error" | "success",
  message: string,
  color: boolean,
  writeLine: (line: string) => void,
  prefix = ""
) {
  const symbol = kind === "error" ? "✗" : "✓";
  const ansi = kind === "error" ? "\x1b[31m" : "\x1b[32m";
  writeLine(
    color
      ? `${prefix}${ansi}${symbol}\x1b[0m ${message}`
      : `${prefix}${symbol} ${message}`
  );
}
