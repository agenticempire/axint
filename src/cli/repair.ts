import type { Command } from "commander";
import {
  renderAxintRepairReport,
  runAxintRepair,
  type AxintRepairFormat,
} from "../repair/project-repair.js";
import {
  normalizeAxintAgent,
  type AxintAgentProfileName,
} from "../project/agent-profile.js";

export function registerRepair(program: Command) {
  program
    .command("repair")
    .description(
      "Plan a project-aware Apple repair: index the app, classify evidence, rank likely files, and produce a proof loop"
    )
    .argument("<issue>", "Bug, broken behavior, build failure, or UI/runtime issue")
    .option("--dir <dir>", "Project directory", ".")
    .option("--source <path>", "Primary Swift file to inspect")
    .option(
      "--file-name <name>",
      "Display name when --source is omitted and --inline-source is used"
    )
    .option(
      "--inline-source <source>",
      "Inline Swift source for agents that cannot read files"
    )
    .option(
      "--platform <platform>",
      "Target platform: iOS, macOS, watchOS, visionOS, all"
    )
    .option(
      "--agent <agent>",
      "Agent host: codex, claude, cursor, cowork, xcode, all",
      parseAgent
    )
    .option("--expected <text>", "Expected behavior")
    .option("--actual <text>", "Actual behavior")
    .option("--xcode-log <text>", "Xcode build/test log evidence")
    .option("--test-failure <text>", "Focused UI/unit test failure text")
    .option("--runtime-failure <text>", "Runtime, crash, freeze, or hang evidence")
    .option("--changed <file...>", "Changed files to pin into the context pack")
    .option("--context <path>", "Existing .axint/context/latest.json path")
    .option("--no-write-report", "Do not write .axint/repair/latest artifacts")
    .option("--no-write-feedback", "Do not write the privacy-safe .axint/feedback packet")
    .option("--json", "Shortcut for --format json")
    .option("--prompt", "Shortcut for --format prompt")
    .option(
      "--format <format>",
      "Output format: markdown, json, or prompt",
      parseRepairFormat,
      "markdown" as AxintRepairFormat
    )
    .action(
      (
        issue: string,
        options: {
          dir: string;
          source?: string;
          fileName?: string;
          inlineSource?: string;
          platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
          agent?: AxintAgentProfileName;
          expected?: string;
          actual?: string;
          xcodeLog?: string;
          testFailure?: string;
          runtimeFailure?: string;
          changed?: string[];
          context?: string;
          writeReport?: boolean;
          writeFeedback?: boolean;
          json?: boolean;
          prompt?: boolean;
          format: AxintRepairFormat;
        }
      ) => {
        const report = runAxintRepair({
          cwd: options.dir,
          issue,
          sourcePath: options.source,
          source: options.inlineSource,
          fileName: options.fileName,
          platform: options.platform,
          agent: options.agent,
          expectedBehavior: options.expected,
          actualBehavior: options.actual,
          xcodeBuildLog: options.xcodeLog,
          testFailure: options.testFailure,
          runtimeFailure: options.runtimeFailure,
          changedFiles: options.changed,
          projectContextPath: options.context,
          writeReport: options.writeReport,
          writeFeedback: options.writeFeedback,
        });
        const format = options.prompt ? "prompt" : options.json ? "json" : options.format;
        console.log(renderAxintRepairReport(report, format));
        if (report.status === "fix_required") process.exitCode = 1;
      }
    );
}

function parseRepairFormat(value: string): AxintRepairFormat {
  if (value === "markdown" || value === "json" || value === "prompt") return value;
  throw new Error(`invalid repair format: ${value}`);
}

function parseAgent(value: string): AxintAgentProfileName {
  const agent = normalizeAxintAgent(value);
  if (agent === value) return agent;
  throw new Error(`invalid agent: ${value}`);
}
