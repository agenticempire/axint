import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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

export type AxintRunFormat = "markdown" | "json" | "prompt";
export type AxintRunPlatform = "macOS" | "iOS" | "watchOS" | "visionOS" | "all";
export type AxintRunStepState = "pass" | "warn" | "fail" | "skipped";
export type AxintRunKind = "local" | "byo-runner";

export interface AxintRunInput {
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
  dryRun?: boolean;
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
  const cwd = resolve(input.cwd ?? process.cwd());
  const platform = input.platform ?? inferPlatform(input.destination);
  const projectName = input.projectName ?? inferProjectName(cwd);
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

  const workflow = runWorkflowCheck({
    cwd,
    stage: "pre-build",
    sessionStarted: true,
    sessionToken: session.session.token,
    readAgentInstructions: true,
    readDocsContext: true,
    readRehydrationContext: true,
    ranStatus: true,
    ranSuggest: true,
    ranSwiftValidate: swiftFiles.length > 0,
    ranCloudCheck: cloudChecks.length > 0,
    modifiedFiles: swiftFiles.map((file) => relativeOrAbsolute(cwd, file)),
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
    commands.build = runCommand("xcodebuild", buildArgs, {
      cwd,
      timeoutSeconds: input.timeoutSeconds ?? 600,
      dryRun: input.dryRun,
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
    const testArgs = buildXcodeArgs(plan, "test");
    commands.test = runCommand("xcodebuild", testArgs, {
      cwd,
      timeoutSeconds: input.timeoutSeconds ?? 900,
      dryRun: input.dryRun,
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
    const runtime = runMacRuntimeProbe(cwd, plan, input);
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

  const xcodeEvidence = buildXcodeEvidence(commands);
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
          expectedBehavior: input.expectedBehavior,
          actualBehavior: input.actualBehavior,
          projectContext: projectContext.index,
        })
      )
    );
    updateCloudCheckStep(steps, cloudChecks, {
      refreshedWithEvidence: true,
    });
  }

  const status = summarizeStatus(steps, workflow, validationDiagnostics, cloudChecks);
  const report: AxintRunReport = {
    id: `axrun_${randomUUID()}`,
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

  return report;
}

export function renderAxintRunReport(
  report: AxintRunReport,
  format: AxintRunFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
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

function buildXcodeArgs(plan: XcodePlan, action: "build" | "test"): string[] {
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

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeoutSeconds: number;
    dryRun?: boolean;
  }
): AxintRunCommandResult {
  const started = Date.now();
  if (options.dryRun) {
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
      dryRun: true,
    };
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf-8",
    timeout: options.timeoutSeconds * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    command,
    args,
    cwd: options.cwd,
    exitCode: result.status,
    signal: result.signal,
    timedOut: Boolean(result.error && result.error.message.includes("ETIMEDOUT")),
    stdout: result.stdout ?? "",
    stderr:
      result.stderr ??
      (result.error ? `${result.error.name}: ${result.error.message}` : ""),
    durationMs: Date.now() - started,
  };
}

function runMacRuntimeProbe(
  cwd: string,
  plan: XcodePlan,
  input: AxintRunInput
): {
  buildSettings?: AxintRunCommandResult;
  launch?: AxintRunCommandResult;
  detail: string;
} {
  const settings = runCommand(
    "xcodebuild",
    [...buildXcodeArgs(plan, "build").slice(0, -1), "-showBuildSettings", "-json"],
    {
      cwd,
      timeoutSeconds: 90,
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
  const launch = runRuntimeLaunchProbe(cwd, appPath, input.runtimeTimeoutSeconds ?? 8);
  return {
    buildSettings: settings,
    launch,
    detail: `Launched ${appPath}.`,
  };
}

function runRuntimeLaunchProbe(
  cwd: string,
  appPath: string,
  waitSeconds: number
): AxintRunCommandResult {
  const started = Date.now();
  const appName = basename(appPath, ".app");
  const openResult = runCommand("open", ["-n", appPath], {
    cwd,
    timeoutSeconds: 15,
  });
  if (openResult.exitCode !== 0) return openResult;

  const boundedWait = String(Math.min(Math.max(Math.round(waitSeconds), 1), 60));
  spawnSync("sleep", [boundedWait], {
    cwd,
    encoding: "utf-8",
    timeout: (Number(boundedWait) + 2) * 1000,
  });
  const processCheck = runCommand("pgrep", ["-x", appName], {
    cwd,
    timeoutSeconds: 5,
  });
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
    state: result.exitCode === 0 && !result.timedOut ? "pass" : "fail",
    detail: result.dryRun
      ? "Dry run planned the command without executing it."
      : result.timedOut
        ? `Command timed out after ${Math.round(result.durationMs / 1000)}s.`
        : result.exitCode === 0
          ? "Command completed successfully."
          : `Command exited with ${result.exitCode ?? result.signal ?? "unknown"}.`,
    command: printable,
    durationMs: result.durationMs,
  };
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

function buildXcodeEvidence(commands: AxintRunReport["commands"]): string | undefined {
  const chunks = [
    commandEvidence("Xcode build", commands.build),
    commandEvidence("Xcode test", commands.test),
    commandEvidence("Runtime launch", commands.runtime),
  ].filter(Boolean);
  return chunks.length > 0 ? chunks.join("\n\n") : undefined;
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
  const output = trimCommandEvidence([result.stdout, result.stderr].join("\n"));
  return output ? `${header}\n${output}` : header;
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
