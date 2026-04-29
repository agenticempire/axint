import type { Command } from "commander";
import {
  renderAxintUpgradeReport,
  runAxintUpgrade,
  type AxintUpgradeFormat,
} from "../project/upgrade.js";

const FORMATS: AxintUpgradeFormat[] = ["markdown", "json", "prompt"];

export function registerUpgrade(program: Command, version: string): void {
  program
    .command("upgrade")
    .description(
      "Check or apply an Axint upgrade without losing the current agent thread"
    )
    .option(
      "--target <version>",
      "Target version. Defaults to latest published npm version."
    )
    .option(
      "--latest-version <version>",
      "Use a known latest version instead of querying npm"
    )
    .option("--dir <dir>", "Project directory for upgrade artifacts", ".")
    .option("--apply", "Install the target Axint package and write upgrade proof")
    .option("--xcode-install", "Also refresh optional Xcode MCP wiring")
    .option(
      "--write-report",
      "Write .axint/upgrade/latest.* artifacts in check-only mode"
    )
    .option("--no-write-report", "Do not write .axint/upgrade/latest.* artifacts")
    .option("--format <format>", "Output format: markdown, json, or prompt", "markdown")
    .action(
      (options: {
        target?: string;
        latestVersion?: string;
        dir?: string;
        apply?: boolean;
        xcodeInstall?: boolean;
        writeReport?: boolean;
        format?: string;
      }) => {
        const report = runAxintUpgrade({
          cwd: options.dir,
          currentVersion: version,
          targetVersion: options.target,
          latestVersion: options.latestVersion,
          apply: options.apply === true,
          reinstallXcode: options.xcodeInstall === true,
          writeReport: parseWriteReportFlag(options.writeReport),
        });
        console.log(renderAxintUpgradeReport(report, parseFormat(options.format)));
        if (report.status === "fail") process.exit(1);
      }
    );
}

function parseFormat(value: string | undefined): AxintUpgradeFormat {
  if (value && FORMATS.includes(value as AxintUpgradeFormat)) {
    return value as AxintUpgradeFormat;
  }
  return "markdown";
}

function parseWriteReportFlag(value: boolean | undefined): boolean | undefined {
  const args = process.argv;
  if (args.includes("--no-write-report")) return false;
  if (args.includes("--write-report")) return true;
  return value === false ? false : undefined;
}
