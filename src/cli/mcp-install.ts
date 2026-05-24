import { spawnSync } from "node:child_process";

export type McpInstallAgent = "codex" | "claude" | "all";
export type McpInstallFormat = "markdown" | "json";
export type McpInstallStatus = "ok" | "warn" | "fail" | "planned";

export interface McpInstallOptions {
  agent?: string;
  remote?: boolean;
  force?: boolean;
  dryRun?: boolean;
  format?: McpInstallFormat;
}

export interface McpInstallPlan {
  agent: Exclude<McpInstallAgent, "all">;
  command: string;
  args: string[];
  removeArgs: string[];
  verifyArgs: string[];
  mode: "local" | "remote";
}

export interface McpInstallResult extends McpInstallPlan {
  status: McpInstallStatus;
  detail: string;
  output?: string;
  nextSteps: string[];
}

export interface McpInstallReport {
  status: McpInstallStatus;
  mode: "local" | "remote";
  requestedAgent: McpInstallAgent;
  results: McpInstallResult[];
}

const AXINT_PACKAGE = "@axint/compiler";
const AXINT_MCP_BIN = "axint-mcp";
const REMOTE_MCP_URL = "https://mcp.axint.ai/mcp";
const DEFAULT_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

export function installMcpHosts(options: McpInstallOptions = {}): McpInstallReport {
  const requestedAgent = parseMcpInstallAgent(options.agent ?? "codex");
  const plans = buildMcpInstallPlans({
    requestedAgent,
    remote: options.remote ?? false,
  });
  const results = plans.map((plan) => installOne(plan, options));
  const status = summarizeStatus(results);

  return {
    status,
    mode: options.remote ? "remote" : "local",
    requestedAgent,
    results,
  };
}

export function buildMcpInstallPlans(input: {
  requestedAgent: McpInstallAgent;
  remote?: boolean;
  npxPath?: string;
  pathEnv?: string;
}): McpInstallPlan[] {
  const agents =
    input.requestedAgent === "all"
      ? (["codex", "claude"] as const)
      : ([input.requestedAgent] as const);
  return agents.map((agent) =>
    buildPlanForAgent({
      agent,
      remote: input.remote ?? false,
      npxPath: input.npxPath ?? detectCommand("npx") ?? "npx",
      pathEnv: input.pathEnv ?? DEFAULT_PATH,
    })
  );
}

export function parseMcpInstallAgent(value: string): McpInstallAgent {
  if (value === "codex" || value === "claude" || value === "all") return value;
  throw new Error(`invalid MCP install agent: ${value}`);
}

export function parseMcpInstallFormat(value: string): McpInstallFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid MCP install format: ${value}`);
}

export function renderMcpInstallReport(
  report: McpInstallReport,
  format: McpInstallFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  const lines = [
    "# Axint MCP Install",
    "",
    `- Status: ${report.status}`,
    `- Mode: ${report.mode}`,
    `- Agent: ${report.requestedAgent}`,
    "",
    "## Results",
  ];

  for (const result of report.results) {
    lines.push(
      "",
      `### ${result.agent}`,
      `- Status: ${result.status}`,
      `- Detail: ${result.detail}`,
      `- Command: \`${shellLine([result.command, ...result.args])}\``
    );
    if (result.output) {
      lines.push("- Output:", "```text", result.output.trim(), "```");
    }
    if (result.nextSteps.length > 0) {
      lines.push("- Next steps:");
      for (const step of result.nextSteps) lines.push(`  - ${step}`);
    }
  }

  return lines.join("\n");
}

function buildPlanForAgent(input: {
  agent: Exclude<McpInstallAgent, "all">;
  remote: boolean;
  npxPath: string;
  pathEnv: string;
}): McpInstallPlan {
  if (input.agent === "codex") {
    const command = detectCommand("codex") ?? "codex";
    return {
      agent: "codex",
      command,
      args: input.remote
        ? ["mcp", "add", "axint", "--url", REMOTE_MCP_URL]
        : [
            "mcp",
            "add",
            "axint",
            "--env",
            `PATH=${input.pathEnv}`,
            "--",
            input.npxPath,
            "-y",
            "-p",
            AXINT_PACKAGE,
            AXINT_MCP_BIN,
          ],
      removeArgs: ["mcp", "remove", "axint"],
      verifyArgs: ["mcp", "get", "axint"],
      mode: input.remote ? "remote" : "local",
    };
  }

  const command = detectCommand("claude") ?? "claude";
  return {
    agent: "claude",
    command,
    args: input.remote
      ? ["mcp", "add", "axint", "--transport", "http", REMOTE_MCP_URL]
      : [
          "mcp",
          "add",
          "--transport",
          "stdio",
          "axint",
          "--",
          input.npxPath,
          "-y",
          "-p",
          AXINT_PACKAGE,
          AXINT_MCP_BIN,
        ],
    removeArgs: ["mcp", "remove", "axint"],
    verifyArgs: ["mcp", "get", "axint"],
    mode: input.remote ? "remote" : "local",
  };
}

function installOne(plan: McpInstallPlan, options: McpInstallOptions): McpInstallResult {
  const missingHost = !commandExists(plan.command);
  const baseNextSteps = [
    "Reload or reconnect only the Axint MCP server/tool process.",
    "In the same thread, call axint.status and axint.activate before editing code.",
    "If the current client cannot hot-reload MCP tools, start a new agent session after saving the current context.",
  ];

  if (options.dryRun) {
    return {
      ...plan,
      status: "planned",
      detail: "Dry run only; no host config was changed.",
      nextSteps: baseNextSteps,
    };
  }

  if (missingHost) {
    return {
      ...plan,
      status: "fail",
      detail: `${plan.agent} command was not found on PATH.`,
      nextSteps: [
        `Install ${plan.agent} or add it to PATH, then rerun axint mcp install --agent ${plan.agent}.`,
      ],
    };
  }

  if (options.force) {
    run(plan.command, plan.removeArgs);
  } else {
    const existing = run(plan.command, plan.verifyArgs);
    if (existing.status === 0) {
      return {
        ...plan,
        status: "ok",
        detail: "Axint is already registered in this host MCP config.",
        output: existing.combined,
        nextSteps: baseNextSteps,
      };
    }
  }

  const added = run(plan.command, plan.args);
  if (added.status !== 0) {
    return {
      ...plan,
      status: "fail",
      detail: `Host MCP install failed with exit ${added.status}.`,
      output: added.combined,
      nextSteps: [
        `Run manually: ${shellLine([plan.command, ...plan.args])}`,
        ...baseNextSteps,
      ],
    };
  }

  const verified = run(plan.command, plan.verifyArgs);
  if (verified.status !== 0) {
    return {
      ...plan,
      status: "warn",
      detail: "Install command completed, but verification did not find axint.",
      output: verified.combined,
      nextSteps: [
        `Check host config manually with: ${shellLine([plan.command, ...plan.verifyArgs])}`,
        ...baseNextSteps,
      ],
    };
  }

  return {
    ...plan,
    status: "ok",
    detail: "Axint MCP is installed and visible in the host config.",
    output: verified.combined,
    nextSteps: baseNextSteps,
  };
}

function summarizeStatus(results: McpInstallResult[]): McpInstallStatus {
  if (results.some((result) => result.status === "fail")) return "fail";
  if (results.some((result) => result.status === "warn")) return "warn";
  if (results.every((result) => result.status === "planned")) return "planned";
  return "ok";
}

function run(command: string, args: string[]): { status: number; combined: string } {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 4,
  });
  return {
    status: result.status ?? 1,
    combined: [result.stdout, result.stderr].filter(Boolean).join("").trim(),
  };
}

function detectCommand(name: string): string | null {
  for (const candidate of knownCommandCandidates(name)) {
    if (run("/bin/test", ["-x", candidate]).status === 0) return candidate;
  }

  const result = spawnSync("/usr/bin/which", [name], {
    encoding: "utf-8",
  });
  const output = result.stdout.trim();
  return result.status === 0 && output ? output : null;
}

function knownCommandCandidates(name: string): string[] {
  if (name === "codex") {
    return ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"];
  }
  if (name === "npx") {
    return ["/opt/homebrew/bin/npx", "/usr/local/bin/npx"];
  }
  if (name === "claude") {
    return ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
  }
  return [];
}

function commandExists(command: string): boolean {
  if (command.includes("/")) {
    return run("/bin/test", ["-x", command]).status === 0;
  }
  return detectCommand(command) !== null;
}

function shellLine(parts: string[]): string {
  return parts.map(quoteShell).join(" ");
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
