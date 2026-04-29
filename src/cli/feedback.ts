import type { Command } from "commander";
import {
  readLatestRepairFeedback,
  renderRepairFeedbackPacket,
  runAxintRepair,
} from "../repair/project-repair.js";
import {
  normalizeAxintAgent,
  type AxintAgentProfileName,
} from "../project/agent-profile.js";

export function registerFeedback(program: Command) {
  const feedback = program
    .command("feedback")
    .description(
      "Create or inspect privacy-safe Axint feedback packets that help improve repair intelligence without sending source code"
    );

  feedback
    .command("create")
    .description("Create a local, inspectable feedback packet from a failed repair/check")
    .argument("<issue>", "Bug, weak Axint output, or failed repair behavior")
    .option("--dir <dir>", "Project directory", ".")
    .option("--source <path>", "Primary Swift file to inspect")
    .option("--platform <platform>", "Target platform")
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
    .option("--markdown", "Shortcut for --format markdown")
    .option("--format <format>", "Output format: json or markdown", parseFormat, "json")
    .action(
      (
        issue: string,
        options: {
          dir: string;
          source?: string;
          platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
          agent?: AxintAgentProfileName;
          expected?: string;
          actual?: string;
          xcodeLog?: string;
          testFailure?: string;
          runtimeFailure?: string;
          changed?: string[];
          markdown?: boolean;
          format: "json" | "markdown";
        }
      ) => {
        const report = runAxintRepair({
          cwd: options.dir,
          issue,
          sourcePath: options.source,
          platform: options.platform,
          agent: options.agent,
          expectedBehavior: options.expected,
          actualBehavior: options.actual,
          xcodeBuildLog: options.xcodeLog,
          testFailure: options.testFailure,
          runtimeFailure: options.runtimeFailure,
          changedFiles: options.changed,
          writeReport: false,
          writeFeedback: true,
        });
        console.log(
          renderRepairFeedbackPacket(
            report.feedbackPacket,
            options.markdown ? "markdown" : options.format
          )
        );
      }
    );

  feedback
    .command("latest")
    .description("Read the latest local Axint feedback packet")
    .option("--dir <dir>", "Project directory", ".")
    .option("--markdown", "Shortcut for --format markdown")
    .option("--format <format>", "Output format: json or markdown", parseFormat, "json")
    .action(
      (options: { dir: string; markdown?: boolean; format: "json" | "markdown" }) => {
        const packet = readLatestRepairFeedback({ cwd: options.dir });
        if (!packet) {
          console.error(
            "No Axint feedback packet found. Run `axint repair` or `axint feedback create` first."
          );
          process.exitCode = 1;
          return;
        }
        console.log(
          renderRepairFeedbackPacket(
            packet,
            options.markdown ? "markdown" : options.format
          )
        );
      }
    );
}

function parseFormat(value: string): "json" | "markdown" {
  if (value === "json" || value === "markdown") return value;
  throw new Error(`invalid feedback format: ${value}`);
}

function parseAgent(value: string): AxintAgentProfileName {
  const agent = normalizeAxintAgent(value);
  if (agent === value) return agent;
  throw new Error(`invalid agent: ${value}`);
}
