import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type StatusFormat = "markdown" | "json" | "prompt";

export function registerStatus(program: Command, version: string) {
  program
    .command("status")
    .description("Show local Axint version, runtime paths, and MCP reload steps")
    .option("--format <format>", "Output format: markdown, json, or prompt", "markdown")
    .action((options: { format?: string }) => {
      console.log(renderCliStatus(version, parseFormat(options.format)));
    });
}

export function renderCliStatus(
  version: string,
  format: StatusFormat = "markdown"
): string {
  const packageJsonPath = findPackageJsonPath();
  const status = {
    packageName: "@axint/compiler",
    version,
    packageJsonPath,
    node: process.version,
    nodePath: which("node"),
    npmPath: which("npm"),
    npxPath: which("npx"),
    cwd: process.cwd(),
    mcpCommand: `${which("npx") ?? "npx"} -y @axint/compiler axint-mcp`,
    updateCommand: `${which("npm") ?? "npm"} install -g @axint/compiler@latest`,
    upgradeCommand: "axint upgrade --apply",
    xcodeSetupCommand: "axint xcode install --project .",
    doctorCommand: "axint doctor",
    projectInitCommand: "axint project init",
    verificationPrompt:
      "Call axint.status and tell me the running Axint MCP version before editing code.",
    restartInstruction:
      "After updating, reload or reconnect the Axint MCP server/tool process. Keep the current Codex or Claude thread when your client supports MCP reload; if it does not, use the generated same-thread resume prompt instead of starting blind.",
  };

  if (format === "json") return JSON.stringify(status, null, 2);

  if (format === "prompt") {
    return [
      "Use Axint before editing Apple-native code.",
      status.verificationPrompt,
      "Use the active agent lane: Codex/Claude/Cursor/Cowork should patch natively, while Xcode can use axint.xcode.guard for durable guard proof.",
      `Expected local package version: ${status.version}.`,
      "If axint.status reports an older version, run axint.upgrade or axint upgrade --apply, then reload only the MCP server/tool process.",
      "After each generated Swift surface, run axint.cloud.check or axint cloud check --source <file> with build/test evidence when available.",
    ].join("\n");
  }

  return [
    "# Axint Status",
    "",
    `- Local package: ${status.packageName}@${status.version}`,
    `- Package path: ${status.packageJsonPath}`,
    `- Node: ${status.node}`,
    `- node: ${status.nodePath ?? "not found on PATH"}`,
    `- npm: ${status.npmPath ?? "not found on PATH"}`,
    `- npx: ${status.npxPath ?? "not found on PATH"}`,
    "",
    "## Agent Setup",
    "",
    "Use this at the start of any Codex, Claude, Cowork, Cursor, or Xcode agent session:",
    "",
    "```text",
    status.verificationPrompt,
    "Use axint workflow check as the portable guard. In Xcode-hosted sessions, axint.xcode.guard can also write .axint/guard/latest.* proof.",
    "If MCP tools are visible but calls fail after a reload or transport close, run the CLI fallback: axint workflow check --dir . --stage context-recovery --agent <host> --session-token <token>.",
    "If Axint is not available, inspect the project .mcp.json or client MCP settings, make sure npx uses a durable full path, then reload the Axint MCP server/tool process.",
    "```",
    "",
    "If the running MCP version is stale, use the same-thread upgrade flow:",
    "",
    "```sh",
    status.upgradeCommand,
    "```",
    "",
    "For a new Apple project, install the full optional Xcode proof bridge:",
    "",
    "```sh",
    status.xcodeSetupCommand,
    status.doctorCommand,
    "```",
    "",
    status.restartInstruction,
  ].join("\n");
}

function parseFormat(value: string | undefined): StatusFormat {
  if (value === "json" || value === "prompt" || value === "markdown") return value;
  return "markdown";
}

function which(binary: string): string | undefined {
  try {
    const out = execSync(`command -v ${binary}`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function findPackageJsonPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../package.json"),
    resolve(process.cwd(), "package.json"),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
      if (pkg.name === "@axint/compiler") return candidate;
    } catch {
      // Keep searching.
    }
  }
  return "<unknown>";
}
