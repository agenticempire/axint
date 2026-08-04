import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { runCloudCheck } from "../cloud/check.js";
import type { Diagnostic } from "../core/types.js";
import { proveAxintProject } from "../proof/prove.js";
import { runAxintRepair } from "../repair/project-repair.js";
import {
  AXINT_A2A_RESULT_SCHEMA,
  type AxintA2AExecutionResult,
  type AxintA2ARequestInput,
  type AxintA2AResult,
  type AxintA2ARunner,
  type AxintA2AVerdict,
  type ParsedAxintA2ARequest,
} from "./types.js";

export interface AxintA2ARunnerOptions {
  stateDirectory: string;
}

export class AxintA2ACancelledError extends Error {
  constructor() {
    super("The A2A task was canceled.");
    this.name = "AxintA2ACancelledError";
  }
}

export function createAxintA2ARunner(options: AxintA2ARunnerOptions): AxintA2ARunner {
  return async ({ request, signal }) => {
    throwIfAborted(signal);
    let execution: AxintA2AExecutionResult;
    switch (request.skill) {
      case "check_apple_code":
        execution = runCheck(request);
        break;
      case "diagnose_apple_failure":
      case "plan_apple_repair":
        execution = runRepair(request);
        break;
      case "prove_apple_project":
        execution = await runProof(request, signal, options.stateDirectory);
        break;
    }
    throwIfAborted(signal);
    return sanitizeExecution(execution, request.projectDirectory);
  };
}

function runCheck(request: ParsedAxintA2ARequest): AxintA2AExecutionResult {
  const input = request.input;
  const report = runCloudCheck({
    source: input.source,
    sourcePath: input.sourcePath,
    fileName:
      input.fileName ?? (input.sourcePath ? basename(input.sourcePath) : undefined),
    platform: input.platform,
    xcodeBuildLog: input.xcodeBuildLog,
    testFailure: input.testFailure,
    runtimeFailure: input.runtimeFailure,
    expectedBehavior: input.expectedBehavior,
    actualBehavior: input.actualBehavior,
    typecheck: true,
    typecheckProjectRoot: request.projectDirectory,
  });
  const result = resultEnvelope(request, report.status, checkSummary(report.status), {
    id: report.id,
    status: report.status,
    label: report.label,
    confidence: report.confidence,
    gate: report.gate,
    compilerVersion: report.compilerVersion,
    language: report.language,
    surface: report.surface,
    fileName: report.fileName,
    counts: {
      errors: report.errors,
      warnings: report.warnings,
      information: report.infos,
    },
    diagnostics: report.diagnostics.slice(0, 100).map(compactDiagnostic),
    checks: report.checks,
    coverage: report.coverage,
    typecheck: report.typecheck,
  });
  return { result, markdown: renderResultMarkdown(result) };
}

function runRepair(request: ParsedAxintA2ARequest): AxintA2AExecutionResult {
  const input = request.input;
  const issue =
    input.issue ??
    input.testFailure ??
    input.runtimeFailure ??
    input.xcodeBuildLog ??
    "Apple project failure requires diagnosis.";
  const report = runAxintRepair({
    cwd: request.projectDirectory,
    issue,
    source: input.source,
    sourcePath: input.sourcePath,
    fileName: input.fileName,
    platform: input.platform,
    expectedBehavior: input.expectedBehavior,
    actualBehavior: input.actualBehavior,
    xcodeBuildLog: input.xcodeBuildLog,
    testFailure: input.testFailure,
    runtimeFailure: input.runtimeFailure,
    changedFiles: input.modifiedFiles,
    writeReport: false,
    writeFeedback: false,
  });
  const verdict: AxintA2AVerdict =
    report.status === "fix_required" ? "fail" : "needs_review";
  const summary =
    request.skill === "diagnose_apple_failure"
      ? `${report.hypotheses.length} ranked repair hypotheses; confidence ${report.confidence.level}.`
      : `${report.proofPlan.length} proof steps prepared; no source changes were made.`;
  const result = resultEnvelope(request, verdict, summary, {
    id: report.id,
    status: report.status,
    priority: report.priority,
    issueClass: report.issueClass,
    confidence: report.confidence,
    projectShape: {
      swiftFiles: report.projectContext.swiftFiles,
      swiftUIFiles: report.projectContext.swiftUIFiles,
      appIntentFiles: report.projectContext.appIntentFiles,
      inputCapableFiles: report.projectContext.inputCapableFiles,
      interactionRiskFiles: report.projectContext.interactionRiskFiles,
    },
    hypotheses: report.hypotheses.map((hypothesis) => ({
      title: hypothesis.title,
      confidence: hypothesis.confidence,
      detail: hypothesis.detail,
      evidence: hypothesis.evidence,
      inspect: hypothesis.inspect,
      suggestedPatch: hypothesis.suggestedPatch,
    })),
    filesToInspect: report.filesToInspect,
    evidenceToCollect: report.evidenceToCollect,
    proofPlan: report.proofPlan,
  });
  return { result, markdown: renderResultMarkdown(result) };
}

async function runProof(
  request: ParsedAxintA2ARequest,
  signal: AbortSignal,
  stateDirectory: string
): Promise<AxintA2AExecutionResult> {
  const input = request.input;
  const artifactDirectory = resolve(stateDirectory, "artifacts", randomUUID());
  mkdirSync(artifactDirectory, { recursive: true, mode: 0o700 });
  const report = await proveAxintProject({
    cwd: request.projectDirectory,
    version: packageVersion(),
    scheme: input.scheme,
    workspace: input.workspace,
    project: input.project,
    destination: input.destination,
    configuration: input.configuration,
    testPlan: input.testPlan,
    onlyTesting: input.onlyTesting,
    modifiedFiles: input.modifiedFiles,
    platform: proofPlatform(input.platform),
    skipBuild: input.skipBuild,
    skipTests: input.skipTests,
    runtime: input.runtime,
    timeoutSeconds: input.timeoutSeconds,
    fix: false,
    outputDir: artifactDirectory,
    signal,
  });
  const result = resultEnvelope(
    request,
    report.status,
    `Proof ${report.status}; gate decision ${report.gate.decision}.`,
    {
      status: report.status,
      gate: report.gate,
      testDiscovery: report.testDiscovery,
      repairs: report.repairs,
      receipt: report.receipt,
      steps: report.run.steps.map((step) => ({
        name: step.name,
        state: step.state,
        detail: step.detail,
        durationMs: step.durationMs,
      })),
      failureIntelligence: report.run.failureIntelligence,
    }
  );
  return { result, markdown: renderResultMarkdown(result) };
}

function resultEnvelope(
  request: ParsedAxintA2ARequest,
  verdict: AxintA2AVerdict,
  summary: string,
  data: Record<string, unknown>
): AxintA2AResult {
  return {
    schema: AXINT_A2A_RESULT_SCHEMA,
    skill: request.skill,
    verdict,
    summary,
    createdAt: new Date().toISOString(),
    data,
    privacy: {
      sourceIncluded: false,
      absolutePathsIncluded: false,
      rawLogsIncluded: false,
    },
  };
}

function compactDiagnostic(diagnostic: Diagnostic): Record<string, unknown> {
  return compactObject({
    id: diagnostic.id,
    code: diagnostic.code,
    severity: diagnostic.severity,
    originalSeverity: diagnostic.originalSeverity,
    confidence: diagnostic.confidence,
    status: diagnostic.status,
    blocking: diagnostic.blocking,
    evidenceClass: diagnostic.evidenceClass,
    message: diagnostic.message,
    file: diagnostic.file ? basename(diagnostic.file) : undefined,
    line: diagnostic.line,
    column: diagnostic.column,
    evidence: diagnostic.evidence?.map((item) => ({
      source: item.source,
      relation: item.relation,
      summary: item.summary,
    })),
  });
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function sanitizeExecution(
  execution: AxintA2AExecutionResult,
  projectDirectory: string
): AxintA2AExecutionResult {
  return sanitizeValue(execution, projectDirectory) as AxintA2AExecutionResult;
}

function sanitizeValue(value: unknown, projectDirectory: string): unknown {
  if (typeof value === "string") return sanitizeString(value, projectDirectory);
  if (Array.isArray(value))
    return value.map((item) => sanitizeValue(item, projectDirectory));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeValue(item, projectDirectory),
      ])
    );
  }
  return value;
}

function sanitizeString(value: string, projectDirectory: string): string {
  let sanitized = value
    .split(projectDirectory)
    .join("<project>")
    .split(homedir())
    .join("<home>");
  sanitized = sanitized.replace(
    /(^|[\s("'`])\/(?:private|tmp|var|Users|home|Volumes)\/[\w@%+.,:=\-/]+/g,
    (_match, prefix: string) => `${prefix}<local-path>`
  );
  return sanitized;
}

function renderResultMarkdown(result: AxintA2AResult): string {
  const lines = [
    `# ${skillTitle(result.skill)}`,
    "",
    `**Verdict:** ${result.verdict}`,
    "",
    result.summary,
    "",
    "## Result",
    "",
    "```json",
    JSON.stringify(result.data, null, 2),
    "```",
    "",
    "Source, raw logs, and absolute local paths are excluded from this artifact.",
  ];
  return `${lines.join("\n")}\n`;
}

function skillTitle(skill: ParsedAxintA2ARequest["skill"]): string {
  switch (skill) {
    case "check_apple_code":
      return "Apple Code Check";
    case "diagnose_apple_failure":
      return "Apple Failure Diagnosis";
    case "prove_apple_project":
      return "Apple Project Proof";
    case "plan_apple_repair":
      return "Apple Repair Plan";
  }
}

function checkSummary(status: AxintA2AVerdict): string {
  if (status === "pass")
    return "No blocking findings were detected in the supplied code.";
  if (status === "fail") return "Blocking findings require repair before proof can pass.";
  return "Advisory findings or missing runtime evidence require review.";
}

function proofPlatform(
  platform: AxintA2ARequestInput["platform"]
): "iOS" | "macOS" | "watchOS" | "visionOS" | "all" | undefined {
  return platform;
}

function packageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as { version?: string };
    return packageJson.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AxintA2ACancelledError();
}

export function projectRelativePath(projectDirectory: string, path: string): string {
  if (!isAbsolute(path)) return path;
  const result = relative(projectDirectory, path);
  return result && !result.startsWith("..") ? result : basename(path);
}
