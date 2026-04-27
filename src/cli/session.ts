import type { Command } from "commander";
import {
  renderAxintSessionStart,
  startAxintSession,
  type AxintSessionAgent,
  type AxintSessionFormat,
} from "../project/session.js";

export function registerSession(program: Command, version: string) {
  const session = program
    .command("session")
    .description("Start and enforce an Axint agent session for Xcode/Codex work");

  session
    .command("start")
    .description(
      "Create .axint/session/current.json, refresh Axint context files, and return the required context"
    )
    .option("--dir <dir>", "Project directory", ".")
    .option("--name <name>", "Project name")
    .option("--platform <platform>", "Target Apple platform", "the target Apple platform")
    .option(
      "--agent <agent>",
      "Agent target: claude, codex, cursor, xcode, all",
      parseAgent,
      "all" as AxintSessionAgent
    )
    .option("--ttl <minutes>", "Session TTL in minutes", parseTtl, 720)
    .option("--expect <version>", "Expected Axint version", version)
    .option("--json", "Shortcut for --format json")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseFormat,
      "markdown" as AxintSessionFormat
    )
    .action(
      (options: {
        dir: string;
        name?: string;
        platform: string;
        agent: AxintSessionAgent;
        ttl: number;
        expect: string;
        json?: boolean;
        format: AxintSessionFormat;
      }) => {
        const result = startAxintSession({
          targetDir: options.dir,
          projectName: options.name,
          expectedVersion: options.expect,
          platform: options.platform,
          agent: options.agent,
          ttlMinutes: options.ttl,
        });
        console.log(
          renderAxintSessionStart(result, options.json ? "json" : options.format)
        );
      }
    );
}

function parseAgent(value: string): AxintSessionAgent {
  if (
    value === "claude" ||
    value === "codex" ||
    value === "cursor" ||
    value === "xcode" ||
    value === "all"
  ) {
    return value;
  }
  throw new Error(`invalid agent: ${value}`);
}

function parseFormat(value: string): AxintSessionFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid format: ${value}`);
}

function parseTtl(value: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new Error(`invalid ttl minutes: ${value}`);
}
