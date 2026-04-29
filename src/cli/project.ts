import type { Command } from "commander";
import { normalizeAxintAgent } from "../project/agent-profile.js";
import {
  renderProjectStartPack,
  writeProjectStartPack,
  type ProjectAgent,
  type ProjectMcpMode,
  type ProjectStartPackFormat,
} from "../project/start-pack.js";
import {
  renderProjectContextIndex,
  writeProjectContextIndex,
  type ProjectContextIndexFormat,
} from "../project/context-index.js";

export function registerProject(program: Command, version: string) {
  const project = program
    .command("project")
    .description("Bootstrap Axint project files for Apple-native agent workflows");

  project
    .command("init")
    .description("Write .mcp.json, AGENTS.md, CLAUDE.md, and .axint/project.json")
    .option("--dir <dir>", "Project directory to initialize", ".")
    .option("--name <name>", "Project name")
    .option(
      "--agent <agent>",
      "Agent target: claude, codex, cowork, cursor, xcode, all",
      parseAgent,
      "all" as ProjectAgent
    )
    .option(
      "--mode <mode>",
      "MCP mode: local or remote",
      parseMode,
      "local" as ProjectMcpMode
    )
    .option("--force", "Overwrite existing project-start files")
    .option("--dry-run", "Print what would be written without writing files")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseFormat,
      "markdown" as ProjectStartPackFormat
    )
    .action(
      (options: {
        dir: string;
        name?: string;
        agent: ProjectAgent;
        mode: ProjectMcpMode;
        force?: boolean;
        dryRun?: boolean;
        format: ProjectStartPackFormat;
      }) => {
        const result = writeProjectStartPack({
          targetDir: options.dir,
          projectName: options.name,
          agent: options.agent,
          mode: options.mode,
          version,
          force: options.force ?? false,
          dryRun: options.dryRun ?? false,
        });
        console.log(renderProjectStartPack(result, options.format));
      }
    );

  project
    .command("index")
    .description(
      "Scan the local Apple project and write a compact .axint/context pack for project-aware checks"
    )
    .option("--dir <dir>", "Project directory to scan", ".")
    .option("--name <name>", "Project name override")
    .option("--changed <file...>", "Changed files to pin into the context pack")
    .option("--no-git", "Skip git changed-file discovery")
    .option("--dry-run", "Print the context pack without writing .axint/context")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseContextIndexFormat,
      "markdown" as ProjectContextIndexFormat
    )
    .action(
      (options: {
        dir: string;
        name?: string;
        changed?: string[];
        git?: boolean;
        dryRun?: boolean;
        format: ProjectContextIndexFormat;
      }) => {
        const result = writeProjectContextIndex({
          targetDir: options.dir,
          projectName: options.name,
          changedFiles: options.changed,
          includeGit: options.git,
          dryRun: options.dryRun ?? false,
        });
        console.log(renderProjectContextIndex(result.index, options.format));
      }
    );
}

function parseAgent(value: string): ProjectAgent {
  const agent = normalizeAxintAgent(value);
  if (agent === value) return agent;
  throw new Error(`invalid agent: ${value}`);
}

function parseMode(value: string): ProjectMcpMode {
  if (value === "local" || value === "remote") return value;
  throw new Error(`invalid mode: ${value}`);
}

function parseFormat(value: string): ProjectStartPackFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid format: ${value}`);
}

function parseContextIndexFormat(value: string): ProjectContextIndexFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid context index format: ${value}`);
}
