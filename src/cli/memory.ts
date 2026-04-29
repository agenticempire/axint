import type { Command } from "commander";
import {
  renderProjectMemoryIndex,
  writeProjectMemoryIndex,
  type AxintProjectMemoryFormat,
} from "../project/memory-index.js";

export function registerMemory(program: Command) {
  const memory = program
    .command("memory")
    .description("Build and inspect Axint's local project memory index");

  memory
    .command("index")
    .description(
      "Write .axint/memory/latest.* from project context, runs, repairs, and learning packets"
    )
    .option("--dir <dir>", "Project directory", ".")
    .option("--cwd <dir>", "Alias for --dir when copying MCP-style fallback commands")
    .option("--project-name <name>", "Project name label")
    .option("--changed <file...>", "Changed files to seed memory context")
    .option("--modified <file...>", "Alias for --changed")
    .option("--modified-files <file...>", "Alias for --changed")
    .option("--json", "Shortcut for --format json")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseMemoryFormat,
      "markdown" as AxintProjectMemoryFormat
    )
    .action(
      (options: {
        dir: string;
        cwd?: string;
        projectName?: string;
        changed?: string[];
        modified?: string[];
        modifiedFiles?: string[];
        json?: boolean;
        format: AxintProjectMemoryFormat;
      }) => {
        const result = writeProjectMemoryIndex({
          cwd: options.cwd ?? options.dir,
          projectName: options.projectName,
          changedFiles: options.modifiedFiles ?? options.modified ?? options.changed,
        });
        const format = options.json ? "json" : options.format;
        console.log(renderProjectMemoryIndex(result.index, format));
      }
    );
}

function parseMemoryFormat(value: string): AxintProjectMemoryFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid memory format: ${value}`);
}
