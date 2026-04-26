import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type StatusFormat = "markdown" | "json" | "prompt";

export function registerStatus(program: Command, version: string) {
  program
    .command("status")
    .description("Show local Axint version, runtime paths, and Xcode MCP restart steps")
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
    xcodeSetupCommand: "axint xcode setup --agent claude",
    doctorCommand: "axint doctor",
    projectInitCommand: "axint project init",
    verificationPrompt:
      "Call axint.status and tell me the running Axint MCP version before editing code.",
    restartInstruction:
      "Restart the Xcode Claude Agent chat after updating. MCP clients keep the old Node process alive until restarted.",
  };

  if (format === "json") return JSON.stringify(status, null, 2);

  if (format === "prompt") {
    return [
      "Use Axint before editing Apple-native code.",
      status.verificationPrompt,
      `Expected local package version: ${status.version}.`,
      "If axint.status reports an older version, stop and ask me to update/restart the Xcode agent chat.",
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
    "## Xcode Agent Setup",
    "",
    "Use this when starting a new Claude-in-Xcode chat:",
    "",
    "```text",
    status.verificationPrompt,
    "If Axint is not available, inspect the project .mcp.json, make sure npx uses a durable full path, then restart this Xcode agent chat.",
    "```",
    "",
    "If the running MCP version is stale:",
    "",
    "```sh",
    status.updateCommand,
    status.xcodeSetupCommand,
    "```",
    "",
    "For a new project, install the full Axint agent pack:",
    "",
    "```sh",
    status.projectInitCommand,
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
