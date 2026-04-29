import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  runCloudCheck,
  type CloudCheckInput,
  type CloudCheckReport,
} from "../cloud/check.js";
import {
  buildAgentToolProfile,
  renderAgentToolProfile,
  type AxintAgentProfileName,
  type AxintAgentToolProfile,
} from "../project/agent-profile.js";
import {
  analyzeAppleRepairTask,
  formatAppleRepairRead,
  type AppleRepairIntelligence,
} from "./intelligence.js";
import {
  readProjectContextIndex,
  writeProjectContextIndex,
  type ProjectContextFileSummary,
  type ProjectContextIndex,
} from "../project/context-index.js";

export type AxintRepairFormat = "markdown" | "json" | "prompt";
export type AxintRepairStatus = "fix_required" | "needs_context" | "ready_to_prove";
export type AxintRepairPriority = "p0" | "p1" | "p2" | "p3";

export interface AxintRepairInput {
  cwd?: string;
  issue: string;
  source?: string;
  sourcePath?: string;
  fileName?: string;
  platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
  agent?: AxintAgentProfileName;
  expectedBehavior?: string;
  actualBehavior?: string;
  xcodeBuildLog?: string;
  testFailure?: string;
  runtimeFailure?: string;
  changedFiles?: string[];
  projectName?: string;
  projectContextPath?: string;
  writeReport?: boolean;
  writeFeedback?: boolean;
}

export interface AxintRepairHypothesis {
  title: string;
  confidence: "high" | "medium" | "low";
  detail: string;
  evidence: string[];
  inspect: string[];
  suggestedPatch: string;
}

export interface AxintRepairFileTarget {
  path: string;
  riskScore: number;
  reasons: string[];
  why: string;
}

export interface AxintRepairFeedbackPacket {
  schema: "https://axint.ai/schemas/repair-feedback.v1.json";
  id: string;
  createdAt: string;
  compilerVersion: string;
  privacy: {
    redaction: "source_not_included";
    localPaths: "project_relative_only";
    evidence: "summarized_and_truncated";
    userCanInspectBeforeSending: true;
  };
  classification: {
    issueClass: string;
    priority: AxintRepairPriority;
    status: AxintRepairStatus;
    confidence: "high" | "medium" | "low";
  };
  projectShape: {
    swiftFiles: number;
    swiftUIFiles: number;
    appIntentFiles: number;
    inputCapableFiles: number;
    interactionRiskFiles: number;
    platform?: string;
  };
  signals: string[];
  diagnostics: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
  hypotheses: Array<{
    title: string;
    confidence: string;
  }>;
  files: Array<{
    path: string;
    reasons: string[];
  }>;
  redactedEvidence: string[];
  suggestedAxintOwner: string;
  suggestedProductAction: string;
}

export interface AxintRepairReport {
  id: string;
  status: AxintRepairStatus;
  priority: AxintRepairPriority;
  compilerVersion: string;
  createdAt: string;
  cwd: string;
  issue: string;
  issueClass: string;
  agent: AxintAgentToolProfile;
  confidence: {
    level: "high" | "medium" | "low";
    detail: string;
  };
  repairIntelligence: AppleRepairIntelligence;
  projectContext: {
    path?: string;
    swiftFiles: number;
    swiftUIFiles: number;
    appIntentFiles: number;
    inputCapableFiles: number;
    interactionRiskFiles: number;
    topRiskFiles: AxintRepairFileTarget[];
  };
  cloudCheck?: CloudCheckReport;
  hypotheses: AxintRepairHypothesis[];
  filesToInspect: AxintRepairFileTarget[];
  evidenceToCollect: string[];
  proofPlan: string[];
  commands: string[];
  artifacts: {
    json?: string;
    markdown?: string;
    feedback?: string;
  };
  feedbackPacket: AxintRepairFeedbackPacket;
  repairPrompt: string;
}

export function runAxintRepair(input: AxintRepairInput): AxintRepairReport {
  if (!input.issue?.trim()) {
    throw new Error("axint repair requires an issue description.");
  }

  const cwd = resolve(input.cwd ?? process.cwd());
  const createdAt = new Date().toISOString();
  const projectContext = loadOrCreateProjectContext({
    cwd,
    projectName: input.projectName,
    changedFiles: input.changedFiles,
    projectContextPath: input.projectContextPath,
  });
  const sourcePayload = readRepairSource(input, cwd);
  const issueText = [
    input.issue,
    input.expectedBehavior,
    input.actualBehavior,
    input.xcodeBuildLog,
    input.testFailure,
    input.runtimeFailure,
  ]
    .filter(Boolean)
    .join("\n");
  const repairIntelligence = analyzeAppleRepairTask({
    text: issueText,
    source: sourcePayload?.source,
    fileName: sourcePayload?.fileName ?? input.fileName,
    platform: input.platform,
  });
  const issueClass = repairIntelligence.issueClass;
  const agent = buildAgentToolProfile(input.agent);
  const cloudCheck = sourcePayload
    ? runCloudCheck({
        source: sourcePayload.source,
        sourcePath: sourcePayload.sourcePath,
        fileName: sourcePayload.fileName,
        language: "swift",
        platform: input.platform,
        xcodeBuildLog: input.xcodeBuildLog,
        testFailure: input.testFailure,
        runtimeFailure: input.runtimeFailure,
        expectedBehavior: input.expectedBehavior ?? input.issue,
        actualBehavior: input.actualBehavior,
        projectContext,
      } satisfies CloudCheckInput)
    : undefined;
  const hypotheses = buildRepairHypotheses({
    issueClass,
    issueText,
    projectContext,
    cloudCheck,
    repairIntelligence,
  });
  const filesToInspect = rankRepairFiles({
    issueClass,
    projectContext,
    cloudCheck,
    sourcePath: sourcePayload?.sourcePath,
    fileName: sourcePayload?.fileName,
  });
  const evidenceToCollect = buildEvidencePlan({
    issueClass,
    sourcePayload,
    cloudCheck,
    input,
    repairIntelligence,
  });
  const proofPlan = buildProofPlan({
    input,
    sourcePayload,
    issueClass,
    repairIntelligence,
  });
  const commands = buildRepairCommands({ input, cwd, sourcePayload, projectContext });
  const status = resolveRepairStatus({
    sourcePayload,
    cloudCheck,
    hypotheses,
    filesToInspect,
  });
  const confidence = buildRepairConfidence({
    sourcePayload,
    cloudCheck,
    hypotheses,
    projectContext,
  });
  const priority = inferPriority(issueClass, cloudCheck, issueText);

  const reportBase = [
    cwd,
    input.issue,
    issueClass,
    cloudCheck?.id ?? "no-cloud",
    filesToInspect.map((file) => file.path).join("|"),
  ].join(":");
  const id = `repair-${hashString(reportBase)}`;
  const feedbackPacket = buildRepairFeedbackPacket({
    id,
    createdAt,
    input,
    cwd,
    issueClass,
    priority,
    status,
    confidence: confidence.level,
    projectContext,
    cloudCheck,
    hypotheses,
    filesToInspect,
  });

  const report: AxintRepairReport = {
    id,
    status,
    priority,
    compilerVersion: packageVersion(),
    createdAt,
    cwd,
    issue: input.issue,
    issueClass,
    agent,
    confidence,
    repairIntelligence,
    projectContext: {
      path: projectContextPath(cwd),
      swiftFiles: projectContext.files.swift,
      swiftUIFiles: projectContext.files.swiftUI,
      appIntentFiles: projectContext.files.appIntents,
      inputCapableFiles: projectContext.files.inputCapable,
      interactionRiskFiles: projectContext.files.withInteractionRisk,
      topRiskFiles: projectContext.topInteractionRiskFiles
        .slice(0, 8)
        .map((file) => repairFileTarget(file, "High interaction-risk file.")),
    },
    cloudCheck,
    hypotheses,
    filesToInspect,
    evidenceToCollect,
    proofPlan,
    commands,
    artifacts: {},
    feedbackPacket,
    repairPrompt: "",
  };

  report.repairPrompt = buildRepairPrompt(report);

  if (input.writeReport !== false) {
    writeRepairArtifacts(report);
  }
  if (input.writeFeedback !== false) {
    writeRepairFeedback(report);
  }

  return report;
}

export function renderAxintRepairReport(
  report: AxintRepairReport,
  format: AxintRepairFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(compactRepairReport(report), null, 2);
  if (format === "prompt") return report.repairPrompt;

  const lines = [
    `# Axint Repair: ${report.status}`,
    "",
    `- Issue: ${report.issue}`,
    `- Class: ${report.issueClass}`,
    `- Priority: ${report.priority}`,
    `- Confidence: ${report.confidence.level} — ${report.confidence.detail}`,
    `- Agent lane: ${report.agent.label} (${report.agent.editingMode})`,
    `- Project: ${report.projectContext.swiftFiles} Swift files, ${report.projectContext.swiftUIFiles} SwiftUI files, ${report.projectContext.inputCapableFiles} input-capable files`,
    "",
    "## Senior Repair Read",
    ...formatAppleRepairRead(report.repairIntelligence).map((item) => `- ${item}`),
    "- Inspect:",
    ...report.repairIntelligence.inspectionChecklist
      .slice(0, 6)
      .map((item) => `  - ${item}`),
    "- Avoid:",
    ...report.repairIntelligence.avoid.slice(0, 3).map((item) => `  - ${item}`),
    "",
    "## Likely Root Causes",
    ...(report.hypotheses.length > 0
      ? report.hypotheses.map(
          (hypothesis) =>
            `- ${hypothesis.title}: ${hypothesis.detail} Confidence: ${hypothesis.confidence}. Patch: ${hypothesis.suggestedPatch}`
        )
      : ["- Axint needs more evidence before naming a concrete root cause."]),
    "",
    "## Files To Inspect",
    ...(report.filesToInspect.length > 0
      ? report.filesToInspect.map(
          (file) =>
            `- ${file.path}: score ${file.riskScore} — ${file.why}${file.reasons.length > 0 ? ` (${file.reasons.join(", ")})` : ""}`
        )
      : [
          "- No high-confidence file targets yet. Run `axint project index` with changed files or pass --source.",
        ]),
    "",
    "## Evidence To Collect",
    ...report.evidenceToCollect.map((item) => `- ${item}`),
    "",
    "## Proof Plan",
    ...report.proofPlan.map((item) => `- ${item}`),
    "",
    "## Commands",
    ...report.commands.map((command) => `- \`${command}\``),
    "",
    "## Privacy-Safe Feedback Packet",
    `- Redaction: ${report.feedbackPacket.privacy.redaction}`,
    `- Local paths: ${report.feedbackPacket.privacy.localPaths}`,
    `- User can inspect before sending: ${report.feedbackPacket.privacy.userCanInspectBeforeSending ? "yes" : "no"}`,
  ];

  if (report.cloudCheck) {
    lines.push(
      "",
      "## Cloud Check",
      `- Status: ${report.cloudCheck.status}`,
      `- Gate: ${report.cloudCheck.gate.decision}`,
      `- Diagnostics: ${report.cloudCheck.errors} errors, ${report.cloudCheck.warnings} warnings`,
      ...report.cloudCheck.diagnostics
        .slice(0, 6)
        .map(
          (diagnostic) =>
            `- ${diagnostic.code}: ${diagnostic.message}${diagnostic.suggestion ? ` Suggestion: ${diagnostic.suggestion}` : ""}`
        )
    );
  }

  if (report.artifacts.json || report.artifacts.markdown || report.artifacts.feedback) {
    lines.push("", "## Artifacts");
    if (report.artifacts.json) lines.push(`- JSON: ${report.artifacts.json}`);
    if (report.artifacts.markdown) lines.push(`- Markdown: ${report.artifacts.markdown}`);
    if (report.artifacts.feedback) {
      lines.push(`- Feedback packet: ${report.artifacts.feedback}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderRepairFeedbackPacket(
  packet: AxintRepairFeedbackPacket,
  format: "markdown" | "json" = "json"
): string {
  if (format === "json") return JSON.stringify(packet, null, 2);
  return [
    "# Axint Feedback Packet",
    "",
    `- ID: ${packet.id}`,
    `- Status: ${packet.classification.status}`,
    `- Issue class: ${packet.classification.issueClass}`,
    `- Priority: ${packet.classification.priority}`,
    `- Privacy: ${packet.privacy.redaction}; ${packet.privacy.localPaths}; ${packet.privacy.evidence}`,
    "",
    "## Signals",
    ...(packet.signals.length > 0
      ? packet.signals.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Diagnostics",
    ...(packet.diagnostics.length > 0
      ? packet.diagnostics.map((item) => `- ${item.code}: ${item.message}`)
      : ["- None."]),
    "",
    "## Suggested Product Action",
    packet.suggestedProductAction,
    "",
  ].join("\n");
}

export function readLatestRepairFeedback(
  input: {
    cwd?: string;
  } = {}
): AxintRepairFeedbackPacket | undefined {
  const cwd = resolve(input.cwd ?? process.cwd());
  const path = join(cwd, ".axint/feedback/latest.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AxintRepairFeedbackPacket;
  } catch {
    return undefined;
  }
}

function loadOrCreateProjectContext(input: {
  cwd: string;
  projectName?: string;
  changedFiles?: string[];
  projectContextPath?: string;
}): ProjectContextIndex {
  if (input.projectContextPath) {
    const context = readProjectContextIndex(input.projectContextPath);
    if (context) return context;
  }

  const latest = projectContextPath(input.cwd);
  if (existsSync(latest)) {
    const context = readProjectContextIndex(latest);
    if (context) return context;
  }

  return writeProjectContextIndex({
    targetDir: input.cwd,
    projectName: input.projectName,
    changedFiles: input.changedFiles,
  }).index;
}

function readRepairSource(
  input: AxintRepairInput,
  cwd: string
):
  | {
      source: string;
      sourcePath?: string;
      fileName: string;
    }
  | undefined {
  if (input.source) {
    return {
      source: input.source,
      fileName: input.fileName ?? input.sourcePath ?? "<repair.swift>",
      sourcePath: input.sourcePath,
    };
  }

  if (!input.sourcePath) return undefined;
  const fullPath = input.sourcePath.startsWith("/")
    ? input.sourcePath
    : resolve(cwd, input.sourcePath);
  if (!existsSync(fullPath)) return undefined;

  return {
    source: readFileSync(fullPath, "utf-8"),
    sourcePath: fullPath,
    fileName: relativeOrAbsolute(cwd, fullPath),
  };
}

function buildRepairHypotheses(input: {
  issueClass: string;
  issueText: string;
  projectContext: ProjectContextIndex;
  cloudCheck?: CloudCheckReport;
  repairIntelligence: AppleRepairIntelligence;
}): AxintRepairHypothesis[] {
  const hypotheses: AxintRepairHypothesis[] = [];
  const cloudCodes = new Set(input.cloudCheck?.diagnostics.map((d) => d.code) ?? []);
  const riskFiles = input.projectContext.topInteractionRiskFiles;

  for (const cause of input.repairIntelligence.rootCauses) {
    hypotheses.push({
      title: cause.title,
      confidence: cause.confidence,
      detail: cause.detail,
      evidence: input.repairIntelligence.signals.map((signal) => `Signal: ${signal}`),
      inspect: cause.inspect,
      suggestedPatch: cause.suggestedPatch,
    });
  }

  if (
    input.issueClass === "swiftui-input-interaction" ||
    cloudCodes.has("AXCLOUD-UI-HIT-TEST-BLOCKER")
  ) {
    const overlayFiles = riskFiles.filter((file) => file.hasOverlay || file.hasZIndex);
    const disabledFiles = riskFiles.filter((file) => file.hasDisabledState);
    const gestureFiles = riskFiles.filter((file) => file.hasGestureCapture);

    hypotheses.push({
      title: "Overlay or z-index layer is intercepting the control",
      confidence: overlayFiles.length > 0 ? "high" : "medium",
      detail:
        "SwiftUI inputs often appear visible while an overlay, placeholder, sheet, popover, zIndex layer, or transparent hit area steals the click/focus event.",
      evidence: [
        "Issue describes visible UI that cannot be tapped, typed into, or made foreground.",
        ...overlayFiles
          .slice(0, 3)
          .map((file) => `${file.path} has ${file.reasons.join(", ")}`),
      ],
      inspect: overlayFiles.slice(0, 5).map((file) => file.path),
      suggestedPatch:
        "Move decorative overlays out of the input hit area, add `.allowsHitTesting(false)` to placeholders, or lower/remove the competing zIndex layer.",
    });

    hypotheses.push({
      title: "Parent disabled/loading state is propagating into the input subtree",
      confidence: disabledFiles.length > 0 ? "high" : "low",
      detail:
        "A new feature flag, loading gate, modal state, or permission branch can accidentally disable a composer or button container.",
      evidence: disabledFiles
        .slice(0, 3)
        .map((file) => `${file.path} contains disabled-state risk.`),
      inspect: disabledFiles.slice(0, 5).map((file) => file.path),
      suggestedPatch:
        "Narrow `.disabled(...)` to the exact action that should be blocked and keep unrelated composer/focus controls outside that gated subtree.",
    });

    hypotheses.push({
      title: "Gesture or focus routing is stealing first responder",
      confidence: gestureFiles.length > 0 ? "medium" : "low",
      detail:
        "High-priority gestures, broad tap handlers, FocusState conflicts, or scroll containers can prevent an input from becoming first responder.",
      evidence: gestureFiles
        .slice(0, 3)
        .map((file) => `${file.path} contains gesture/focus risk.`),
      inspect: gestureFiles.slice(0, 5).map((file) => file.path),
      suggestedPatch:
        "Move gestures to smaller regions, use simultaneous gestures carefully, and assert the intended FocusState after tapping the control.",
    });
  }

  if (input.issueClass === "swiftui-hit-testing") {
    hypotheses.push({
      title: "UI test is hitting a child hidden by foreground/modal/accessibility state",
      confidence: "high",
      detail:
        "macOS UI tests can find an element in the tree while the actual hit point is covered by a sheet, inactive window, scroll state, broad parent identifier, or another foreground element.",
      evidence: [
        "Evidence contains hittable/foreground/background interaction failure language.",
        ...(input.cloudCheck?.diagnostics
          .filter((d) => d.code === "AXCLOUD-UI-HIT-TEST-BLOCKER")
          .map((d) => d.message) ?? []),
      ],
      inspect: input.projectContext.topInteractionRiskFiles
        .slice(0, 6)
        .map((file) => file.path),
      suggestedPatch:
        "Dismiss blocking presentations, activate the app/window before assertions, attach identifiers to actionable children, and scroll/assert the exact Button/Text node.",
    });
  }

  if (input.issueClass === "xcode-build-repair" && input.cloudCheck) {
    for (const diagnostic of input.cloudCheck.diagnostics.slice(0, 4)) {
      hypotheses.push({
        title: `${diagnostic.code}: ${diagnostic.message}`,
        confidence: diagnostic.severity === "error" ? "high" : "medium",
        detail:
          diagnostic.suggestion ?? "Repair the reported Swift/Xcode build mismatch.",
        evidence: [diagnostic.message],
        inspect: diagnostic.file ? [diagnostic.file] : [],
        suggestedPatch:
          diagnostic.suggestion ??
          "Patch the referenced symbol/call site, then rerun Swift validation and the focused Xcode build.",
      });
    }
  }

  if (input.issueClass === "runtime-freeze") {
    hypotheses.push({
      title: "Main-thread or launch-path blocker",
      confidence: "medium",
      detail:
        "Runtime freezes usually come from blocking work in View.body/init/onAppear/.task, App startup, shared stores, or synchronous IO/network waits.",
      evidence: [
        "Issue/evidence describes a freeze, hang, launch timeout, or unresponsive UI.",
      ],
      inspect: input.projectContext.topInteractionRiskFiles
        .filter((file) => file.swiftUI)
        .slice(0, 6)
        .map((file) => file.path),
      suggestedPatch:
        "Move blocking work off the main actor, add cancellation/timeouts, and rerun launch/UI proof.",
    });
  }

  if (hypotheses.length === 0) {
    hypotheses.push({
      title: "Project-aware Apple repair needed",
      confidence: input.projectContext.files.swift > 0 ? "medium" : "low",
      detail:
        "Axint indexed the project and can guide the proof loop, but it needs source, build log, UI-test failure, or runtime evidence to identify a sharper root cause.",
      evidence: [
        `Indexed ${input.projectContext.files.swift} Swift files and ${input.projectContext.files.swiftUI} SwiftUI files.`,
      ],
      inspect: input.projectContext.topInteractionRiskFiles
        .slice(0, 6)
        .map((file) => file.path),
      suggestedPatch:
        "Attach the failing file or the shortest Xcode/UI/runtime failure, then rerun `axint repair`.",
    });
  }

  const seen = new Set<string>();
  return hypotheses
    .filter((hypothesis) => {
      const key = hypothesis.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function rankRepairFiles(input: {
  issueClass: string;
  projectContext: ProjectContextIndex;
  cloudCheck?: CloudCheckReport;
  sourcePath?: string;
  fileName?: string;
}): AxintRepairFileTarget[] {
  const targets: AxintRepairFileTarget[] = [];
  const add = (file: ProjectContextFileSummary | undefined, why: string) => {
    if (!file || targets.some((target) => target.path === file.path)) return;
    targets.push(repairFileTarget(file, why));
  };
  const sourceMatch = findContextFile(
    input.projectContext,
    input.sourcePath ?? input.fileName
  );
  add(sourceMatch, "The file supplied to `axint repair` is the first local anchor.");

  for (const diagnostic of input.cloudCheck?.diagnostics ?? []) {
    add(
      findContextFile(input.projectContext, diagnostic.file),
      `Cloud Check emitted ${diagnostic.code}.`
    );
  }

  const sorted = [...input.projectContext.files.catalog].sort((a, b) => {
    const focusBoost =
      focusScoreForIssue(input.issueClass, b) - focusScoreForIssue(input.issueClass, a);
    return focusBoost || b.riskScore - a.riskScore || a.path.localeCompare(b.path);
  });
  for (const file of sorted.slice(0, 10)) {
    add(file, "Project context ranks this file as relevant to the reported failure.");
  }

  return targets.slice(0, 10);
}

function buildEvidencePlan(input: {
  issueClass: string;
  sourcePayload?: { sourcePath?: string; fileName: string };
  cloudCheck?: CloudCheckReport;
  input: AxintRepairInput;
  repairIntelligence: AppleRepairIntelligence;
}): string[] {
  const evidence: string[] = [];
  for (const item of input.repairIntelligence.inspectionChecklist.slice(0, 3)) {
    evidence.push(`Inspect: ${item}`);
  }
  if (!input.sourcePayload) {
    evidence.push(
      "Pass `--source <Swift file>` for the most suspicious view/store so Axint can run Cloud Check against real code."
    );
  }
  if (!input.input.xcodeBuildLog) {
    evidence.push(
      "Attach the shortest Xcode build/test log or run `axint run` so repair can reconcile static source with proof."
    );
  }
  if (
    input.issueClass.includes("ui") ||
    input.issueClass.includes("swiftui") ||
    input.issueClass === "runtime-freeze"
  ) {
    evidence.push(
      "Run one focused UI test or manual smoke proof for the exact failing interaction."
    );
  }
  if (!input.input.expectedBehavior) {
    evidence.push(
      "State the expected behavior in one sentence so Axint can tell contradiction from intentional absence."
    );
  }
  if (
    !input.input.actualBehavior &&
    !input.input.testFailure &&
    !input.input.runtimeFailure
  ) {
    evidence.push(
      "Add actual behavior, UI-test failure, or runtime failure text from the failing run."
    );
  }
  for (const item of input.cloudCheck?.gate.requiredEvidence ?? []) {
    if (!evidence.includes(item)) evidence.push(item);
  }
  return uniqueStrings(evidence).slice(0, 8);
}

function buildProofPlan(input: {
  input: AxintRepairInput;
  sourcePayload?: { sourcePath?: string; fileName: string };
  issueClass: string;
  repairIntelligence: AppleRepairIntelligence;
}): string[] {
  const source = input.sourcePayload?.fileName ?? "<changed Swift files>";
  const steps = [
    ...input.repairIntelligence.proofPlan.slice(0, 3),
    `Patch the smallest surface around ${source}; do not regenerate unrelated screens.`,
    `Run \`axint validate-swift ${source}\` after the patch.`,
    `Run \`axint cloud check --source ${source}\` with the same expected/actual/test evidence.`,
  ];
  if (input.issueClass.includes("ui") || input.issueClass.includes("swiftui")) {
    steps.push(
      "Run a focused UI test that taps/types/asserts the exact element or proves the intentional absence."
    );
  }
  steps.push(
    "Run `axint run --changed <files> --only-testing <focused selector>` before claiming fixed."
  );
  return steps;
}

function buildRepairCommands(input: {
  input: AxintRepairInput;
  cwd: string;
  sourcePayload?: { sourcePath?: string; fileName: string };
  projectContext: ProjectContextIndex;
}): string[] {
  const dir = quote(input.cwd);
  const source = input.sourcePayload?.fileName;
  const commands = [`axint project index --dir ${dir}`];
  if (source) {
    commands.push(`axint validate-swift ${quote(source)}`);
    commands.push(
      `axint cloud check --source ${quote(source)}${
        input.input.platform ? ` --platform ${input.input.platform}` : ""
      }`
    );
  }
  const container = input.projectContext.xcode.workspace
    ? `--workspace ${quote(input.projectContext.xcode.workspace)}`
    : input.projectContext.xcode.project
      ? `--project ${quote(input.projectContext.xcode.project)}`
      : "";
  const scheme = input.projectContext.xcode.inferredScheme
    ? `--scheme ${quote(input.projectContext.xcode.inferredScheme)}`
    : "";
  commands.push(
    `axint run --dir ${dir} ${container} ${scheme} --changed <files> --only-testing <focused-selector>`.replace(
      /\s+/g,
      " "
    )
  );
  return commands;
}

function buildRepairFeedbackPacket(input: {
  id: string;
  createdAt: string;
  input: AxintRepairInput;
  cwd: string;
  issueClass: string;
  priority: AxintRepairPriority;
  status: AxintRepairStatus;
  confidence: "high" | "medium" | "low";
  projectContext: ProjectContextIndex;
  cloudCheck?: CloudCheckReport;
  hypotheses: AxintRepairHypothesis[];
  filesToInspect: AxintRepairFileTarget[];
}): AxintRepairFeedbackPacket {
  const signals = uniqueStrings([
    input.issueClass,
    ...(input.cloudCheck?.learningSignal?.signals ?? []),
    ...(input.cloudCheck?.diagnostics.map((diagnostic) => diagnostic.code) ?? []),
    ...input.hypotheses.map((hypothesis) => hypothesis.title),
  ]);
  const redactedEvidence = [
    input.input.issue,
    input.input.expectedBehavior,
    input.input.actualBehavior,
    input.input.xcodeBuildLog,
    input.input.testFailure,
    input.input.runtimeFailure,
  ]
    .filter(Boolean)
    .map((value) => redactEvidence(String(value), input.cwd))
    .slice(0, 8);

  return {
    schema: "https://axint.ai/schemas/repair-feedback.v1.json",
    id: `${input.id}-feedback`,
    createdAt: input.createdAt,
    compilerVersion: packageVersion(),
    privacy: {
      redaction: "source_not_included",
      localPaths: "project_relative_only",
      evidence: "summarized_and_truncated",
      userCanInspectBeforeSending: true,
    },
    classification: {
      issueClass: input.issueClass,
      priority: input.priority,
      status: input.status,
      confidence: input.confidence,
    },
    projectShape: {
      swiftFiles: input.projectContext.files.swift,
      swiftUIFiles: input.projectContext.files.swiftUI,
      appIntentFiles: input.projectContext.files.appIntents,
      inputCapableFiles: input.projectContext.files.inputCapable,
      interactionRiskFiles: input.projectContext.files.withInteractionRisk,
      platform: input.input.platform,
    },
    signals,
    diagnostics:
      input.cloudCheck?.diagnostics.slice(0, 10).map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
      })) ?? [],
    hypotheses: input.hypotheses.map((hypothesis) => ({
      title: hypothesis.title,
      confidence: hypothesis.confidence,
    })),
    files: input.filesToInspect.map((file) => ({
      path: file.path,
      reasons: file.reasons,
    })),
    redactedEvidence,
    suggestedAxintOwner: suggestOwner(input.issueClass, input.cloudCheck),
    suggestedProductAction: suggestProductAction(input.issueClass, input.cloudCheck),
  };
}

function buildRepairPrompt(report: AxintRepairReport): string {
  return [
    "You are repairing an Apple-native project with Axint.",
    `Issue: ${report.issue}`,
    `Issue class: ${report.issueClass}`,
    "",
    "Host/tool lane:",
    renderAgentToolProfile(report.agent),
    "",
    ...formatAppleRepairRead(report.repairIntelligence),
    "",
    "Likely root causes:",
    ...report.hypotheses.map(
      (hypothesis) =>
        `- ${hypothesis.title} (${hypothesis.confidence}): ${hypothesis.suggestedPatch}`
    ),
    "",
    "Inspect these files first:",
    ...report.filesToInspect.slice(0, 8).map((file) => `- ${file.path}: ${file.why}`),
    "",
    "Proof plan:",
    ...report.proofPlan.map((step) => `- ${step}`),
    "",
    "Do not claim the bug is fixed until focused build/UI/runtime proof passes.",
  ].join("\n");
}

function writeRepairArtifacts(report: AxintRepairReport): void {
  const dir = resolve(report.cwd, ".axint/repair");
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, "latest.json");
  const markdownPath = join(dir, "latest.md");
  report.artifacts.json = jsonPath;
  report.artifacts.markdown = markdownPath;
  writeFileSync(
    jsonPath,
    `${JSON.stringify(compactRepairReport(report), null, 2)}\n`,
    "utf-8"
  );
  writeFileSync(markdownPath, renderAxintRepairReport(report, "markdown"), "utf-8");
}

function writeRepairFeedback(report: AxintRepairReport): void {
  const dir = resolve(report.cwd, ".axint/feedback");
  mkdirSync(dir, { recursive: true });
  const packetPath = join(dir, `${report.feedbackPacket.id}.json`);
  const latestPath = join(dir, "latest.json");
  report.artifacts.feedback = packetPath;
  writeFileSync(
    packetPath,
    `${JSON.stringify(report.feedbackPacket, null, 2)}\n`,
    "utf-8"
  );
  writeFileSync(
    latestPath,
    `${JSON.stringify(report.feedbackPacket, null, 2)}\n`,
    "utf-8"
  );
}

function compactRepairReport(report: AxintRepairReport): AxintRepairReport {
  return {
    ...report,
    cloudCheck: report.cloudCheck
      ? {
          ...report.cloudCheck,
          swiftCode: undefined,
        }
      : undefined,
  };
}

function resolveRepairStatus(input: {
  sourcePayload?: unknown;
  cloudCheck?: CloudCheckReport;
  hypotheses: AxintRepairHypothesis[];
  filesToInspect: AxintRepairFileTarget[];
}): AxintRepairStatus {
  if (input.cloudCheck?.status === "fail") return "fix_required";
  if (!input.sourcePayload && input.filesToInspect.length === 0) return "needs_context";
  if (input.hypotheses.some((hypothesis) => hypothesis.confidence === "high")) {
    return "fix_required";
  }
  return "ready_to_prove";
}

function buildRepairConfidence(input: {
  sourcePayload?: unknown;
  cloudCheck?: CloudCheckReport;
  hypotheses: AxintRepairHypothesis[];
  projectContext: ProjectContextIndex;
}): AxintRepairReport["confidence"] {
  if (
    input.cloudCheck &&
    input.hypotheses.some((hypothesis) => hypothesis.confidence === "high")
  ) {
    return {
      level: "high",
      detail:
        "Axint has source/evidence plus a project context map, so the repair plan is specific enough to act on.",
    };
  }
  if (input.sourcePayload || input.projectContext.files.swift > 0) {
    return {
      level: "medium",
      detail:
        "Axint has project structure, but sharper Xcode/UI/runtime evidence would improve root-cause confidence.",
    };
  }
  return {
    level: "low",
    detail:
      "Axint needs a source file, project index, build log, UI-test failure, or runtime evidence to get specific.",
  };
}

function inferPriority(
  issueClass: string,
  cloudCheck: CloudCheckReport | undefined,
  evidence: string
): AxintRepairPriority {
  if (cloudCheck?.errors && cloudCheck.errors > 0) return "p1";
  if (
    /\b(crash|data loss|security|privacy|freeze|hang|cannot type|can't type|cannot tap|can't tap)\b/i.test(
      evidence
    )
  ) {
    return "p1";
  }
  if (issueClass.includes("swiftui") || issueClass.includes("ui-test")) return "p2";
  return "p3";
}

function focusScoreForIssue(issueClass: string, file: ProjectContextFileSummary): number {
  let score = file.riskScore;
  if (issueClass === "swiftui-input-interaction") {
    if (file.hasInputControls) score += 8;
    if (file.hasOverlay) score += 5;
    if (file.hasDisabledState) score += 5;
    if (file.hasGestureCapture) score += 4;
    if (file.hasFocusState) score += 4;
  }
  if (issueClass === "swiftui-hit-testing" || issueClass === "ui-test-accessibility") {
    if (file.hasListOrScroll) score += 4;
    if (file.hasZIndex) score += 4;
    if (file.hasModalPresentation) score += 4;
    if (file.hasAccessibilityQueries) score += 5;
    if (file.hasContentShape) score += 2;
  }
  return score;
}

function repairFileTarget(
  file: ProjectContextFileSummary,
  why: string
): AxintRepairFileTarget {
  return {
    path: file.path,
    riskScore: file.riskScore,
    reasons: file.reasons,
    why,
  };
}

function findContextFile(
  projectContext: ProjectContextIndex,
  path?: string
): ProjectContextFileSummary | undefined {
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, "/");
  return (
    projectContext.files.catalog.find((file) => file.path === normalized) ??
    projectContext.files.catalog.find((file) => normalized.endsWith(file.path)) ??
    projectContext.files.catalog.find((file) => basename(file.path) === basename(path))
  );
}

function suggestOwner(
  issueClass: string,
  cloudCheck: CloudCheckReport | undefined
): string {
  if (
    cloudCheck?.diagnostics.some((diagnostic) => diagnostic.code.startsWith("AXCLOUD"))
  ) {
    return "cloud-repair-classifier";
  }
  if (issueClass.includes("swiftui") || issueClass.includes("ui-test")) {
    return "project-repair-intelligence";
  }
  if (issueClass.includes("build")) return "swift-validator";
  return "repair-workflow";
}

function suggestProductAction(
  issueClass: string,
  cloudCheck: CloudCheckReport | undefined
): string {
  if (!cloudCheck) {
    return "Improve project-only repair ranking and ask for the minimum source/evidence needed.";
  }
  if (issueClass === "swiftui-input-interaction") {
    return "Add or refine SwiftUI input-interaction classifiers and focused proof suggestions.";
  }
  if (issueClass === "swiftui-hit-testing") {
    return "Add more macOS UI-test hit-testing phrases and foreground/window-state repair recipes.";
  }
  return "Cluster repeated feedback packets into a new diagnostic or repair-pack rule.";
}

function redactEvidence(value: string, cwd: string): string {
  return value
    .replaceAll(cwd, "$PROJECT")
    .replace(new RegExp(process.env.HOME ?? "__NO_HOME__", "g"), "~")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[A-Fa-f0-9]{24,}\b/g, "[hex]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function projectContextPath(cwd: string): string {
  return join(cwd, ".axint/context/latest.json");
}

function relativeOrAbsolute(root: string, value: string): string {
  const rel = relative(root, value).replace(/\\/g, "/");
  return rel && !rel.startsWith("..") ? rel : value;
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function packageVersion(): string {
  try {
    const packagePath = resolve(
      dirname(new URL(import.meta.url).pathname),
      "../../package.json"
    );
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
