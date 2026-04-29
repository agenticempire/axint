import type { Command } from "commander";
import {
  readLatestRepairFeedback,
  renderRepairFeedbackPacket,
  runAxintRepair,
} from "../repair/project-repair.js";
import {
  exportAxintFeedback,
  importAxintFeedback,
  listAxintFeedbackInbox,
  renderFeedbackExportReport,
  renderFeedbackImportReport,
  renderFeedbackInboxReport,
  type AxintFeedbackFormat,
} from "../feedback/inbox.js";
import {
  resolveAutoFeedbackPolicy,
  syncAutomaticFeedback,
  writeAutoFeedbackPolicy,
} from "../feedback/auto.js";
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

  feedback
    .command("export")
    .description(
      "Export source-free Axint feedback into a shareable bundle for a maintainer"
    )
    .option("--dir <dir>", "Project directory", ".")
    .option("--out <file>", "Output JSON bundle path")
    .option("--project <label>", "Human-readable project label")
    .option("--contact <text>", "Optional contact handle or email")
    .option("--all", "Include all local feedback packets instead of only latest")
    .option("--markdown", "Shortcut for --format markdown")
    .option(
      "--format <format>",
      "Output format: json or markdown",
      parseFormat,
      "markdown"
    )
    .action(
      (options: {
        dir: string;
        out?: string;
        project?: string;
        contact?: string;
        all?: boolean;
        markdown?: boolean;
        format: AxintFeedbackFormat;
      }) => {
        const report = exportAxintFeedback({
          cwd: options.dir,
          out: options.out,
          projectLabel: options.project,
          contact: options.contact,
          latestOnly: !options.all,
        });
        console.log(
          renderFeedbackExportReport(
            report,
            options.markdown ? "markdown" : options.format
          )
        );
      }
    );

  feedback
    .command("status")
    .description("Show automatic source-free feedback policy and opt-out controls")
    .option("--dir <dir>", "Project directory", ".")
    .option("--markdown", "Shortcut for --format markdown")
    .option(
      "--format <format>",
      "Output format: json or markdown",
      parseFormat,
      "markdown"
    )
    .action(
      (options: { dir: string; markdown?: boolean; format: AxintFeedbackFormat }) => {
        const policy = resolveAutoFeedbackPolicy(options.dir);
        const format = options.markdown ? "markdown" : options.format;
        if (format === "json") {
          console.log(`${JSON.stringify(policy, null, 2)}\n`);
          return;
        }
        console.log(
          [
            "# Axint Automatic Feedback",
            "",
            `- Mode: ${policy.mode}`,
            `- Endpoint: ${policy.endpoint}`,
            `- Reason: ${policy.reason}`,
            "- Redaction: source_not_included",
            "- Source sharing: never_by_default",
            "",
            "Opt out any time with `axint feedback opt-out` or `AXINT_FEEDBACK=off`.",
          ].join("\n")
        );
      }
    );

  feedback
    .command("opt-out")
    .description("Turn off automatic source-free feedback for this project")
    .option("--dir <dir>", "Project directory", ".")
    .option("--markdown", "Shortcut for --format markdown")
    .option(
      "--format <format>",
      "Output format: json or markdown",
      parseFormat,
      "markdown"
    )
    .action(
      (options: { dir: string; markdown?: boolean; format: AxintFeedbackFormat }) => {
        const policy = writeAutoFeedbackPolicy(options.dir, "off");
        if ((options.markdown ? "markdown" : options.format) === "json") {
          console.log(`${JSON.stringify(policy, null, 2)}\n`);
          return;
        }
        console.log("Axint automatic source-free feedback is off for this project.");
      }
    );

  feedback
    .command("opt-in")
    .description("Turn automatic source-free feedback back on for this project")
    .option("--dir <dir>", "Project directory", ".")
    .option("--local-only", "Queue packets locally but do not submit them")
    .option("--markdown", "Shortcut for --format markdown")
    .option(
      "--format <format>",
      "Output format: json or markdown",
      parseFormat,
      "markdown"
    )
    .action(
      (options: {
        dir: string;
        localOnly?: boolean;
        markdown?: boolean;
        format: AxintFeedbackFormat;
      }) => {
        const policy = writeAutoFeedbackPolicy(
          options.dir,
          options.localOnly ? "local_only" : "on"
        );
        if ((options.markdown ? "markdown" : options.format) === "json") {
          console.log(`${JSON.stringify(policy, null, 2)}\n`);
          return;
        }
        console.log(
          `Axint automatic source-free feedback is ${policy.mode} for this project.`
        );
      }
    );

  feedback
    .command("sync")
    .description("Retry queued automatic feedback packets")
    .option("--dir <dir>", "Project directory", ".")
    .option("--endpoint <url>", "Override feedback endpoint")
    .option("--markdown", "Shortcut for --format markdown")
    .option(
      "--format <format>",
      "Output format: json or markdown",
      parseFormat,
      "markdown"
    )
    .action(
      async (options: {
        dir: string;
        endpoint?: string;
        markdown?: boolean;
        format: AxintFeedbackFormat;
      }) => {
        const report = await syncAutomaticFeedback({
          cwd: options.dir,
          endpoint: options.endpoint,
        });
        if ((options.markdown ? "markdown" : options.format) === "json") {
          console.log(`${JSON.stringify(report, null, 2)}\n`);
          return;
        }
        console.log(
          [
            "# Axint Feedback Sync",
            "",
            `- Attempted: ${report.attempted}`,
            `- Sent: ${report.sent}`,
            `- Failed: ${report.failed}`,
            `- Mode: ${report.policy.mode}`,
            `- Endpoint: ${report.policy.endpoint}`,
          ].join("\n")
        );
      }
    );

  feedback
    .command("import")
    .description("Import source-free feedback bundles into the local Axint inbox")
    .argument("<files...>", "Feedback bundle or packet JSON files")
    .option("--dir <dir>", "Inbox project directory", ".")
    .option("--project <label>", "Override project label for imported packets")
    .option("--contact <text>", "Optional contact handle or email")
    .option("--markdown", "Shortcut for --format markdown")
    .option(
      "--format <format>",
      "Output format: json or markdown",
      parseFormat,
      "markdown"
    )
    .action(
      (
        files: string[],
        options: {
          dir: string;
          project?: string;
          contact?: string;
          markdown?: boolean;
          format: AxintFeedbackFormat;
        }
      ) => {
        const report = importAxintFeedback(files, {
          cwd: options.dir,
          projectLabel: options.project,
          contact: options.contact,
        });
        console.log(
          renderFeedbackImportReport(
            report,
            options.markdown ? "markdown" : options.format
          )
        );
      }
    );

  feedback
    .command("list")
    .alias("inbox")
    .description("List imported feedback packets and repeated Axint fix clusters")
    .option("--dir <dir>", "Inbox project directory", ".")
    .option("--markdown", "Shortcut for --format markdown")
    .option(
      "--format <format>",
      "Output format: json or markdown",
      parseFormat,
      "markdown"
    )
    .action(
      (options: { dir: string; markdown?: boolean; format: AxintFeedbackFormat }) => {
        const report = listAxintFeedbackInbox({ cwd: options.dir });
        console.log(
          renderFeedbackInboxReport(
            report,
            options.markdown ? "markdown" : options.format
          )
        );
      }
    );
}

function parseFormat(value: string): AxintFeedbackFormat {
  if (value === "json" || value === "markdown") return value;
  throw new Error(`invalid feedback format: ${value}`);
}

function parseAgent(value: string): AxintAgentProfileName {
  const agent = normalizeAxintAgent(value);
  if (agent === value) return agent;
  throw new Error(`invalid agent: ${value}`);
}
