import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { runCloudCheck, type CloudCheckReport } from "../cloud/check.js";
import {
  validateSwiftSource,
  type SwiftValidationResult,
} from "../core/swift-validator.js";
import {
  axintSessionPath,
  readAxintSessionByToken,
  readCurrentAxintSession,
  startAxintSession,
  type AxintSessionRecord,
} from "./session.js";

export type XcodeGuardStage =
  | "context-recovery"
  | "planning"
  | "before-write"
  | "after-write"
  | "pre-build"
  | "runtime"
  | "finish";

export type XcodeGuardStatus = "ready" | "needs_action";
export type XcodeGuardFormat = "markdown" | "json";

export interface XcodeGuardInput {
  cwd?: string;
  projectName?: string;
  expectedVersion?: string;
  platform?: string;
  stage?: XcodeGuardStage;
  sessionToken?: string;
  modifiedFiles?: string[];
  notes?: string;
  lastAxintTool?: string;
  lastAxintResult?: string;
  maxMinutesSinceAxint?: number;
  autoStartSession?: boolean;
  writeReport?: boolean;
}

export interface XcodeGuardEvidence {
  kind: "session" | "run" | "guard" | "explicit-tool";
  at: string;
  source: string;
  detail: string;
}

export interface XcodeGuardReport {
  schema: "https://axint.ai/schemas/xcode-guard.v1.json";
  id: string;
  status: XcodeGuardStatus;
  stage: XcodeGuardStage;
  cwd: string;
  projectName: string;
  createdAt: string;
  maxMinutesSinceAxint: number;
  session?: {
    token: string;
    path: string;
    startedAt: string;
    autoStarted: boolean;
  };
  latestEvidence?: XcodeGuardEvidence & {
    ageMinutes: number;
  };
  required: string[];
  recommended: string[];
  checked: string[];
  nextTool: string;
  proofFiles: {
    json?: string;
    markdown?: string;
  };
  recoveryPrompt: string;
}

export interface XcodeWriteInput {
  cwd?: string;
  path: string;
  content: string;
  projectName?: string;
  expectedVersion?: string;
  platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
  sessionToken?: string;
  createDirs?: boolean;
  validateSwift?: boolean;
  cloudCheck?: boolean;
  notes?: string;
  format?: XcodeGuardFormat;
}

export interface XcodeWriteReport {
  schema: "https://axint.ai/schemas/xcode-write.v1.json";
  id: string;
  status: "pass" | "needs_action" | "fail";
  cwd: string;
  path: string;
  relativePath: string;
  bytesWritten: number;
  createdAt: string;
  swiftValidation?: SwiftValidationResult;
  cloudCheck?: CloudCheckReport;
  guard: XcodeGuardReport;
  required: string[];
  recommended: string[];
  checked: string[];
  repairPrompt: string;
}

interface PreviousGuardReport {
  createdAt?: string;
  stage?: XcodeGuardStage;
  status?: XcodeGuardStatus;
}

interface PreviousRunReport {
  createdAt?: string;
  status?: string;
  gate?: {
    decision?: string;
  };
}

interface LatestRunProof {
  path: string;
  createdAt: string;
  status: string;
  decision: string;
  ageMinutes: number;
}

const REQUIRED_PROJECT_FILES = [
  ".axint/AXINT_REHYDRATE.md",
  ".axint/AXINT_MEMORY.md",
  ".axint/AXINT_DOCS_CONTEXT.md",
  ".axint/project.json",
  "AGENTS.md",
  "CLAUDE.md",
];

export function runXcodeGuard(input: XcodeGuardInput = {}): XcodeGuardReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const projectName = input.projectName ?? basename(cwd) ?? "AppleApp";
  const stage = input.stage ?? "context-recovery";
  const maxMinutesSinceAxint = input.maxMinutesSinceAxint ?? 10;
  const createdAt = new Date();
  const required: string[] = [];
  const recommended: string[] = [];
  const checked: string[] = [];
  const currentSession = readCurrentAxintSession(cwd);
  const tokenScopedSession =
    input.sessionToken && currentSession?.token !== input.sessionToken
      ? readAxintSessionByToken(cwd, input.sessionToken)
      : undefined;
  let session = tokenScopedSession ?? currentSession;
  let autoStarted = false;

  if (!session && input.autoStartSession !== false) {
    const started = startAxintSession({
      targetDir: cwd,
      projectName,
      expectedVersion: input.expectedVersion,
      platform: input.platform,
      agent: "xcode",
    });
    session = started.session;
    autoStarted = true;
    checked.push("axint.session.start was run automatically for guarded Xcode mode.");
  }

  if (!session) {
    required.push(
      "No active Axint session was found. Call axint.session.start before planning, editing, building, or debugging."
    );
  } else if (input.sessionToken && input.sessionToken !== session.token) {
    required.push(
      "The supplied sessionToken does not match any active Axint session for this project. Re-run axint.session.start if the token expired."
    );
  } else {
    checked.push(
      tokenScopedSession
        ? "Active Axint session is present in token-scoped session history for this Xcode project."
        : "Active Axint session is present for this Xcode project."
    );
  }

  const missingFiles = REQUIRED_PROJECT_FILES.filter(
    (file) => !existsSync(resolve(cwd, file))
  );
  if (missingFiles.length > 0) {
    required.push(
      `Project Axint memory is incomplete: ${missingFiles.join(", ")}. Run axint project init --dir "${cwd}" --force or axint xcode setup --guarded --project "${cwd}".`
    );
  } else {
    checked.push("Project Axint memory files are present.");
  }

  const latestEvidence = latestAxintEvidence({
    cwd,
    session,
    lastAxintTool: input.lastAxintTool,
    lastAxintResult: input.lastAxintResult,
  });
  const latestEvidenceWithAge = latestEvidence
    ? {
        ...latestEvidence,
        ageMinutes: minutesBetween(new Date(latestEvidence.at), createdAt),
      }
    : undefined;
  const hasFreshEvidence = Boolean(
    latestEvidenceWithAge && latestEvidenceWithAge.ageMinutes <= maxMinutesSinceAxint
  );
  const latestRunProof = readLatestRunProof(cwd, createdAt);
  const hasFreshReadyRunProof = Boolean(
    latestRunProof &&
    latestRunProof.ageMinutes <= maxMinutesSinceAxint &&
    latestRunProof.status === "pass" &&
    latestRunProof.decision === "ready_to_ship"
  );
  const hasRecoveredContextState = Boolean(
    session && missingFiles.length === 0 && hasFreshEvidence
  );
  const hasPrecommitWorkflowProof = hasPassingWorkflowPrecommitProof(
    input.lastAxintTool,
    input.lastAxintResult
  );

  if (!latestEvidenceWithAge) {
    required.push(
      "No recent Axint evidence was found. Call axint.xcode.guard, axint.workflow.check, axint.suggest, axint.feature, axint.cloud.check, or axint.run before continuing."
    );
  } else if (latestEvidenceWithAge.ageMinutes > maxMinutesSinceAxint) {
    required.push(
      `Latest Axint evidence is ${latestEvidenceWithAge.ageMinutes.toFixed(1)} minutes old. Refresh the guard before continuing.`
    );
  } else {
    checked.push(
      `Latest Axint evidence is fresh: ${latestEvidenceWithAge.kind} from ${latestEvidenceWithAge.source}.`
    );
  }

  if (looksLikeDrift(input.notes)) {
    if (hasRecoveredContextState) {
      checked.push(
        "Notes mention drift or compaction, but active session, project memory, and fresh Axint evidence are present."
      );
    } else {
      required.push(
        "The notes mention drift, compaction, or Axint being forgotten. Run context recovery before continuing."
      );
    }
  }

  const modifiedSwift = (input.modifiedFiles ?? []).filter((file) =>
    file.endsWith(".swift")
  );
  if (modifiedSwift.length > 0) {
    checked.push(`Swift files in scope: ${modifiedSwift.join(", ")}.`);
    if (stage === "pre-build" || stage === "runtime" || stage === "finish") {
      recommended.push(
        "Use axint.run for Swift build/test/runtime proof so validation, Cloud Check, xcodebuild, and artifacts stay tied together."
      );
    }
  }

  if (stage === "planning" && input.lastAxintTool !== "axint.suggest") {
    recommended.push(
      "For feature planning, call axint.suggest with the current app description before choosing the implementation path."
    );
  }

  if (stage === "before-write") {
    const lastTool = input.lastAxintTool ?? "";
    if (
      ![
        "axint.feature",
        "axint.scaffold",
        "axint.compile",
        "axint.schema.compile",
      ].includes(lastTool)
    ) {
      recommended.push(
        "Before writing a new Apple-native surface, use axint.feature, axint.scaffold, axint.compile, or axint.schema.compile, or record a concrete bypass reason."
      );
    }
  }

  if (stage === "pre-build" || stage === "runtime" || stage === "finish") {
    if (hasFreshReadyRunProof && latestRunProof) {
      checked.push(
        `Build/test/runtime stage accepted fresh ready_to_ship axint.run proof from ${latestRunProof.path}.`
      );
    } else if (latestRunProof && latestRunProof.ageMinutes <= maxMinutesSinceAxint) {
      const detail = `${latestRunProof.status} · ${latestRunProof.decision}`;
      if (
        latestRunProof.status === "fail" ||
        latestRunProof.decision === "fix_required"
      ) {
        required.push(
          `Latest axint.run proof is ${detail}. Repair the failing gate and rerun axint.run before finishing.`
        );
      } else {
        required.push(
          `Latest axint.run proof is ${detail}. Add the missing build/test/runtime evidence or rerun axint.run before finishing.`
        );
      }
    } else if (stage === "finish" && hasFreshEvidence && hasPrecommitWorkflowProof) {
      checked.push(
        "Finish stage accepted fresh axint.workflow.check pre-commit proof with Swift validation, Cloud Check, Xcode build, and Xcode test evidence."
      );
    } else {
      required.push(
        "This stage needs build/test/runtime proof. Call axint.run instead of relying on a remembered checklist."
      );
    }
  }

  const status: XcodeGuardStatus = required.length === 0 ? "ready" : "needs_action";
  const report: XcodeGuardReport = {
    schema: "https://axint.ai/schemas/xcode-guard.v1.json",
    id: `xguard_${createdAt.getTime().toString(36)}`,
    status,
    stage,
    cwd,
    projectName,
    createdAt: createdAt.toISOString(),
    maxMinutesSinceAxint,
    session: session
      ? {
          token: session.token,
          path: axintSessionPath(cwd, tokenScopedSession ? session.token : undefined),
          startedAt: session.startedAt,
          autoStarted,
        }
      : undefined,
    latestEvidence: latestEvidenceWithAge,
    required: dedupe(required),
    recommended: dedupe(recommended),
    checked: dedupe(checked),
    nextTool: chooseNextTool(stage, required),
    proofFiles: {},
    recoveryPrompt: buildGuardRecoveryPrompt(cwd, projectName),
  };

  if (input.writeReport !== false) {
    writeGuardReport(cwd, report);
  }

  return report;
}

export function renderXcodeGuardReport(
  report: XcodeGuardReport,
  format: XcodeGuardFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  const lines = [
    `# Axint Xcode Guard: ${report.status}`,
    "",
    `- Project: ${report.projectName}`,
    `- Stage: ${report.stage}`,
    `- Created: ${report.createdAt}`,
    `- Max age: ${report.maxMinutesSinceAxint} minutes`,
    report.latestEvidence
      ? `- Latest Axint evidence: ${report.latestEvidence.kind} · ${report.latestEvidence.ageMinutes.toFixed(1)}m old · ${report.latestEvidence.source}`
      : "- Latest Axint evidence: none",
    report.session
      ? `- Session: ${report.session.token}${report.session.autoStarted ? " (auto-started)" : ""}`
      : "- Session: missing",
    "",
    "## Required",
    ...(report.required.length > 0
      ? report.required.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Recommended",
    ...(report.recommended.length > 0
      ? report.recommended.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Checked",
    ...(report.checked.length > 0
      ? report.checked.map((item) => `- ${item}`)
      : ["- No Axint guard evidence was supplied."]),
    "",
    "## Next Tool",
    `- ${formatNextTool(report.nextTool)}`,
  ];

  if (report.proofFiles.json || report.proofFiles.markdown) {
    lines.push(
      "",
      "## Proof Files",
      ...(report.proofFiles.json ? [`- JSON: ${report.proofFiles.json}`] : []),
      ...(report.proofFiles.markdown ? [`- Markdown: ${report.proofFiles.markdown}`] : [])
    );
  }

  lines.push("", "## Recovery Prompt", "```text", report.recoveryPrompt, "```");
  return lines.join("\n");
}

export function runXcodeWrite(input: XcodeWriteInput): XcodeWriteReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const targetPath = resolve(cwd, input.path);
  const createdAt = new Date().toISOString();
  const required: string[] = [];
  const recommended: string[] = [];
  const checked: string[] = [];

  if (!isInside(cwd, targetPath)) {
    const guard = runXcodeGuard({
      cwd,
      projectName: input.projectName,
      expectedVersion: input.expectedVersion,
      platform: input.platform,
      stage: "before-write",
      sessionToken: input.sessionToken,
      notes: input.notes,
      lastAxintTool: "axint.xcode.write",
      lastAxintResult: "blocked path outside project",
      autoStartSession: true,
      writeReport: true,
    });
    return {
      schema: "https://axint.ai/schemas/xcode-write.v1.json",
      id: `xwrite_${Date.now().toString(36)}`,
      status: "fail",
      cwd,
      path: targetPath,
      relativePath: relative(cwd, targetPath),
      bytesWritten: 0,
      createdAt,
      guard,
      required: [`Refusing to write outside the project root: ${targetPath}`],
      recommended,
      checked,
      repairPrompt:
        "Pick a target path inside the Xcode project root and call axint.xcode.write again.",
    };
  }

  if (input.createDirs !== false) {
    mkdirSync(dirname(targetPath), { recursive: true });
  }
  writeFileSync(targetPath, input.content, "utf-8");
  checked.push(`Wrote ${targetPath}.`);

  const shouldValidateSwift =
    input.validateSwift !== false && targetPath.endsWith(".swift");
  const swiftValidation = shouldValidateSwift
    ? validateSwiftSource(input.content, targetPath)
    : undefined;
  if (swiftValidation) {
    checked.push("Ran axint.swift.validate on the written Swift source.");
    const errors = swiftValidation.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error"
    );
    if (errors.length > 0) {
      required.push(
        `Swift validation found ${errors.length} blocking issue${errors.length === 1 ? "" : "s"}.`
      );
    }
  }

  const cloudCheck =
    input.cloudCheck !== false && targetPath.endsWith(".swift")
      ? runCloudCheck({
          source: input.content,
          fileName: targetPath,
          language: "swift",
          platform: input.platform,
        })
      : undefined;
  if (cloudCheck) {
    checked.push("Ran axint.cloud.check on the written Swift source.");
    if (cloudCheck.status === "fail") {
      required.push("Cloud Check found blocking Apple-facing issues.");
    } else if (cloudCheck.status === "needs_review") {
      recommended.push(
        "Cloud Check needs runtime, build, or review evidence before this can be claimed fixed."
      );
    }
  }

  const guard = runXcodeGuard({
    cwd,
    projectName: input.projectName,
    expectedVersion: input.expectedVersion,
    platform: input.platform,
    stage: "after-write",
    sessionToken: input.sessionToken,
    modifiedFiles: [relative(cwd, targetPath)],
    notes: input.notes,
    lastAxintTool: "axint.xcode.write",
    lastAxintResult:
      required.length > 0
        ? "write completed with required follow-up"
        : "write completed with Axint validation",
    autoStartSession: true,
    writeReport: true,
  });
  if (guard.status === "needs_action") {
    required.push(...guard.required);
  }

  const status =
    required.length > 0
      ? swiftValidation?.diagnostics.some((d) => d.severity === "error") ||
        cloudCheck?.status === "fail"
        ? "fail"
        : "needs_action"
      : "pass";

  return {
    schema: "https://axint.ai/schemas/xcode-write.v1.json",
    id: `xwrite_${Date.now().toString(36)}`,
    status,
    cwd,
    path: targetPath,
    relativePath: relative(cwd, targetPath),
    bytesWritten: Buffer.byteLength(input.content),
    createdAt,
    swiftValidation,
    cloudCheck,
    guard,
    required: dedupe(required),
    recommended: dedupe(recommended),
    checked: dedupe(checked),
    repairPrompt: buildWriteRepairPrompt({
      path: targetPath,
      status,
      required,
      cloudCheck,
    }),
  };
}

export function renderXcodeWriteReport(
  report: XcodeWriteReport,
  format: XcodeGuardFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  const lines = [
    `# Axint Xcode Write: ${report.status}`,
    "",
    `- File: ${report.relativePath}`,
    `- Bytes: ${report.bytesWritten}`,
    `- Guard: ${report.guard.status}`,
    report.swiftValidation
      ? `- Swift diagnostics: ${report.swiftValidation.diagnostics.length}`
      : "- Swift diagnostics: not applicable",
    report.cloudCheck
      ? `- Cloud Check: ${report.cloudCheck.status}`
      : "- Cloud Check: not applicable",
    "",
    "## Required",
    ...(report.required.length > 0
      ? report.required.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Recommended",
    ...(report.recommended.length > 0
      ? report.recommended.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Checked",
    ...(report.checked.length > 0
      ? report.checked.map((item) => `- ${item}`)
      : ["- No Axint write checks were recorded."]),
    "",
    "## Repair Prompt",
    "```text",
    report.repairPrompt,
    "```",
  ];

  if (report.cloudCheck?.repairPrompt) {
    lines.push("", "## Cloud Check Repair Prompt", "```text");
    lines.push(report.cloudCheck.repairPrompt, "```");
  }

  return lines.join("\n");
}

function latestAxintEvidence(input: {
  cwd: string;
  session?: AxintSessionRecord;
  lastAxintTool?: string;
  lastAxintResult?: string;
}): XcodeGuardEvidence | undefined {
  const candidates: XcodeGuardEvidence[] = [];
  const explicitTool = input.lastAxintTool?.trim();

  if (explicitTool?.startsWith("axint.")) {
    candidates.push({
      kind: explicitTool === "axint.run" ? "run" : "explicit-tool",
      at: new Date().toISOString(),
      source: explicitTool,
      detail:
        input.lastAxintResult ?? "Agent supplied an explicit Axint tool checkpoint.",
    });
  }

  if (input.session) {
    candidates.push({
      kind: "session",
      at: input.session.startedAt,
      source: ".axint/session/current.json",
      detail: `Axint session for ${input.session.projectName}.`,
    });
  }

  const run = readJson<PreviousRunReport>(resolve(input.cwd, ".axint/run/latest.json"));
  if (run?.createdAt) {
    candidates.push({
      kind: "run",
      at: run.createdAt,
      source: ".axint/run/latest.json",
      detail: `Axint Run status: ${run.status ?? "unknown"} · ${run.gate?.decision ?? "unknown gate"}.`,
    });
  }

  const previousGuard = readJson<PreviousGuardReport>(
    resolve(input.cwd, ".axint/guard/latest.json")
  );
  if (previousGuard?.createdAt) {
    candidates.push({
      kind: "guard",
      at: previousGuard.createdAt,
      source: ".axint/guard/latest.json",
      detail: `Previous guard status: ${previousGuard.status ?? "unknown"} at ${previousGuard.stage ?? "unknown stage"}.`,
    });
  }

  return candidates
    .filter((candidate) => !Number.isNaN(new Date(candidate.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

function readLatestRunProof(cwd: string, now: Date): LatestRunProof | undefined {
  const path = resolve(cwd, ".axint/run/latest.json");
  const run = readJson<PreviousRunReport>(path);
  if (!run?.createdAt) return undefined;
  const createdAt = new Date(run.createdAt);
  if (Number.isNaN(createdAt.getTime())) return undefined;
  return {
    path,
    createdAt: run.createdAt,
    status: run.status ?? "unknown",
    decision: run.gate?.decision ?? "unknown_gate",
    ageMinutes: minutesBetween(createdAt, now),
  };
}

function writeGuardReport(cwd: string, report: XcodeGuardReport): void {
  const dir = resolve(cwd, ".axint/guard");
  mkdirSync(dir, { recursive: true });
  const jsonPath = resolve(dir, "latest.json");
  const markdownPath = resolve(dir, "latest.md");
  report.proofFiles.json = jsonPath;
  report.proofFiles.markdown = markdownPath;
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  writeFileSync(markdownPath, `${renderXcodeGuardReport(report)}\n`, "utf-8");
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

function chooseNextTool(stage: XcodeGuardStage, required: string[]): string {
  const text = required.join(" ").toLowerCase();
  if (text.includes("session.start")) return "axint.session.start";
  if (text.includes("project init") || text.includes("setup --guarded")) {
    return "axint project init or axint xcode setup --guarded";
  }
  if (text.includes("context recovery")) return "axint.session.start";
  if (text.includes("axint.run") || ["pre-build", "runtime", "finish"].includes(stage)) {
    return "axint.run";
  }
  if (stage === "planning") return "axint.suggest";
  if (stage === "before-write") return "axint.feature";
  return "axint.workflow.check";
}

function formatNextTool(nextTool: string): string {
  const cliFallbacks: Record<string, string> = {
    "axint.workflow.check": "axint workflow check",
    "axint.session.start": "axint session start",
    "axint.run": "axint run",
    "axint.suggest": "axint.suggest (MCP) or axint feature with a concrete bypass reason",
    "axint.feature": "axint feature",
  };
  const cli = cliFallbacks[nextTool];
  if (!cli) return nextTool;
  if (cli === nextTool) return nextTool;
  return `${nextTool} · CLI fallback: ${cli}`;
}

function buildWriteRepairPrompt(input: {
  path: string;
  status: XcodeWriteReport["status"];
  required: string[];
  cloudCheck?: CloudCheckReport;
}): string {
  if (input.status === "pass") {
    return `The file ${input.path} was written through axint.xcode.write. Continue with the next Axint checkpoint, and call axint.run before build/test/runtime proof.`;
  }
  return [
    `The file ${input.path} was written through axint.xcode.write, but follow-up is required.`,
    ...input.required.map((item) => `- ${item}`),
    input.cloudCheck?.repairPrompt
      ? "Use the Cloud Check repair prompt below before continuing."
      : "Run axint.swift.validate, axint.cloud.check, or axint.run after repairing.",
  ].join("\n");
}

function buildGuardRecoveryPrompt(cwd: string, projectName: string): string {
  return [
    `We are working in ${projectName}. Do not continue from memory.`,
    `Project path: ${cwd}`,
    "Call axint.xcode.guard with stage=context-recovery.",
    "Then call axint.status and report the running Axint MCP version.",
    "Read .axint/AXINT_REHYDRATE.md, .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, and .axint/project.json.",
    "For build/test/runtime proof, call axint.run so Axint owns the full loop.",
  ].join("\n");
}

function looksLikeDrift(notes: string | undefined): boolean {
  if (!notes) return false;
  return /\b(compact|compaction|summarized|new chat|forgot|forget|drift|stale|not using axint|axint unavailable|long task|long block|default xcode|ordinary xcode)\b/i.test(
    notes
  );
}

function hasPassingWorkflowPrecommitProof(
  lastAxintTool: string | undefined,
  lastAxintResult: string | undefined
): boolean {
  if (lastAxintTool !== "axint.workflow.check" || !lastAxintResult) return false;
  const lower = lastAxintResult.toLowerCase();
  const stagePassed =
    lower.includes("stage: pre-commit") ||
    lower.includes('"stage": "pre-commit"') ||
    lower.includes("stage=pre-commit") ||
    lower.includes("stage pre-commit");
  const statusReady =
    lower.includes("workflow check: ready") ||
    lower.includes('"status": "ready"') ||
    lower.includes("status: ready");
  return (
    stagePassed &&
    statusReady &&
    lower.includes("axint.swift.validate was run") &&
    lower.includes("axint.cloud.check was run") &&
    lower.includes("xcode build evidence passed") &&
    lower.includes("xcode test evidence passed")
  );
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

function isInside(root: string, target: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return target === root || target.startsWith(normalizedRoot);
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}
