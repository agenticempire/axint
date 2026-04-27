import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readProjectStartPack } from "../project/start-pack.js";

export type DoctorFormat = "markdown" | "json";
export type DoctorStatus = "ok" | "warn" | "fail";

export interface MachineDoctorInput {
  cwd?: string;
  expectedVersion?: string;
  runningVersion?: string;
  toolsRegistered?: number;
  promptsRegistered?: number;
  packageJsonPath?: string;
  format?: DoctorFormat;
}

export interface MachineDoctorCheck {
  label: string;
  status: DoctorStatus;
  detail: string;
  fix?: string;
}

export interface MachineDoctorReport {
  status: DoctorStatus;
  cwd: string;
  expectedVersion?: string;
  runningVersion: string;
  checks: MachineDoctorCheck[];
  nextSteps: string[];
}

export function runMachineDoctor(input: MachineDoctorInput = {}): MachineDoctorReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const runningVersion = input.runningVersion ?? packageVersion();
  const expectedVersion = input.expectedVersion;
  const checks: MachineDoctorCheck[] = [];

  checks.push(versionCheck(runningVersion, expectedVersion));
  checks.push(nodeCheck());
  checks.push(pathCheck("npm", "Install Node/npm or use Homebrew Node."));
  checks.push(
    pathCheck("npx", "Install npm/npx or configure .mcp.json with a full path.")
  );
  checks.push(projectFileCheck(cwd, ".mcp.json", "Run axint project init."));
  checks.push(projectFileCheck(cwd, "AGENTS.md", "Run axint project init."));
  checks.push(projectFileCheck(cwd, "CLAUDE.md", "Run axint project init."));
  checks.push(
    projectFileCheck(cwd, ".axint/AXINT_REHYDRATE.md", "Run axint project init.")
  );
  checks.push(projectFileCheck(cwd, ".axint/AXINT_MEMORY.md", "Run axint project init."));
  checks.push(
    projectFileCheck(cwd, ".axint/AXINT_DOCS_CONTEXT.md", "Run axint project init.")
  );
  checks.push(projectContractCheck(cwd));
  checks.push(mcpConfigCheck(cwd));
  checks.push(agentConfigCheck());

  if (input.toolsRegistered !== undefined) {
    checks.push({
      label: "MCP tool registry",
      status: input.toolsRegistered >= 15 ? "ok" : "warn",
      detail: `${input.toolsRegistered} tools, ${input.promptsRegistered ?? 0} prompts`,
      fix:
        input.toolsRegistered >= 15
          ? undefined
          : "Restart the MCP server after updating Axint.",
    });
  }

  if (input.packageJsonPath) {
    checks.push({
      label: "MCP package path",
      status: "ok",
      detail: input.packageJsonPath,
    });
  }

  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "ok";

  return {
    status,
    cwd,
    expectedVersion,
    runningVersion,
    checks,
    nextSteps: nextStepsFor(checks),
  };
}

export function renderMachineDoctorReport(
  report: MachineDoctorReport,
  format: DoctorFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  const icon: Record<DoctorStatus, string> = {
    ok: "ok",
    warn: "needs attention",
    fail: "blocked",
  };
  return [
    `# Axint Doctor: ${icon[report.status]}`,
    "",
    `- Working directory: ${report.cwd}`,
    `- Running Axint: ${report.runningVersion}`,
    report.expectedVersion ? `- Expected Axint: ${report.expectedVersion}` : null,
    "",
    "## Checks",
    ...report.checks.map(
      (check) =>
        `- ${check.status.toUpperCase()} ${check.label}: ${check.detail}${check.fix ? ` Fix: ${check.fix}` : ""}`
    ),
    "",
    "## Next Steps",
    ...report.nextSteps.map((step) => `- ${step}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function versionCheck(
  runningVersion: string,
  expectedVersion: string | undefined
): MachineDoctorCheck {
  if (!expectedVersion) {
    return {
      label: "Axint version",
      status: "ok",
      detail: `running ${runningVersion}`,
    };
  }
  const matches = runningVersion === expectedVersion;
  return {
    label: "Axint version",
    status: matches ? "ok" : "fail",
    detail: `running ${runningVersion}, expected ${expectedVersion}`,
    fix: matches
      ? undefined
      : "Install the expected Axint version, rerun axint xcode setup --agent claude --guarded, then restart the Xcode agent chat.",
  };
}

function nodeCheck(): MachineDoctorCheck {
  const major = Number(process.version.replace(/^v/, "").split(".")[0]);
  return {
    label: "Node runtime",
    status: major >= 22 ? "ok" : "warn",
    detail: `${process.version} at ${process.execPath}`,
    fix: major >= 22 ? undefined : "Use Node 22+ for Axint MCP and CLI runs.",
  };
}

function pathCheck(binary: string, fix: string): MachineDoctorCheck {
  const path = which(binary);
  return {
    label: `${binary} path`,
    status: path ? "ok" : "fail",
    detail: path ?? "not found",
    fix: path ? undefined : fix,
  };
}

function projectFileCheck(cwd: string, relPath: string, fix: string): MachineDoctorCheck {
  const found = existsSync(resolve(cwd, relPath));
  return {
    label: relPath,
    status: found ? "ok" : "warn",
    detail: found ? "present" : "missing",
    fix: found ? undefined : fix,
  };
}

function projectContractCheck(cwd: string): MachineDoctorCheck {
  const contract = readProjectStartPack(cwd);
  return {
    label: ".axint/project.json",
    status: contract ? "ok" : "warn",
    detail: contract ? "project start pack present" : "missing or unreadable",
    fix: contract ? undefined : "Run axint project init to add the project contract.",
  };
}

function mcpConfigCheck(cwd: string): MachineDoctorCheck {
  const path = resolve(cwd, ".mcp.json");
  if (!existsSync(path)) {
    return {
      label: "project MCP config",
      status: "warn",
      detail: ".mcp.json missing",
      fix: "Run axint project init.",
    };
  }
  try {
    const text = readFileSync(path, "utf-8");
    const hasAxint = /\baxint\b/.test(text);
    const durable =
      text.includes("/opt/homebrew/bin/npx") ||
      text.includes("/usr/local/bin/npx") ||
      text.includes('"url"');
    return {
      label: "project MCP config",
      status: hasAxint && durable ? "ok" : hasAxint ? "warn" : "fail",
      detail: hasAxint
        ? durable
          ? "axint registered with durable launch path"
          : "axint registered, but launch path may depend on restricted Xcode PATH"
        : "axint not registered",
      fix:
        hasAxint && durable
          ? undefined
          : "Run axint project init --force or axint xcode setup --agent claude --guarded.",
    };
  } catch {
    return {
      label: "project MCP config",
      status: "fail",
      detail: ".mcp.json could not be read",
      fix: "Repair or regenerate .mcp.json with axint project init --force.",
    };
  }
}

function agentConfigCheck(): MachineDoctorCheck {
  const configPath = join(
    homedir(),
    "Library",
    "Developer",
    "Xcode",
    "CodingAssistant",
    "ClaudeAgentConfig",
    ".claude.json"
  );
  if (!existsSync(configPath)) {
    return {
      label: "Xcode Claude Agent config",
      status: "warn",
      detail: "not found",
      fix: "Run axint xcode setup --agent claude --guarded after installing Axint.",
    };
  }
  const text = readFileSync(configPath, "utf-8");
  const hasAxint = /\baxint\b/.test(text);
  return {
    label: "Xcode Claude Agent config",
    status: hasAxint ? "ok" : "warn",
    detail: hasAxint ? "axint registered" : "config exists but axint not registered",
    fix: hasAxint ? undefined : "Run axint xcode setup --agent claude --guarded.",
  };
}

function nextStepsFor(checks: MachineDoctorCheck[]): string[] {
  const fixes = checks.filter((check) => check.fix).map((check) => check.fix!);
  if (fixes.length > 0) return [...new Set(fixes)].slice(0, 5);
  return [
    "Start the Xcode agent chat and ask it to call axint.status.",
    "Run axint.workflow.check before planning, before writing, before building, and before committing.",
  ];
}

function which(binary: string): string | null {
  try {
    const out = execSync(`command -v ${binary}`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
