import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { AxintRunKind } from "./project-runner.js";

export type AxintRunJobState =
  | "running"
  | "cancel_requested"
  | "cancelled"
  | "pass"
  | "needs_review"
  | "fail"
  | "unknown";

export interface AxintRunJobCommand {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd: string;
  pid?: number;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
  cancelled?: boolean;
}

export interface AxintRunJobRecord {
  schema: "https://axint.ai/schemas/run-job.v1.json";
  id: string;
  cwd: string;
  kind: AxintRunKind;
  projectName: string;
  status: AxintRunJobState;
  createdAt: string;
  updatedAt: string;
  currentCommand?: AxintRunJobCommand;
  commands: AxintRunJobCommand[];
  artifacts?: {
    json?: string;
    markdown?: string;
  };
  cancelRequestedAt?: string;
  finishedAt?: string;
}

export interface AxintRunJobStatusResult {
  status: AxintRunJobState | "none";
  cwd: string;
  id?: string;
  jobPath?: string;
  job?: AxintRunJobRecord;
  latestReport?: {
    id?: string;
    status?: string;
    createdAt?: string;
    gate?: { decision?: string; reason?: string };
  };
  activePids: number[];
  message: string;
}

export interface AxintRunCancelResult {
  status: "cancel_requested" | "nothing_to_cancel" | "not_found" | "error";
  cwd: string;
  id?: string;
  jobPath?: string;
  killedPids: number[];
  errors: string[];
  message: string;
}

export type AxintRunJobOutputFormat = "markdown" | "json";

export function createRunJobRecord(input: {
  id: string;
  cwd: string;
  kind: AxintRunKind;
  projectName: string;
}): AxintRunJobRecord {
  const now = new Date().toISOString();
  const job: AxintRunJobRecord = {
    schema: "https://axint.ai/schemas/run-job.v1.json",
    id: input.id,
    cwd: input.cwd,
    kind: input.kind,
    projectName: input.projectName,
    status: "running",
    createdAt: now,
    updatedAt: now,
    commands: [],
  };
  writeRunJobRecord(job);
  writeLatestActiveJob(job);
  return job;
}

export function markRunJobCommandStarted(
  job: AxintRunJobRecord | undefined,
  command: Omit<AxintRunJobCommand, "startedAt">
): void {
  if (!job) return;
  const started: AxintRunJobCommand = {
    ...command,
    startedAt: new Date().toISOString(),
  };
  job.status = job.status === "cancel_requested" ? "cancel_requested" : "running";
  job.currentCommand = started;
  job.commands.push(started);
  touch(job);
}

export function markRunJobCommandFinished(
  job: AxintRunJobRecord | undefined,
  commandId: string,
  result: {
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    cancelled?: boolean;
  }
): void {
  if (!job) return;
  const command = job.commands.find((item) => item.id === commandId);
  if (command) {
    command.endedAt = new Date().toISOString();
    command.exitCode = result.exitCode;
    command.signal = result.signal;
    command.timedOut = result.timedOut;
    command.cancelled = result.cancelled;
  }
  if (job.currentCommand?.id === commandId) {
    job.currentCommand = undefined;
  }
  if (result.cancelled) {
    job.status = "cancelled";
  }
  touch(job);
}

export function finishRunJobRecord(
  job: AxintRunJobRecord | undefined,
  input: {
    status: "pass" | "needs_review" | "fail";
    artifacts?: { json?: string; markdown?: string };
  }
): void {
  if (!job) return;
  job.status = job.status === "cancelled" ? "cancelled" : input.status;
  job.artifacts = input.artifacts;
  job.finishedAt = new Date().toISOString();
  job.currentCommand = undefined;
  touch(job);
  writeLatestActiveJob(job);
}

export function readRunJobRecord(cwd: string, id: string): AxintRunJobRecord | undefined {
  return readJson(jobPath(cwd, id)) as AxintRunJobRecord | undefined;
}

export function getRunJobStatus(
  input: {
    cwd?: string;
    id?: string;
  } = {}
): AxintRunJobStatusResult {
  const cwd = resolve(input.cwd ?? process.cwd());
  const job = input.id ? readRunJobRecord(cwd, input.id) : readLatestActiveJob(cwd);
  if (job) {
    const activePids = activeJobCommands(job)
      .map((command) => command.pid)
      .filter((pid): pid is number => typeof pid === "number");
    return {
      status: job.status,
      cwd,
      id: job.id,
      jobPath: jobPath(cwd, job.id),
      job,
      activePids,
      message:
        activePids.length > 0
          ? `Axint run ${job.id} is ${job.status} with active pid(s): ${activePids.join(", ")}.`
          : `Axint run ${job.id} is ${job.status}.`,
    };
  }

  const latestReport = readLatestReport(cwd);
  if (latestReport) {
    return {
      status: (latestReport.status as AxintRunJobState | undefined) ?? "unknown",
      cwd,
      id: latestReport.id,
      latestReport,
      activePids: [],
      message: `Latest Axint run report is ${latestReport.status ?? "unknown"}.`,
    };
  }

  return {
    status: "none",
    cwd,
    activePids: [],
    message: "No Axint run job or latest report was found.",
  };
}

export function cancelRunJob(
  input: {
    cwd?: string;
    id?: string;
  } = {}
): AxintRunCancelResult {
  const cwd = resolve(input.cwd ?? process.cwd());
  const job = input.id ? readRunJobRecord(cwd, input.id) : readLatestActiveJob(cwd);
  if (!job) {
    return {
      status: input.id ? "not_found" : "nothing_to_cancel",
      cwd,
      id: input.id,
      killedPids: [],
      errors: [],
      message: input.id
        ? `No Axint run job found for ${input.id}.`
        : "No active Axint run job was found.",
    };
  }

  const active = activeJobCommands(job).filter(
    (command) => typeof command.pid === "number"
  );
  if (active.length === 0) {
    return {
      status: "nothing_to_cancel",
      cwd,
      id: job.id,
      jobPath: jobPath(cwd, job.id),
      killedPids: [],
      errors: [],
      message: `Axint run ${job.id} has no active child process to cancel.`,
    };
  }

  const killedPids: number[] = [];
  const errors: string[] = [];
  for (const command of active) {
    const pid = command.pid!;
    const error = killProcessGroup(pid);
    if (error) {
      errors.push(`${pid}: ${error}`);
    } else {
      killedPids.push(pid);
      command.cancelled = true;
    }
  }

  job.status = killedPids.length > 0 ? "cancel_requested" : "running";
  job.cancelRequestedAt = new Date().toISOString();
  touch(job);
  writeLatestActiveJob(job);

  return {
    status: errors.length > 0 && killedPids.length === 0 ? "error" : "cancel_requested",
    cwd,
    id: job.id,
    jobPath: jobPath(cwd, job.id),
    killedPids,
    errors,
    message:
      killedPids.length > 0
        ? `Cancel requested for Axint run ${job.id}; killed pid group(s): ${killedPids.join(", ")}.`
        : `Axint run ${job.id} could not be cancelled.`,
  };
}

export function renderRunJobStatus(
  result: AxintRunJobStatusResult,
  format: AxintRunJobOutputFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  return [
    `# Axint Run Status: ${result.status}`,
    "",
    `- CWD: ${result.cwd}`,
    result.id ? `- Run: ${result.id}` : "- Run: none",
    result.jobPath ? `- Job file: ${result.jobPath}` : undefined,
    result.activePids.length > 0
      ? `- Active pid(s): ${result.activePids.join(", ")}`
      : "- Active pid(s): none",
    `- Message: ${result.message}`,
    result.job?.currentCommand
      ? `- Current command: ${result.job.currentCommand.label} · ${result.job.currentCommand.command} ${result.job.currentCommand.args.join(" ")}`
      : undefined,
    result.latestReport?.gate?.decision
      ? `- Latest gate: ${result.latestReport.gate.decision}`
      : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function renderRunCancelResult(
  result: AxintRunCancelResult,
  format: AxintRunJobOutputFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  return [
    `# Axint Run Cancel: ${result.status}`,
    "",
    `- CWD: ${result.cwd}`,
    result.id ? `- Run: ${result.id}` : "- Run: none",
    result.jobPath ? `- Job file: ${result.jobPath}` : undefined,
    result.killedPids.length > 0
      ? `- Killed pid group(s): ${result.killedPids.join(", ")}`
      : "- Killed pid group(s): none",
    result.errors.length > 0 ? `- Errors: ${result.errors.join("; ")}` : "- Errors: none",
    `- Message: ${result.message}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function activeJobCommands(job: AxintRunJobRecord): AxintRunJobCommand[] {
  return job.commands.filter((command) => !command.endedAt);
}

function touch(job: AxintRunJobRecord): void {
  job.updatedAt = new Date().toISOString();
  writeRunJobRecord(job);
  writeLatestActiveJob(job);
}

function writeRunJobRecord(job: AxintRunJobRecord): void {
  const path = jobPath(job.cwd, job.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(job, null, 2)}\n`, "utf-8");
}

function writeLatestActiveJob(job: AxintRunJobRecord): void {
  const path = latestActivePath(job.cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(job, null, 2)}\n`, "utf-8");
}

function readLatestActiveJob(cwd: string): AxintRunJobRecord | undefined {
  const direct = readJson(latestActivePath(cwd)) as AxintRunJobRecord | undefined;
  if (direct) return direct;

  const dir = jobsDir(cwd);
  if (!existsSync(dir)) return undefined;
  const latest = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .at(-1);
  return latest
    ? (readJson(join(dir, latest)) as AxintRunJobRecord | undefined)
    : undefined;
}

function readLatestReport(cwd: string): AxintRunJobStatusResult["latestReport"] {
  const latest = readJson(resolve(cwd, ".axint/run/latest.json")) as
    | AxintRunJobStatusResult["latestReport"]
    | undefined;
  if (!latest) return undefined;
  return {
    id: latest.id,
    status: latest.status,
    createdAt: latest.createdAt,
    gate: latest.gate,
  };
}

function readJson(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return undefined;
  }
}

function jobsDir(cwd: string): string {
  return resolve(cwd, ".axint/run/jobs");
}

function jobPath(cwd: string, id: string): string {
  return join(jobsDir(cwd), `${basename(id)}.json`);
}

function latestActivePath(cwd: string): string {
  return resolve(cwd, ".axint/run/latest-active.json");
}

function killProcessGroup(pid: number): string | undefined {
  try {
    process.kill(-pid, "SIGTERM");
    return undefined;
  } catch (groupError) {
    try {
      process.kill(pid, "SIGTERM");
      return undefined;
    } catch (pidError) {
      return `${(groupError as Error).message}; ${(pidError as Error).message}`;
    }
  }
}
