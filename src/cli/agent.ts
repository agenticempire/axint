import type { Command } from "commander";
import {
  buildAxintAgentAdvice,
  claimAxintAgentFiles,
  installAxintLocalAgent,
  releaseAxintAgentClaims,
  renderAxintAgentAdviceReport,
  renderAxintAgentClaimReport,
  renderAxintAgentInstallReport,
  renderAxintAgentReleaseReport,
  type AxintLocalAgentFormat,
  type AxintLocalAgentPrivacyMode,
  type AxintLocalAgentProviderMode,
} from "../project/local-agent.js";
import {
  normalizeAxintAgent,
  type AxintAgentProfileName,
} from "../project/agent-profile.js";

export function registerAgent(program: Command) {
  const agent = program
    .command("agent")
    .description(
      "Install and query the local Axint multi-agent brain for one Apple project"
    );

  agent
    .command("install")
    .description(
      "Write .axint/agent.json plus coordination files so Codex, Claude, Cursor, and Xcode share one project brain"
    )
    .option("--dir <dir>", "Project directory", ".")
    .option("--name <name>", "Project name")
    .option(
      "--agent <agent>",
      "Agent lane: codex, claude, cursor, cowork, xcode, all",
      parseAgent,
      "all" as AxintAgentProfileName
    )
    .option(
      "--privacy <mode>",
      "Privacy mode: local_only, redacted_cloud, source_opt_in",
      parsePrivacyMode,
      "local_only" as AxintLocalAgentPrivacyMode
    )
    .option(
      "--provider <mode>",
      "Provider mode: none, bring_your_own_key, axint_cloud",
      parseProviderMode,
      "none" as AxintLocalAgentProviderMode
    )
    .option("--force", "Rewrite the local agent config")
    .option("--json", "Shortcut for --format json")
    .option("--prompt", "Shortcut for --format prompt")
    .option(
      "--format <format>",
      "Output format: markdown, json, or prompt",
      parseFormat,
      "markdown" as AxintLocalAgentFormat
    )
    .action(
      (options: {
        dir: string;
        name?: string;
        agent: AxintAgentProfileName;
        privacy: AxintLocalAgentPrivacyMode;
        provider: AxintLocalAgentProviderMode;
        force?: boolean;
        json?: boolean;
        prompt?: boolean;
        format: AxintLocalAgentFormat;
      }) => {
        const report = installAxintLocalAgent({
          cwd: options.dir,
          projectName: options.name,
          agent: options.agent,
          privacyMode: options.privacy,
          providerMode: options.provider,
          force: options.force,
        });
        console.log(renderAxintAgentInstallReport(report, cliFormat(options)));
      }
    );

  agent
    .command("advice")
    .description(
      "Return host-specific next moves from the shared local project brain and proof ledger"
    )
    .argument("[issue]", "Optional bug, feature, or repair goal")
    .option("--dir <dir>", "Project directory", ".")
    .option(
      "--agent <agent>",
      "Agent lane: codex, claude, cursor, cowork, xcode, all",
      parseAgent,
      "all" as AxintAgentProfileName
    )
    .option("--changed <file...>", "Files in scope for this pass")
    .option("--json", "Shortcut for --format json")
    .option("--prompt", "Shortcut for --format prompt")
    .option(
      "--format <format>",
      "Output format: markdown, json, or prompt",
      parseFormat,
      "markdown" as AxintLocalAgentFormat
    )
    .action(
      (
        issue: string | undefined,
        options: {
          dir: string;
          agent: AxintAgentProfileName;
          changed?: string[];
          json?: boolean;
          prompt?: boolean;
          format: AxintLocalAgentFormat;
        }
      ) => {
        const report = buildAxintAgentAdvice({
          cwd: options.dir,
          issue,
          agent: options.agent,
          changedFiles: options.changed,
        });
        console.log(renderAxintAgentAdviceReport(report, cliFormat(options)));
        if (report.status === "blocked") process.exitCode = 1;
      }
    );

  agent
    .command("claim")
    .description("Claim files before an agent edits them so other agents avoid conflicts")
    .argument("<files...>", "Files to claim")
    .option("--dir <dir>", "Project directory", ".")
    .option(
      "--agent <agent>",
      "Agent lane: codex, claude, cursor, cowork, xcode, all",
      parseAgent,
      "all" as AxintAgentProfileName
    )
    .option("--task <task>", "Task or issue this claim covers")
    .option("--ttl <minutes>", "Claim TTL in minutes", parsePositiveInt)
    .option("--json", "Shortcut for --format json")
    .option("--prompt", "Shortcut for --format prompt")
    .option(
      "--format <format>",
      "Output format: markdown, json, or prompt",
      parseFormat,
      "markdown" as AxintLocalAgentFormat
    )
    .action(
      (
        files: string[],
        options: {
          dir: string;
          agent: AxintAgentProfileName;
          task?: string;
          ttl?: number;
          json?: boolean;
          prompt?: boolean;
          format: AxintLocalAgentFormat;
        }
      ) => {
        const report = claimAxintAgentFiles({
          cwd: options.dir,
          agent: options.agent,
          task: options.task,
          files,
          ttlMinutes: options.ttl,
        });
        console.log(renderAxintAgentClaimReport(report, cliFormat(options)));
        if (report.status === "blocked") process.exitCode = 1;
      }
    );

  agent
    .command("release")
    .description("Release active Axint file claims for this agent")
    .argument("[files...]", "Files to release. Omit to release this agent's claims.")
    .option("--dir <dir>", "Project directory", ".")
    .option(
      "--agent <agent>",
      "Agent lane: codex, claude, cursor, cowork, xcode, all",
      parseAgent,
      "all" as AxintAgentProfileName
    )
    .option("--all", "Release all matching claims")
    .option("--json", "Shortcut for --format json")
    .option("--prompt", "Shortcut for --format prompt")
    .option(
      "--format <format>",
      "Output format: markdown, json, or prompt",
      parseFormat,
      "markdown" as AxintLocalAgentFormat
    )
    .action(
      (
        files: string[] | undefined,
        options: {
          dir: string;
          agent: AxintAgentProfileName;
          all?: boolean;
          json?: boolean;
          prompt?: boolean;
          format: AxintLocalAgentFormat;
        }
      ) => {
        const report = releaseAxintAgentClaims({
          cwd: options.dir,
          agent: options.agent,
          files,
          all: options.all,
        });
        console.log(renderAxintAgentReleaseReport(report, cliFormat(options)));
      }
    );
}

function parseAgent(value: string): AxintAgentProfileName {
  const agent = normalizeAxintAgent(value);
  if (agent === value) return agent;
  throw new Error(`invalid agent: ${value}`);
}

function parseFormat(value: string): AxintLocalAgentFormat {
  if (value === "markdown" || value === "json" || value === "prompt") return value;
  throw new Error(`invalid agent format: ${value}`);
}

function parsePrivacyMode(value: string): AxintLocalAgentPrivacyMode {
  if (value === "local_only" || value === "redacted_cloud" || value === "source_opt_in") {
    return value;
  }
  throw new Error(`invalid privacy mode: ${value}`);
}

function parseProviderMode(value: string): AxintLocalAgentProviderMode {
  if (value === "none" || value === "bring_your_own_key" || value === "axint_cloud") {
    return value;
  }
  throw new Error(`invalid provider mode: ${value}`);
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new Error(`invalid positive integer: ${value}`);
}

function cliFormat(options: {
  json?: boolean;
  prompt?: boolean;
  format: AxintLocalAgentFormat;
}): AxintLocalAgentFormat {
  if (options.prompt) return "prompt";
  if (options.json) return "json";
  return options.format;
}
