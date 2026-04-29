import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const AXINT_PACKAGE = "@axint/compiler";

export type AxintUpgradeFormat = "markdown" | "json" | "prompt";
export type AxintUpgradeStatus = "current" | "ready" | "upgraded" | "fail";
export type AxintUpgradeCommandStatus = "pending" | "pass" | "fail" | "skipped";

export interface AxintUpgradeInput {
  cwd?: string;
  currentVersion: string;
  targetVersion?: string;
  latestVersion?: string;
  apply?: boolean;
  reinstallXcode?: boolean;
  writeReport?: boolean;
}

export interface AxintUpgradeCommandResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface AxintUpgradeRuntime {
  lookupLatestVersion?: () => string;
  runCommand?: (
    command: string,
    args: string[],
    options: { cwd: string }
  ) => AxintUpgradeCommandResult;
  now?: () => Date;
}

export interface AxintUpgradeCommand {
  label: string;
  command: string;
  args: string[];
  display: string;
  status: AxintUpgradeCommandStatus;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface AxintUpgradeArtifacts {
  json: string;
  markdown: string;
}

export interface AxintUpgradeReport {
  packageName: string;
  generatedAt: string;
  cwd: string;
  currentVersion: string;
  latestVersion: string;
  targetVersion: string;
  updateAvailable: boolean;
  apply: boolean;
  reinstallXcode: boolean;
  status: AxintUpgradeStatus;
  restartRequired: boolean;
  restartRequiredAfterApply: boolean;
  commands: AxintUpgradeCommand[];
  sameThreadPrompt: string;
  artifacts?: AxintUpgradeArtifacts;
  notes: string[];
  error?: string;
}

export function runAxintUpgrade(
  input: AxintUpgradeInput,
  runtime: AxintUpgradeRuntime = {}
): AxintUpgradeReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const now = runtime.now?.() ?? new Date();
  const apply = input.apply === true;
  const reinstallXcode = input.reinstallXcode === true;
  const notes: string[] = [];
  const commands: AxintUpgradeCommand[] = [];
  const currentVersion = normalizeVersion(input.currentVersion);

  let latestVersion: string;
  let targetVersion: string;

  try {
    targetVersion = resolveTargetVersion(input, runtime);
    latestVersion = normalizeVersion(input.latestVersion ?? targetVersion);
  } catch (error) {
    const report = buildReport({
      cwd,
      generatedAt: now.toISOString(),
      currentVersion,
      latestVersion: "",
      targetVersion: "",
      updateAvailable: false,
      apply,
      reinstallXcode,
      status: "fail",
      commands,
      notes,
      error: error instanceof Error ? error.message : String(error),
    });
    maybeWriteReport(report, input.writeReport);
    return report;
  }

  const compare = compareVersions(currentVersion, targetVersion);
  const updateAvailable = compare < 0;

  if (compare > 0) {
    notes.push(
      `Target v${targetVersion} is older than the running Axint v${currentVersion}; downgrade was not applied.`
    );
  }

  if (!updateAvailable) {
    const report = buildReport({
      cwd,
      generatedAt: now.toISOString(),
      currentVersion,
      latestVersion,
      targetVersion,
      updateAvailable,
      apply,
      reinstallXcode,
      status: "current",
      commands,
      notes,
    });
    maybeWriteReport(report, input.writeReport);
    return report;
  }

  commands.push(
    buildCommand(
      "Install newest Axint package",
      "npm",
      ["install", "-g", `${AXINT_PACKAGE}@${targetVersion}`],
      "pending"
    )
  );

  if (reinstallXcode) {
    commands.push(
      buildCommand(
        "Refresh optional Xcode MCP wiring",
        "axint",
        ["xcode", "install", "--project", cwd],
        "pending"
      )
    );
  }

  if (!apply) {
    const report = buildReport({
      cwd,
      generatedAt: now.toISOString(),
      currentVersion,
      latestVersion,
      targetVersion,
      updateAvailable,
      apply,
      reinstallXcode,
      status: "ready",
      commands,
      notes,
    });
    maybeWriteReport(report, input.writeReport);
    return report;
  }

  const executed = executeCommands(commands, cwd, runtime);
  const failed = executed.find((command) => command.status === "fail");
  const report = buildReport({
    cwd,
    generatedAt: now.toISOString(),
    currentVersion,
    latestVersion,
    targetVersion,
    updateAvailable,
    apply,
    reinstallXcode,
    status: failed ? "fail" : "upgraded",
    commands: executed,
    notes,
    error: failed?.error ?? failed?.stderr,
  });
  maybeWriteReport(report, input.writeReport ?? true);
  return report;
}

export function renderAxintUpgradeReport(
  report: AxintUpgradeReport,
  format: AxintUpgradeFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "prompt") return report.sameThreadPrompt;

  const statusLine =
    report.status === "upgraded"
      ? `Upgraded to v${report.targetVersion}. Reload the MCP server, not your whole working context.`
      : report.status === "ready"
        ? `v${report.targetVersion} is available. Run with --apply when you are ready.`
        : report.status === "current"
          ? `Already on the newest requested version: v${report.currentVersion}.`
          : `Upgrade check failed: ${report.error ?? "unknown error"}.`;

  const commandLines =
    report.commands.length === 0
      ? ["No install commands are needed."]
      : report.commands.map((command) => {
          const badge =
            command.status === "pass"
              ? "pass"
              : command.status === "fail"
                ? "fail"
                : command.status === "skipped"
                  ? "skipped"
                  : "pending";
          return `- ${badge}: ${command.display}`;
        });

  const artifacts = report.artifacts
    ? [
        "",
        "## Artifacts",
        "",
        `- JSON: ${report.artifacts.json}`,
        `- Markdown: ${report.artifacts.markdown}`,
      ]
    : [];

  const notes =
    report.notes.length > 0
      ? ["", "## Notes", "", ...report.notes.map((note) => `- ${note}`)]
      : [];

  return [
    "# Axint Same-Thread Upgrade",
    "",
    statusLine,
    "",
    `- Current: v${report.currentVersion}`,
    `- Latest checked: ${report.latestVersion ? `v${report.latestVersion}` : "unknown"}`,
    `- Target: ${report.targetVersion ? `v${report.targetVersion}` : "unknown"}`,
    `- Project: ${report.cwd}`,
    `- Apply mode: ${report.apply ? "on" : "off"}`,
    "",
    "## Commands",
    "",
    ...commandLines,
    "",
    "## Same-Thread Continuation",
    "",
    "```text",
    report.sameThreadPrompt,
    "```",
    ...artifacts,
    ...notes,
  ].join("\n");
}

function resolveTargetVersion(
  input: AxintUpgradeInput,
  runtime: AxintUpgradeRuntime
): string {
  const explicit = input.targetVersion?.trim();
  if (explicit && explicit !== "latest") return normalizeVersion(explicit);
  if (input.latestVersion) return normalizeVersion(input.latestVersion);
  return normalizeVersion((runtime.lookupLatestVersion ?? lookupLatestVersion)());
}

function lookupLatestVersion(): string {
  const result = spawnSync("npm", ["view", AXINT_PACKAGE, "version", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `npm view ${AXINT_PACKAGE} version failed`);
  }

  const raw = result.stdout.trim();
  if (!raw) throw new Error(`npm did not return a latest ${AXINT_PACKAGE} version`);

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") return parsed;
  } catch {
    // npm can return a bare version if registry output is customized.
  }

  return raw.replace(/^"|"$/g, "");
}

function executeCommands(
  commands: AxintUpgradeCommand[],
  cwd: string,
  runtime: AxintUpgradeRuntime
): AxintUpgradeCommand[] {
  const runner = runtime.runCommand ?? runLocalCommand;
  const executed: AxintUpgradeCommand[] = [];

  for (const command of commands) {
    const result = runner(command.command, command.args, { cwd });
    const status = result.status === 0 ? "pass" : "fail";
    executed.push({
      ...command,
      status,
      exitCode: result.status,
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr),
      error: result.error,
    });

    if (status === "fail") {
      for (const remaining of commands.slice(executed.length)) {
        executed.push({ ...remaining, status: "skipped" });
      }
      break;
    }
  }

  return executed;
}

function runLocalCommand(
  command: string,
  args: string[],
  options: { cwd: string }
): AxintUpgradeCommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message,
  };
}

function buildReport(input: {
  cwd: string;
  generatedAt: string;
  currentVersion: string;
  latestVersion: string;
  targetVersion: string;
  updateAvailable: boolean;
  apply: boolean;
  reinstallXcode: boolean;
  status: AxintUpgradeStatus;
  commands: AxintUpgradeCommand[];
  notes: string[];
  error?: string;
}): AxintUpgradeReport {
  return {
    packageName: AXINT_PACKAGE,
    generatedAt: input.generatedAt,
    cwd: input.cwd,
    currentVersion: input.currentVersion,
    latestVersion: input.latestVersion,
    targetVersion: input.targetVersion,
    updateAvailable: input.updateAvailable,
    apply: input.apply,
    reinstallXcode: input.reinstallXcode,
    status: input.status,
    restartRequired:
      input.status === "ready" || input.status === "upgraded" || input.status === "fail",
    restartRequiredAfterApply: input.updateAvailable,
    commands: input.commands,
    sameThreadPrompt: buildSameThreadPrompt(input),
    notes: input.notes,
    error: input.error,
  };
}

function buildSameThreadPrompt(input: {
  cwd: string;
  currentVersion: string;
  targetVersion: string;
  status: AxintUpgradeStatus;
  updateAvailable: boolean;
  apply: boolean;
  reinstallXcode: boolean;
}): string {
  const target = input.targetVersion ? `v${input.targetVersion}` : "the latest version";
  const action =
    input.status === "upgraded"
      ? `Axint was upgraded from v${input.currentVersion} to ${target}.`
      : input.status === "ready"
        ? `${target} is available for Axint.`
        : input.status === "current"
          ? `Axint is already current at v${input.currentVersion}.`
          : `The Axint upgrade check did not complete.`;

  const reloadLine =
    input.status === "current"
      ? "No package upgrade is needed. If the client is still connected to a stale or confused MCP process, reload or reconnect only the Axint MCP server/tool process and call axint.status again."
      : "Reload or reconnect only the Axint MCP server/tool process so this same conversation can see the new package.";
  const xcodeLine =
    input.status === "current"
      ? "No Xcode wiring refresh is required unless axint.doctor reports a setup issue."
      : input.reinstallXcode
        ? "If you are using Xcode, the upgrade flow also refreshes the optional Xcode MCP wiring."
        : "Xcode MCP wiring was intentionally skipped for this upgrade flow.";
  const statusLine =
    input.status === "current"
      ? "Before editing code, call axint.status if you need to prove the currently connected MCP version."
      : "After the MCP process reconnects, call axint.status and confirm the running version before editing code.";

  return [
    action,
    "Keep this chat/thread. Do not restart from scratch.",
    reloadLine,
    statusLine,
    "Then call axint.session.start or axint.context.memory if the agent needs compact context recovery.",
    xcodeLine,
    `Project cwd: ${input.cwd}`,
    "If your client cannot reload MCP in place, paste this block into the next tool-enabled message so the work resumes with context instead of starting blind.",
  ].join("\n");
}

function buildCommand(
  label: string,
  command: string,
  args: string[],
  status: AxintUpgradeCommandStatus
): AxintUpgradeCommand {
  return {
    label,
    command,
    args,
    display: [command, ...args.map(quoteShellArg)].join(" "),
    status,
  };
}

function maybeWriteReport(
  report: AxintUpgradeReport,
  writeReport: boolean | undefined
): void {
  if (!writeReport) return;
  const dir = join(report.cwd, ".axint", "upgrade");
  mkdirSync(dir, { recursive: true });
  const json = join(dir, "latest.json");
  const markdown = join(dir, "latest.md");
  const withArtifacts = {
    ...report,
    artifacts: { json, markdown },
  };
  writeFileSync(json, JSON.stringify(withArtifacts, null, 2) + "\n");
  writeFileSync(markdown, renderAxintUpgradeReport(withArtifacts), "utf8");
  report.artifacts = { json, markdown };
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, "");
}

function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] - right.numbers[i];
  }
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

function parseVersion(version: string): {
  numbers: [number, number, number];
  prerelease: string;
} {
  const [core, prerelease = ""] = normalizeVersion(version).split("-", 2);
  const parts = core.split(".").map((part) => Number.parseInt(part, 10));
  return {
    numbers: [
      Number.isFinite(parts[0]) ? parts[0] : 0,
      Number.isFinite(parts[1]) ? parts[1] : 0,
      Number.isFinite(parts[2]) ? parts[2] : 0,
    ],
    prerelease,
  };
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function trimOutput(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 4000) : undefined;
}
