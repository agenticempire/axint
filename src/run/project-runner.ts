import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { runCloudCheck, type CloudCheckReport } from "../cloud/check.js";
import { writeProjectContextIndex } from "../project/context-index.js";
import { startAxintSession } from "../project/session.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import type { Diagnostic } from "../core/types.js";
import {
  renderWorkflowCheckReport,
  runWorkflowCheck,
  type WorkflowCheckReport,
} from "../mcp/workflow-check.js";
import {
  createRunJobRecord,
  finishRunJobRecord,
  markRunJobCommandFinished,
  markRunJobCommandStarted,
  type AxintRunJobRecord,
} from "./job-store.js";

export type AxintRunFormat = "markdown" | "json" | "prompt";
export type AxintRunPlatform = "macOS" | "iOS" | "watchOS" | "visionOS" | "all";
export type AxintRunStepState = "pass" | "warn" | "fail" | "skipped";
export type AxintRunKind = "local" | "byo-runner";

export interface AxintRunRenderOptions {
  includeSource?: boolean;
}

export interface AxintRunInput {
  id?: string;
  cwd?: string;
  kind?: AxintRunKind;
  projectName?: string;
  expectedVersion?: string;
  platform?: AxintRunPlatform;
  scheme?: string;
  workspace?: string;
  project?: string;
  destination?: string;
  configuration?: string;
  derivedDataPath?: string;
  testPlan?: string;
  onlyTesting?: string[];
  modifiedFiles?: string[];
  skipBuild?: boolean;
  skipTests?: boolean;
  runtime?: boolean;
  runtimeTimeoutSeconds?: number;
  timeoutSeconds?: number;
  expectedBehavior?: string;
  actualBehavior?: string;
  runtimeFailure?: string;
  dryRun?: boolean;
  writeReport?: boolean;
}

export interface AxintRunCommandResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  logPath?: string;
  resultBundlePath?: string;
  dryRun?: boolean;
  cancelled?: boolean;
}

export interface AxintRunStep {
  name: string;
  state: AxintRunStepState;
  detail: string;
  command?: string;
  durationMs?: number;
}

export interface AxintRunReport {
  id: string;
  kind: AxintRunKind;
  status: "pass" | "needs_review" | "fail";
  gate: {
    decision: "ready_to_ship" | "fix_required" | "evidence_required";
    reason: string;
  };
  cwd: string;
  projectName: string;
  platform: AxintRunPlatform;
  scheme?: string;
  destination: string;
  createdAt: string;
  session: {
    token: string;
    path: string;
  };
  job: {
    id: string;
    path: string;
    statusCommand: string;
    cancelCommand: string;
  };
  workflow: WorkflowCheckReport;
  swiftValidation: {
    filesChecked: number;
    diagnostics: Diagnostic[];
  };
  cloudChecks: CloudCheckReport[];
  commands: {
    build?: AxintRunCommandResult;
    test?: AxintRunCommandResult;
    runtime?: AxintRunCommandResult;
    buildSettings?: AxintRunCommandResult;
  };
  steps: AxintRunStep[];
  artifacts: {
    json?: string;
    markdown?: string;
    projectContextJson?: string;
    projectContextMarkdown?: string;
  };
  nextSteps: string[];
  repairPrompt: string;
}

interface XcodePlan {
  containerKind: "workspace" | "project";
  containerPath: string;
  scheme?: string;
  destination: string;
  configuration?: string;
  derivedDataPath?: string;
  testPlan?: string;
  onlyTesting: string[];
}

export async function runAxintProject(
  input: AxintRunInput = {}
): Promise<AxintRunReport> {
  const startedAt = Date.now();
  const runId = input.id ?? `axrun_${randomUUID()}`;
  const cwd = resolve(input.cwd ?? process.cwd());
  const platform = input.platform ?? inferPlatform(input.destination);
  const projectName = input.projectName ?? inferProjectName(cwd);
  const job = createRunJobRecord({
    id: runId,
    cwd,
    kind: input.kind ?? "local",
    projectName,
  });
  const session = startAxintSession({
    targetDir: cwd,
    projectName,
    expectedVersion: input.expectedVersion ?? "unknown",
    platform,
    agent: "all",
  });
  const projectContext = writeProjectContextIndex({
    targetDir: cwd,
    projectName,
    changedFiles: input.modifiedFiles,
  });
  const swiftFiles = resolveSwiftFiles(cwd, input.modifiedFiles);
  const validationDiagnostics: Diagnostic[] = [];
  const cloudChecks: CloudCheckReport[] = [];
  const steps: AxintRunStep[] = [
    {
      name: "Axint session",
      state: "pass",
      detail: `Started session ${session.session.token}.`,
    },
    {
      name: "Project context index",
      state: "pass",
      detail: `Indexed ${projectContext.index.files.swift} Swift files and wrote ${relativeOrAbsolute(cwd, projectContext.jsonPath)}.`,
    },
  ];

  for (const file of swiftFiles) {
    const source = readFileSync(file, "utf-8");
    validationDiagnostics.push(
      ...validateSwiftSource(source, relativeOrAbsolute(cwd, file)).diagnostics
    );
  }

  steps.push({
    name: "Swift validation",
    state: validationDiagnostics.some((d) => d.severity === "error")
      ? "fail"
      : validationDiagnostics.some((d) => d.severity === "warning")
        ? "warn"
        : "pass",
    detail:
      swiftFiles.length === 0
        ? "No Swift files were found to validate."
        : `Validated ${swiftFiles.length} Swift file${swiftFiles.length === 1 ? "" : "s"}.`,
  });

  const cloudTargets = swiftFiles.length > 0 ? swiftFiles : [];
  for (const file of cloudTargets) {
    cloudChecks.push(
      runCloudCheck({
        sourcePath: file,
        platform,
        runtimeFailure: input.runtimeFailure,
        expectedBehavior: input.expectedBehavior,
        actualBehavior: input.actualBehavior,
        projectContext: projectContext.index,
      })
    );
  }

  steps.push({
    name: "Cloud Check",
    state:
      cloudChecks.length === 0
        ? "skipped"
        : cloudChecks.some((check) => check.status === "fail")
          ? "fail"
          : cloudChecks.some((check) => check.status === "needs_review")
            ? "warn"
            : "pass",
    detail:
      cloudChecks.length === 0
        ? "No source file was available for Cloud Check."
        : `Ran ${cloudChecks.length} Cloud Check report${cloudChecks.length === 1 ? "" : "s"}.`,
  });

  const commands: AxintRunReport["commands"] = {};
  let plan: XcodePlan | undefined;
  try {
    plan = createXcodePlan(cwd, input, platform);
  } catch (err) {
    steps.push({
      name: "Xcode plan",
      state: input.skipBuild ? "skipped" : "fail",
      detail: (err as Error).message,
    });
  }

  if (plan && !input.skipBuild) {
    const buildArgs = buildXcodeArgs(plan, "build");
    commands.build = await runCommand("Xcode build", "xcodebuild", buildArgs, {
      cwd,
      timeoutSeconds: input.timeoutSeconds ?? 600,
      dryRun: input.dryRun,
      job,
    });
    steps.push(stepFromCommand("Xcode build", commands.build));
  } else if (input.skipBuild) {
    steps.push({
      name: "Xcode build",
      state: "skipped",
      detail: "Build skipped by input.",
    });
  }

  if (plan && !input.skipTests && !input.skipBuild) {
    const resultBundlePath = runResultBundlePath(cwd, runId, "XcodeTest");
    const testArgs = buildXcodeArgs(plan, "test", { resultBundlePath });
    commands.test = await runCommand("Xcode test", "xcodebuild", testArgs, {
      cwd,
      timeoutSeconds: input.timeoutSeconds ?? 900,
      dryRun: input.dryRun,
      job,
    });
    steps.push(stepFromCommand("Xcode test", commands.test));
  } else if (input.skipTests) {
    steps.push({
      name: "Xcode test",
      state: "skipped",
      detail: "Tests skipped by input.",
    });
  }

  if (plan && input.runtime && platform === "macOS" && !input.dryRun) {
    const runtime = await runMacRuntimeProbe(cwd, plan, input, job);
    commands.buildSettings = runtime.buildSettings;
    commands.runtime = runtime.launch;
    steps.push(
      runtime.launch
        ? stepFromCommand("Runtime launch", runtime.launch)
        : {
            name: "Runtime launch",
            state: "warn",
            detail: runtime.detail,
          }
    );
  } else if (input.runtime && input.dryRun) {
    steps.push({
      name: "Runtime launch",
      state: "skipped",
      detail: "Runtime launch skipped in dry-run mode.",
    });
  } else if (input.runtime && platform !== "macOS") {
    steps.push({
      name: "Runtime launch",
      state: "skipped",
      detail: "Runtime launch MVP currently supports macOS app targets.",
    });
  }

  const xcodeEvidence = buildXcodeEvidence(commands, plan);
  const focusedBehavior = buildFocusedTestBehavior(plan, commands.test);
  if (xcodeEvidence && cloudTargets.length > 0) {
    cloudChecks.splice(
      0,
      cloudChecks.length,
      ...cloudTargets.map((file) =>
        runCloudCheck({
          sourcePath: file,
          platform,
          xcodeBuildLog: xcodeEvidence,
          runtimeFailure:
            input.runtimeFailure ?? runtimeFailureFromCommand(commands.runtime),
          expectedBehavior: input.expectedBehavior ?? focusedBehavior?.expectedBehavior,
          actualBehavior: input.actualBehavior ?? focusedBehavior?.actualBehavior,
          projectContext: projectContext.index,
        })
      )
    );
    updateCloudCheckStep(steps, cloudChecks, {
      refreshedWithEvidence: true,
    });
  }

  const workflow = runWorkflowCheck({
    cwd,
    stage: "pre-build",
    sessionStarted: true,
    sessionToken: session.session.token,
    readAgentInstructions: true,
    readDocsContext: true,
    readRehydrationContext: true,
    ranStatus: true,
    ranSwiftValidate: swiftFiles.length > 0,
    ranCloudCheck: cloudChecks.length > 0,
    xcodeBuildPassed: commandPassed(commands.build),
    xcodeTestsPassed: commandPassed(commands.test),
    modifiedFiles: swiftFiles.map((file) => relativeOrAbsolute(cwd, file)),
  });

  const status = summarizeStatus(steps, workflow, validationDiagnostics, cloudChecks);
  const report: AxintRunReport = {
    id: runId,
    kind: input.kind ?? "local",
    status,
    gate: gateForStatus(status, steps),
    cwd,
    projectName,
    platform,
    scheme: plan?.scheme,
    destination: plan?.destination ?? defaultDestination(platform),
    createdAt: new Date().toISOString(),
    session: {
      token: session.session.token,
      path: session.sessionPath,
    },
    job: {
      id: runId,
      path: resolve(cwd, ".axint/run/jobs", `${runId}.json`),
      statusCommand: `axint run status --dir ${shellQuote(cwd)} --id ${runId}`,
      cancelCommand: `axint run cancel --dir ${shellQuote(cwd)} --id ${runId}`,
    },
    workflow,
    swiftValidation: {
      filesChecked: swiftFiles.length,
      diagnostics: validationDiagnostics,
    },
    cloudChecks,
    commands,
    steps: steps.map((step) =>
      step.durationMs === undefined && step.name === "Axint session"
        ? { ...step, durationMs: Date.now() - startedAt }
        : step
    ),
    artifacts: {
      projectContextJson: projectContext.jsonPath,
      projectContextMarkdown: projectContext.markdownPath,
    },
    nextSteps: buildNextSteps(status, steps, workflow, cloudChecks),
    repairPrompt: buildRunRepairPrompt({
      status,
      workflow,
      validationDiagnostics,
      cloudChecks,
      commands,
    }),
  };

  if (input.writeReport !== false) {
    const artifacts = writeRunArtifacts(report);
    report.artifacts = artifacts;
  }
  finishRunJobRecord(job, {
    status,
    artifacts: {
      json: report.artifacts.json,
      markdown: report.artifacts.markdown,
    },
  });

  return report;
}

export function renderAxintRunReport(
  report: AxintRunReport,
  format: AxintRunFormat = "markdown",
  options: AxintRunRenderOptions = {}
): string {
  if (format === "json") {
    return JSON.stringify(compactRunReport(report, options), null, 2);
  }
  if (format === "prompt") return report.repairPrompt;

  const lines = [
    `# Axint Run: ${report.status}`,
    "",
    `- Project: ${report.projectName}`,
    `- Platform: ${report.platform}`,
    `- Scheme: ${report.scheme ?? "not detected"}`,
    `- Destination: ${report.destination}`,
    `- Gate: ${report.gate.decision}`,
    `- Reason: ${report.gate.reason}`,
    `- Session: ${report.session.token}`,
    `- Job: ${report.job.id}`,
    `- Status command: \`${report.job.statusCommand}\``,
    `- Cancel command: \`${report.job.cancelCommand}\``,
    "",
    "## Steps",
    ...report.steps.map(
      (step) =>
        `- ${stateLabel(step.state)} ${step.name}: ${step.detail}${
          step.command ? `\n  - \`${step.command}\`` : ""
        }`
    ),
    "",
    "## Workflow Gate",
    "",
    renderWorkflowCheckReport(report.workflow),
    "",
    "## Swift Diagnostics",
    ...(report.swiftValidation.diagnostics.length > 0
      ? report.swiftValidation.diagnostics
          .slice(0, 20)
          .map(
            (diagnostic) =>
              `- ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`
          )
      : ["- None."]),
    "",
    "## Cloud Checks",
    ...(report.cloudChecks.length > 0
      ? report.cloudChecks.map(
          (check) =>
            `- ${check.fileName}: ${check.status} · ${check.gate.decision} · ${check.errors} errors, ${check.warnings} warnings`
        )
      : ["- None."]),
    "",
    "## Next Steps",
    ...(report.nextSteps.length > 0
      ? report.nextSteps.map((step) => `- ${step}`)
      : ["- None."]),
  ];

  if (
    report.artifacts.json ||
    report.artifacts.markdown ||
    report.artifacts.projectContextJson ||
    report.artifacts.projectContextMarkdown
  ) {
    lines.push("", "## Artifacts");
    if (report.artifacts.json) lines.push(`- JSON: ${report.artifacts.json}`);
    if (report.artifacts.markdown) {
      lines.push(`- Markdown: ${report.artifacts.markdown}`);
    }
    if (report.artifacts.projectContextJson) {
      lines.push(`- Project context JSON: ${report.artifacts.projectContextJson}`);
    }
    if (report.artifacts.projectContextMarkdown) {
      lines.push(
        `- Project context Markdown: ${report.artifacts.projectContextMarkdown}`
      );
    }
  }

  return lines.join("\n");
}

function createXcodePlan(
  cwd: string,
  input: AxintRunInput,
  platform: AxintRunPlatform
): XcodePlan {
  const workspace = input.workspace
    ? resolve(cwd, input.workspace)
    : findFirstWithExtension(cwd, ".xcworkspace");
  const project = input.project
    ? resolve(cwd, input.project)
    : findFirstWithExtension(cwd, ".xcodeproj");
  const containerPath = workspace ?? project;
  if (!containerPath) {
    throw new Error(
      "No .xcworkspace or .xcodeproj found. Pass --workspace or --project."
    );
  }
  const scheme =
    input.scheme ?? inferScheme(containerPath) ?? stripXcodeExtension(containerPath);

  return {
    containerKind: workspace ? "workspace" : "project",
    containerPath,
    scheme,
    destination: input.destination ?? defaultDestination(platform),
    configuration: input.configuration,
    derivedDataPath: input.derivedDataPath,
    testPlan: input.testPlan,
    onlyTesting: normalizeOnlyTesting(input.onlyTesting),
  };
}

function buildXcodeArgs(
  plan: XcodePlan,
  action: "build" | "test",
  options: { resultBundlePath?: string } = {}
): string[] {
  const args = [
    plan.containerKind === "workspace" ? "-workspace" : "-project",
    plan.containerPath,
  ];
  if (plan.scheme) args.push("-scheme", plan.scheme);
  if (plan.destination) args.push("-destination", plan.destination);
  if (plan.configuration) args.push("-configuration", plan.configuration);
  if (plan.derivedDataPath) args.push("-derivedDataPath", plan.derivedDataPath);
  if (action === "test") {
    if (plan.testPlan) args.push("-testPlan", plan.testPlan);
    for (const selector of plan.onlyTesting) {
      args.push(formatOnlyTestingArg(selector));
    }
    if (options.resultBundlePath) {
      args.push("-resultBundlePath", options.resultBundlePath);
    }
  }
  args.push(action);
  return args;
}

function normalizeOnlyTesting(selectors?: string[]): string[] {
  return unique(
    (selectors ?? [])
      .flatMap((selector) => selector.split(","))
      .map((selector) => selector.trim())
      .filter(Boolean)
  );
}

function formatOnlyTestingArg(selector: string): string {
  return selector.startsWith("-only-testing:") ? selector : `-only-testing:${selector}`;
}

async function runCommand(
  label: string,
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeoutSeconds: number;
    dryRun?: boolean;
    job?: AxintRunJobRecord;
  }
): Promise<AxintRunCommandResult> {
  const started = Date.now();
  const commandId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (options.dryRun) {
    const resultBundlePath = expectedResultBundlePath(args);
    markRunJobCommandStarted(options.job, {
      id: commandId,
      label,
      command,
      args,
      cwd: options.cwd,
      expectedResultBundlePath: resultBundlePath,
    });
    markRunJobCommandFinished(options.job, commandId, {
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    return {
      command,
      args,
      cwd: options.cwd,
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "",
      stderr: "",
      durationMs: 0,
      resultBundlePath,
      dryRun: true,
    };
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let spawnError: Error | undefined;
    const resultBundlePath = expectedResultBundlePath(args);
    const logPath = commandLogPath(options.cwd, options.job?.id, label, commandId);
    appendToCommandLog(
      logPath,
      [
        `# ${label}`,
        `cwd: ${options.cwd}`,
        `command: ${[command, ...args].map(shellQuote).join(" ")}`,
        resultBundlePath ? `expected-xcresult: ${resultBundlePath}` : undefined,
        "",
      ]
        .filter(Boolean)
        .join("\n")
    );
    if (resultBundlePath) mkdirSync(dirname(resultBundlePath), { recursive: true });

    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    markRunJobCommandStarted(options.job, {
      id: commandId,
      label,
      command,
      args,
      cwd: options.cwd,
      pid: child.pid,
      logPath,
      expectedResultBundlePath: resultBundlePath,
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      appendToCommandLog(logPath, text);
      stdout = appendCommandOutput(stdout, text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      appendToCommandLog(logPath, text);
      stderr = appendCommandOutput(stderr, text);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      appendToCommandLog(
        logPath,
        `\n[axint] Command timed out after ${options.timeoutSeconds}s; sending SIGTERM to child process group.\n`
      );
      if (child.pid) killProcessGroup(child.pid, "SIGTERM");
    }, options.timeoutSeconds * 1000);

    child.once("error", (error) => {
      spawnError = error;
      appendToCommandLog(
        logPath,
        `\n[axint] Spawn error: ${error.name}: ${error.message}\n`
      );
      finish(null, null);
    });
    child.once("close", (code, signal) => {
      finish(code, signal);
    });

    function finish(code: number | null, signal: NodeJS.Signals | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const cancelled = signal === "SIGTERM" && !timedOut;
      markRunJobCommandFinished(options.job, commandId, {
        exitCode: code,
        signal,
        timedOut,
        cancelled,
      });
      resolve({
        command,
        args,
        cwd: options.cwd,
        exitCode: code,
        signal,
        timedOut,
        stdout,
        stderr: spawnError
          ? `${stderr}\n${spawnError.name}: ${spawnError.message}`.trim()
          : stderr,
        durationMs: Date.now() - started,
        logPath,
        resultBundlePath,
        cancelled,
      });
    }
  });
}

async function runMacRuntimeProbe(
  cwd: string,
  plan: XcodePlan,
  input: AxintRunInput,
  job?: AxintRunJobRecord
): Promise<{
  buildSettings?: AxintRunCommandResult;
  launch?: AxintRunCommandResult;
  detail: string;
}> {
  const settings = await runCommand(
    "Xcode build settings",
    "xcodebuild",
    [...buildXcodeArgs(plan, "build").slice(0, -1), "-showBuildSettings", "-json"],
    {
      cwd,
      timeoutSeconds: 90,
      job,
    }
  );
  if (settings.exitCode !== 0) {
    return {
      buildSettings: settings,
      detail: "Could not read Xcode build settings for runtime launch.",
    };
  }
  const appPath = inferMacAppPath(settings.stdout);
  if (!appPath || !existsSync(appPath)) {
    return {
      buildSettings: settings,
      detail: "Build settings did not resolve to a built .app bundle.",
    };
  }
  const launch = await runRuntimeLaunchProbe(
    cwd,
    appPath,
    input.runtimeTimeoutSeconds ?? 8,
    job
  );
  return {
    buildSettings: settings,
    launch,
    detail: `Launched ${appPath}.`,
  };
}

async function runRuntimeLaunchProbe(
  cwd: string,
  appPath: string,
  waitSeconds: number,
  job?: AxintRunJobRecord
): Promise<AxintRunCommandResult> {
  const started = Date.now();
  const appName = basename(appPath, ".app");
  const openResult = await runCommand("Runtime open", "open", ["-n", appPath], {
    cwd,
    timeoutSeconds: 15,
    job,
  });
  if (openResult.exitCode !== 0) return openResult;

  const boundedWait = String(Math.min(Math.max(Math.round(waitSeconds), 1), 60));
  await delay(Number(boundedWait) * 1000);
  const processCheck = await runCommand(
    "Runtime process check",
    "pgrep",
    ["-x", appName],
    {
      cwd,
      timeoutSeconds: 5,
      job,
    }
  );
  return {
    command: "axint-runtime-probe",
    args: [appPath, "--process", appName, "--wait", boundedWait],
    cwd,
    exitCode: processCheck.exitCode,
    signal: processCheck.signal,
    timedOut: processCheck.timedOut,
    stdout: processCheck.stdout,
    stderr:
      processCheck.exitCode === 0
        ? processCheck.stderr
        : `Launched ${appPath}, but no running process named ${appName} was found after ${boundedWait}s.\n${processCheck.stderr}`,
    durationMs: Date.now() - started,
  };
}

function inferMacAppPath(buildSettingsJson: string): string | undefined {
  try {
    const parsed = JSON.parse(buildSettingsJson) as Array<{
      buildSettings?: Record<string, string>;
    }>;
    const settings = parsed[0]?.buildSettings;
    if (!settings) return undefined;
    const dir = settings.BUILT_PRODUCTS_DIR;
    const product = settings.FULL_PRODUCT_NAME;
    if (!dir || !product || !product.endsWith(".app")) return undefined;
    return join(dir, product);
  } catch {
    return undefined;
  }
}

function resolveSwiftFiles(cwd: string, files?: string[]): string[] {
  if (files && files.length > 0) {
    return unique(
      files
        .map((file) => resolve(cwd, file))
        .filter((file) => extname(file) === ".swift" && existsSync(file))
    );
  }
  return findSwiftFiles(cwd).slice(0, 80);
}

function findSwiftFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const ignored = new Set([
    ".git",
    ".build",
    ".swiftpm",
    "DerivedData",
    "node_modules",
    "Pods",
    ".axint",
  ]);
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (ignored.has(entry)) continue;
    const path = join(dir, entry);
    const stat = safeStat(path);
    if (!stat) continue;
    if (stat.isDirectory()) {
      if (entry.endsWith(".xcodeproj") || entry.endsWith(".xcworkspace")) continue;
      results.push(...findSwiftFiles(path));
    } else if (entry.endsWith(".swift")) {
      results.push(path);
    }
  }
  return results;
}

function findFirstWithExtension(dir: string, suffix: ".xcodeproj" | ".xcworkspace") {
  if (!existsSync(dir)) return undefined;
  const entries = readdirSync(dir).sort();
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = safeStat(path);
    if (stat?.isDirectory() && entry.endsWith(suffix)) return path;
  }
  return undefined;
}

function inferScheme(containerPath: string): string | undefined {
  const schemes = findFiles(containerPath, ".xcscheme", 6);
  if (schemes.length === 0) return undefined;
  return basename(schemes[0], ".xcscheme");
}

function findFiles(dir: string, suffix: string, depth: number): string[] {
  if (depth < 0 || !existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = safeStat(path);
    if (!stat) continue;
    if (stat.isDirectory()) results.push(...findFiles(path, suffix, depth - 1));
    if (stat.isFile() && entry.endsWith(suffix)) results.push(path);
  }
  return results.sort();
}

function safeStat(path: string) {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

function inferProjectName(cwd: string) {
  return basename(cwd) || "AppleApp";
}

function inferPlatform(destination?: string): AxintRunPlatform {
  if (!destination) return "macOS";
  if (/visionOS/i.test(destination)) return "visionOS";
  if (/watchOS/i.test(destination)) return "watchOS";
  if (/iOS/i.test(destination)) return "iOS";
  if (/macOS/i.test(destination)) return "macOS";
  return "all";
}

function defaultDestination(platform: AxintRunPlatform) {
  if (platform === "iOS") return "platform=iOS Simulator,name=iPhone 16";
  if (platform === "visionOS") {
    return "platform=visionOS Simulator,name=Apple Vision Pro";
  }
  if (platform === "watchOS") {
    return "platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)";
  }
  return "platform=macOS";
}

function stripXcodeExtension(path: string) {
  return basename(path).replace(/\.(xcodeproj|xcworkspace)$/i, "");
}

function stepFromCommand(name: string, result: AxintRunCommandResult): AxintRunStep {
  const printable = [result.command, ...result.args].map(shellQuote).join(" ");
  return {
    name,
    state:
      result.exitCode === 0 && !result.timedOut && !result.cancelled ? "pass" : "fail",
    detail: result.dryRun
      ? "Dry run planned the command without executing it."
      : result.cancelled
        ? "Command was cancelled through Axint run cancellation."
        : result.timedOut
          ? `Command timed out after ${Math.round(result.durationMs / 1000)}s.`
          : result.exitCode === 0
            ? "Command completed successfully."
            : `Command exited with ${result.exitCode ?? result.signal ?? "unknown"}.`,
    command: printable,
    durationMs: result.durationMs,
  };
}

function commandPassed(result?: AxintRunCommandResult): boolean {
  return Boolean(
    result &&
    !result.dryRun &&
    result.exitCode === 0 &&
    !result.timedOut &&
    !result.cancelled
  );
}

function updateCloudCheckStep(
  steps: AxintRunStep[],
  cloudChecks: CloudCheckReport[],
  options: { refreshedWithEvidence?: boolean } = {}
) {
  const step = steps.find((item) => item.name === "Cloud Check");
  if (!step) return;
  step.state =
    cloudChecks.length === 0
      ? "skipped"
      : cloudChecks.some((check) => check.status === "fail")
        ? "fail"
        : cloudChecks.some((check) => check.status === "needs_review")
          ? "warn"
          : "pass";
  step.detail =
    cloudChecks.length === 0
      ? "No source file was available for Cloud Check."
      : options.refreshedWithEvidence
        ? `Reconciled ${cloudChecks.length} Cloud Check report${cloudChecks.length === 1 ? "" : "s"} with Xcode build/test/runtime evidence.`
        : `Ran ${cloudChecks.length} Cloud Check report${cloudChecks.length === 1 ? "" : "s"}.`;
}

function buildXcodeEvidence(
  commands: AxintRunReport["commands"],
  plan?: XcodePlan
): string | undefined {
  const chunks = [
    commandEvidence("Xcode build", commands.build),
    focusedTestEvidence(commands.test, plan),
    commandEvidence("Xcode test", commands.test),
    commandEvidence("Runtime launch", commands.runtime),
  ].filter(Boolean);
  return chunks.length > 0 ? chunks.join("\n\n") : undefined;
}

function focusedTestEvidence(
  result?: AxintRunCommandResult,
  plan?: XcodePlan
): string | undefined {
  const selectors = plan?.onlyTesting ?? [];
  if (!result || result.dryRun || selectors.length === 0) return undefined;
  const state = result.exitCode === 0 && !result.timedOut ? "passed" : "failed";
  const command = [result.command, ...result.args].map(shellQuote).join(" ");
  const relevantOutput = focusedTestOutput(result, selectors);
  return [
    `Focused Xcode test proof ${state}.`,
    `Command: ${command}`,
    `Selectors: ${selectors.map(formatOnlyTestingArg).join(", ")}`,
    result.resultBundlePath ? `Result bundle: ${result.resultBundlePath}` : undefined,
    result.logPath ? `Command log: ${result.logPath}` : undefined,
    state === "passed" ? "** TEST SUCCEEDED **" : "** TEST FAILED **",
    relevantOutput ? `Relevant test output:\n${relevantOutput}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFocusedTestBehavior(
  plan?: XcodePlan,
  result?: AxintRunCommandResult
):
  | {
      expectedBehavior: string;
      actualBehavior: string;
    }
  | undefined {
  if (!plan || plan.onlyTesting.length === 0 || !result || result.dryRun) {
    return undefined;
  }
  const selectors = plan.onlyTesting.join(", ");
  if (result.exitCode !== 0 || result.timedOut) {
    return {
      expectedBehavior: `Focused test selector(s) should pass: ${selectors}.`,
      actualBehavior: `Focused test selector(s) did not pass through axint run --only-testing: ${selectors}.`,
    };
  }
  return {
    expectedBehavior: `Focused test selector(s) should pass: ${selectors}.`,
    actualBehavior: `Focused test selector(s) passed through axint run --only-testing: ${selectors}.`,
  };
}

function commandEvidence(
  label: string,
  result?: AxintRunCommandResult
): string | undefined {
  if (!result || result.dryRun) return undefined;

  const state = result.exitCode === 0 && !result.timedOut ? "succeeded" : "failed";
  const header = `${label} ${state}. Exit: ${
    result.exitCode ?? result.signal ?? "unknown"
  }.`;
  const metadata = [
    result.logPath ? `Command log: ${result.logPath}` : undefined,
    result.resultBundlePath ? `Result bundle: ${result.resultBundlePath}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  const output = trimCommandEvidence([result.stdout, result.stderr].join("\n"));
  return [header, metadata, output].filter(Boolean).join("\n");
}

function focusedTestOutput(
  result: AxintRunCommandResult,
  selectors: string[]
): string | undefined {
  const output = [result.stdout, result.stderr].join("\n");
  if (!output.trim()) return undefined;
  const selectorTerms = selectors.flatMap((selector) => {
    const normalized = selector.replace(/^-only-testing:/, "");
    const parts = normalized.split("/");
    return [normalized, parts.at(-1) ?? normalized].filter(Boolean);
  });
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selectedLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      /\*\*\s*test\s+(?:succeeded|failed)\s*\*\*/i.test(line) ||
      /\bexecuted\s+\d+\s+tests?,?\s+with\s+\d+\s+failures?\b/i.test(line) ||
      selectorTerms.some((term) => lower.includes(term.toLowerCase()))
    );
  });
  return trimCommandEvidence(unique(selectedLines).join("\n") || output, 4000);
}

function runtimeFailureFromCommand(result?: AxintRunCommandResult): string | undefined {
  if (!result || result.dryRun || (result.exitCode === 0 && !result.timedOut)) {
    return undefined;
  }
  return trimCommandEvidence(
    [
      `Runtime command failed. Exit: ${result.exitCode ?? result.signal ?? "unknown"}.`,
      result.stderr,
      result.stdout,
    ].join("\n")
  );
}

function trimCommandEvidence(value: string, maxChars = 12000): string {
  const text = value.trim();
  if (text.length <= maxChars) return text;
  const head = text.slice(0, 1600).trimEnd();
  const tail = text.slice(-(maxChars - head.length - 80)).trimStart();
  return `${head}\n\n[... axint trimmed long command evidence ...]\n\n${tail}`;
}

function appendCommandOutput(current: string, next: string, maxChars = 8 * 1024 * 1024) {
  const combined = `${current}${next}`;
  if (combined.length <= maxChars) return combined;
  const tail = combined.slice(-(maxChars - 80));
  return `[... axint trimmed live command output ...]\n${tail}`;
}

function commandLogPath(
  cwd: string,
  runId: string | undefined,
  label: string,
  commandId: string
): string {
  const id = runId ?? "untracked";
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return join(cwd, ".axint", "run", "logs", `${id}-${slug}-${commandId}.log`);
}

function appendToCommandLog(path: string, text: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, text, "utf-8");
  } catch {
    // Logging should never make the build/test proof itself fail.
  }
}

function expectedResultBundlePath(args: string[]): string | undefined {
  const index = args.findIndex((arg) => arg === "-resultBundlePath");
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("-") ? value : undefined;
}

function runResultBundlePath(cwd: string, runId: string, label: string): string {
  const safeLabel = label.replace(/[^A-Za-z0-9_.-]+/g, "-");
  return join(cwd, ".axint", "run", "results", runId, `${safeLabel}.xcresult`);
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process may have exited between timeout and signal delivery.
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeStatus(
  steps: AxintRunStep[],
  workflow: WorkflowCheckReport,
  diagnostics: Diagnostic[],
  cloudChecks: CloudCheckReport[]
): AxintRunReport["status"] {
  if (
    steps.some((step) => step.state === "fail") ||
    workflow.status === "needs_action" ||
    diagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    cloudChecks.some((check) => check.status === "fail")
  ) {
    return "fail";
  }
  if (
    steps.some((step) => step.state === "warn" || step.state === "skipped") ||
    diagnostics.some((diagnostic) => diagnostic.severity === "warning") ||
    cloudChecks.some((check) => check.status === "needs_review")
  ) {
    return "needs_review";
  }
  return "pass";
}

function gateForStatus(
  status: AxintRunReport["status"],
  steps: AxintRunStep[]
): AxintRunReport["gate"] {
  if (status === "pass") {
    return {
      decision: "ready_to_ship",
      reason: "Axint gates, build/test commands, and supplied runtime evidence passed.",
    };
  }
  if (steps.some((step) => step.state === "fail")) {
    return {
      decision: "fix_required",
      reason: "One or more Axint Run steps failed.",
    };
  }
  return {
    decision: "evidence_required",
    reason: "Static checks passed, but runtime or test evidence is incomplete.",
  };
}

function buildNextSteps(
  status: AxintRunReport["status"],
  steps: AxintRunStep[],
  workflow: WorkflowCheckReport,
  cloudChecks: CloudCheckReport[]
): string[] {
  if (status === "pass") {
    return ["Commit the generated Axint Run artifacts with the related code change."];
  }
  const next = new Set<string>();
  for (const item of workflow.required) next.add(item);
  for (const check of cloudChecks) {
    for (const item of check.nextSteps) next.add(item);
  }
  for (const step of steps) {
    if (step.state === "fail" && step.command) {
      next.add(`Fix the failing step, then rerun: ${step.command}`);
    }
  }
  if (next.size === 0) {
    next.add("Add build, test, or runtime evidence and rerun axint run.");
  }
  return [...next];
}

function buildRunRepairPrompt(input: {
  status: AxintRunReport["status"];
  workflow: WorkflowCheckReport;
  validationDiagnostics: Diagnostic[];
  cloudChecks: CloudCheckReport[];
  commands: AxintRunReport["commands"];
}) {
  if (input.status === "pass") {
    const passedCommands = Object.entries(input.commands)
      .filter(([, result]) => result && result.exitCode === 0 && !result.timedOut)
      .map(([label]) => label);
    return [
      "Axint Run passed for this Apple-native project.",
      "Overall status: pass.",
      "",
      "Continue with the next proof, commit, or sprint item. Do not rerun Axint unless new code changes or new evidence appears.",
      "",
      "Evidence accepted:",
      input.workflow.status === "ready"
        ? "- Workflow gate is ready."
        : "- Workflow gate has residual notes; inspect the run report before committing.",
      input.validationDiagnostics.length === 0
        ? "- Swift validation is clean."
        : `- Swift validation has ${input.validationDiagnostics.length} non-blocking diagnostic(s).`,
      input.cloudChecks.length > 0
        ? `- Cloud Check reviewed ${input.cloudChecks.length} file${input.cloudChecks.length === 1 ? "" : "s"}.`
        : "- Cloud Check had no source files to review.",
      passedCommands.length > 0
        ? `- Passed command evidence: ${passedCommands.join(", ")}.`
        : "- No executed Xcode command evidence was required for this pass.",
    ].join("\n");
  }

  const lines = [
    "You are repairing an Apple-native project under Axint Run.",
    `Overall status: ${input.status}.`,
    "",
    "Do not continue ordinary coding until the Axint Run failures are addressed.",
    "",
    "Workflow gate:",
    ...input.workflow.required.map((item) => `- REQUIRED: ${item}`),
    ...input.workflow.recommended.map((item) => `- RECOMMENDED: ${item}`),
    "",
    "Swift diagnostics:",
    ...(input.validationDiagnostics.length > 0
      ? input.validationDiagnostics
          .slice(0, 12)
          .map(
            (diagnostic) =>
              `- ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`
          )
      : ["- None."]),
    "",
    "Cloud Check findings:",
    ...(input.cloudChecks.length > 0
      ? input.cloudChecks
          .slice(0, 8)
          .flatMap((check) => [
            `- ${check.fileName}: ${check.status} (${check.gate.decision})`,
            ...check.diagnostics
              .slice(0, 6)
              .map(
                (diagnostic) =>
                  `  - ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`
              ),
          ])
      : ["- None."]),
  ];

  for (const [label, result] of Object.entries(input.commands)) {
    if (!result || result.exitCode === 0) continue;
    lines.push(
      "",
      `${label} command failed:`,
      `- Command: ${[result.command, ...result.args].map(shellQuote).join(" ")}`,
      `- Exit: ${result.exitCode ?? result.signal ?? "unknown"}`,
      result.stderr ? `- stderr: ${result.stderr.slice(0, 4000)}` : "",
      result.stdout ? `- stdout: ${result.stdout.slice(-4000)}` : ""
    );
  }

  lines.push(
    "",
    "After repairing, rerun `axint run` so Axint validates, Cloud Checks, builds, tests, and records the new evidence."
  );
  return lines.filter(Boolean).join("\n");
}

function writeRunArtifacts(report: AxintRunReport) {
  const dir = join(report.cwd, ".axint", "run");
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, "latest.json");
  const markdownPath = join(dir, "latest.md");
  const serializable = {
    ...report,
    artifacts: {
      json: jsonPath,
      markdown: markdownPath,
      projectContextJson: report.artifacts.projectContextJson,
      projectContextMarkdown: report.artifacts.projectContextMarkdown,
    },
  };
  writeFileSync(jsonPath, `${JSON.stringify(serializable, null, 2)}\n`, "utf-8");
  writeFileSync(markdownPath, renderAxintRunReport(serializable), "utf-8");
  return {
    json: jsonPath,
    markdown: markdownPath,
    projectContextJson: report.artifacts.projectContextJson,
    projectContextMarkdown: report.artifacts.projectContextMarkdown,
  };
}

function compactRunReport(
  report: AxintRunReport,
  options: AxintRunRenderOptions
):
  | AxintRunReport
  | (Omit<AxintRunReport, "cloudChecks" | "commands"> & {
      cloudChecks: Array<
        Omit<CloudCheckReport, "swiftCode"> & {
          sourceRedaction?: {
            swiftCode: "omitted_from_axint_run_json";
            reason: string;
            sourceLines: number;
            outputLines: number;
          };
        }
      >;
      commands: {
        build?: CompactRunCommandResult;
        test?: CompactRunCommandResult;
        runtime?: CompactRunCommandResult;
        buildSettings?: CompactRunCommandResult;
      };
      outputRedaction: {
        mode: "compact";
        reason: string;
        includeSourceFlag: "--include-source";
      };
    }) {
  if (options.includeSource) return report;

  return {
    ...report,
    cloudChecks: report.cloudChecks.map(compactCloudCheckForRun),
    commands: compactRunCommands(report.commands),
    outputRedaction: {
      mode: "compact" as const,
      reason:
        "Rendered axint.run JSON omits full Swift source and long command output by default so agents see verdict, evidence, diagnostics, artifact paths, and next steps first.",
      includeSourceFlag: "--include-source" as const,
    },
  };
}

type CompactRunCommandResult = Omit<AxintRunCommandResult, "stdout" | "stderr"> & {
  stdoutTail?: string;
  stderrTail?: string;
  outputRedaction?: {
    stdout?: "trimmed_from_axint_run_json";
    stderr?: "trimmed_from_axint_run_json";
    reason: string;
  };
};

function compactRunCommands(commands: AxintRunReport["commands"]): {
  build?: CompactRunCommandResult;
  test?: CompactRunCommandResult;
  runtime?: CompactRunCommandResult;
  buildSettings?: CompactRunCommandResult;
} {
  return {
    build: compactRunCommand(commands.build),
    test: compactRunCommand(commands.test),
    runtime: compactRunCommand(commands.runtime),
    buildSettings: compactRunCommand(commands.buildSettings),
  };
}

function compactRunCommand(
  result?: AxintRunCommandResult
): CompactRunCommandResult | undefined {
  if (!result) return undefined;
  const { stdout, stderr, ...rest } = result;
  const compact: CompactRunCommandResult = { ...rest };
  if (stdout) compact.stdoutTail = tailText(stdout, 1200);
  if (stderr) compact.stderrTail = tailText(stderr, 1200);
  if (stdout || stderr) {
    compact.outputRedaction = {
      ...(stdout ? { stdout: "trimmed_from_axint_run_json" as const } : {}),
      ...(stderr ? { stderr: "trimmed_from_axint_run_json" as const } : {}),
      reason:
        "Full command output is available in Axint artifacts or the terminal. Compact JSON keeps long agent conversations readable.",
    };
  }
  return compact;
}

function compactCloudCheckForRun(report: CloudCheckReport): Omit<
  CloudCheckReport,
  "swiftCode"
> & {
  sourceRedaction?: {
    swiftCode: "omitted_from_axint_run_json";
    reason: string;
    sourceLines: number;
    outputLines: number;
  };
} {
  const { swiftCode, ...rest } = report;
  return {
    ...rest,
    ...(swiftCode
      ? {
          sourceRedaction: {
            swiftCode: "omitted_from_axint_run_json" as const,
            reason:
              "Full Swift source is omitted from axint.run JSON by default. Use --include-source only when an agent explicitly needs inline source.",
            sourceLines: report.sourceLines,
            outputLines: report.outputLines,
          },
        }
      : {}),
  };
}

function tailText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `[... ${value.length - maxChars} chars trimmed ...]\n${value.slice(-maxChars)}`;
}

function relativeOrAbsolute(cwd: string, path: string) {
  return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function stateLabel(state: AxintRunStepState) {
  if (state === "pass") return "PASS";
  if (state === "warn") return "WARN";
  if (state === "fail") return "FAIL";
  return "SKIP";
}
