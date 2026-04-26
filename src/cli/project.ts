import type { Command } from "commander";
import {
  renderProjectStartPack,
  writeProjectStartPack,
  type ProjectAgent,
  type ProjectMcpMode,
  type ProjectStartPackFormat,
} from "../project/start-pack.js";

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
      "Agent target: claude, codex, all",
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
}

function parseAgent(value: string): ProjectAgent {
  if (value === "claude" || value === "codex" || value === "all") return value;
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
