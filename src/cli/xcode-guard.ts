import type { Command } from "commander";
import {
  renderXcodeGuardReport,
  runXcodeGuard,
  type XcodeGuardFormat,
  type XcodeGuardStage,
} from "../project/xcode-guard.js";

const STAGES = [
  "context-recovery",
  "planning",
  "before-write",
  "after-write",
  "pre-build",
  "runtime",
  "finish",
] as const;

export function registerXcodeGuard(xcode: Command): void {
  xcode
    .command("guard")
    .description(
      "Check the Axint Xcode drift guard and write .axint/guard/latest artifacts"
    )
    .option("--dir <dir>", "Project directory to guard", ".")
    .option("--name <name>", "Project name")
    .option("--expected-version <version>", "Expected Axint version")
    .option("--platform <platform>", "Target Apple platform")
    .option(
      "--stage <stage>",
      "Guard stage: context-recovery, planning, before-write, after-write, pre-build, runtime, finish",
      parseStage,
      "context-recovery" as XcodeGuardStage
    )
    .option("--session-token <token>", "Current axint.session.start token")
    .option("--modified <files...>", "Modified files in scope")
    .option("--notes <text>", "Agent notes or user feedback to scan for drift")
    .option("--last-tool <tool>", "Last Axint tool used, e.g. axint.suggest")
    .option("--last-result <text>", "Short result from the last Axint tool")
    .option(
      "--max-minutes <minutes>",
      "Maximum allowed minutes since the latest Axint evidence",
      parsePositiveNumber,
      10
    )
    .option("--no-auto-start", "Do not auto-start an Axint session if missing")
    .option("--no-write-report", "Do not write .axint/guard/latest artifacts")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseFormat,
      "markdown" as XcodeGuardFormat
    )
    .action(
      (options: {
        dir: string;
        name?: string;
        expectedVersion?: string;
        platform?: string;
        stage: XcodeGuardStage;
        sessionToken?: string;
        modified?: string[];
        notes?: string;
        lastTool?: string;
        lastResult?: string;
        maxMinutes: number;
        autoStart?: boolean;
        writeReport?: boolean;
        format: XcodeGuardFormat;
      }) => {
        const report = runXcodeGuard({
          cwd: options.dir,
          projectName: options.name,
          expectedVersion: options.expectedVersion,
          platform: options.platform,
          stage: options.stage,
          sessionToken: options.sessionToken,
          modifiedFiles: options.modified,
          notes: options.notes,
          lastAxintTool: options.lastTool,
          lastAxintResult: options.lastResult,
          maxMinutesSinceAxint: options.maxMinutes,
          autoStartSession: options.autoStart ?? true,
          writeReport: options.writeReport ?? true,
        });
        console.log(renderXcodeGuardReport(report, options.format));
        if (report.status === "needs_action") {
          process.exitCode = 1;
        }
      }
    );
}

function parseStage(value: string): XcodeGuardStage {
  if ((STAGES as readonly string[]).includes(value)) return value as XcodeGuardStage;
  throw new Error(`invalid stage: ${value}`);
}

function parseFormat(value: string): XcodeGuardFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid format: ${value}`);
}

function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new Error(`invalid positive number: ${value}`);
}
