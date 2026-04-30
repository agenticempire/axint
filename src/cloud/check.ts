import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAnySource } from "../core/compiler.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import type { CompilerOutput, Diagnostic } from "../core/types.js";
import {
  buildProjectContextHint,
  type ProjectContextIndex,
  type ProjectContextHint,
} from "../project/context-index.js";
import {
  analyzeAppleRepairTask,
  formatAppleRepairRead,
  type AppleRepairIntelligence,
} from "../repair/intelligence.js";

export type CloudCheckFormat = "markdown" | "json" | "prompt" | "feedback";
export type CloudCheckLanguage = "swift" | "typescript" | "unknown";
export type CloudCheckStatus = "pass" | "needs_review" | "fail";
export type CloudCheckGateDecision =
  | "fix_required"
  | "evidence_required"
  | "ready_for_build"
  | "ready_to_ship";
export type CloudLearningKind =
  | "compiler_gap"
  | "generator_gap"
  | "validator_gap"
  | "swift_api_gap"
  | "platform_gap"
  | "unknown";
export type CloudLearningPriority = "p0" | "p1" | "p2" | "p3";
export type CloudLearningOwner =
  | "compiler"
  | "swift-validator"
  | "schema-compile"
  | "feature-generator"
  | "cloud"
  | "docs";
export type CloudCheckCoverageState = "checked" | "needs_runtime" | "not_applicable";
export type CloudCheckConfidenceLevel = "high" | "medium" | "low";

export interface CloudCheckInput {
  source?: string;
  sourcePath?: string;
  fileName?: string;
  language?: CloudCheckLanguage;
  platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
  expectedVersion?: string;
  localPackageVersion?: string;
  mcpServerVersion?: string;
  cloudRulesetVersion?: string;
  xcodeBuildLog?: string;
  testFailure?: string;
  runtimeFailure?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  projectContextPath?: string;
  projectContext?: ProjectContextIndex;
}

export interface CloudCheckReport {
  id: string;
  status: CloudCheckStatus;
  label: string;
  confidence: {
    level: CloudCheckConfidenceLevel;
    detail: string;
    missingEvidence: string[];
  };
  gate: {
    decision: CloudCheckGateDecision;
    canClaimFixed: boolean;
    reason: string;
    requiredEvidence: string[];
  };
  compilerVersion: string;
  versionInfo: {
    compilerVersion: string;
    localPackageVersion?: string;
    mcpServerVersion?: string;
    cloudRulesetVersion: string;
    expectedProjectVersion?: string;
    consistent: boolean;
    notes: string[];
  };
  language: CloudCheckLanguage;
  surface: string;
  fileName: string;
  createdAt: string;
  sourceLines: number;
  outputLines: number;
  outputPath?: string;
  swiftCode?: string;
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  infos: number;
  checks: Array<{
    label: string;
    state: "pass" | "warn" | "fail";
    detail: string;
  }>;
  coverage: Array<{
    label: string;
    state: CloudCheckCoverageState;
    detail: string;
  }>;
  evidence: {
    provided: string[];
    summary: string[];
  };
  projectContext?: {
    path?: string;
    summary: string[];
    relatedFiles: Array<{
      path: string;
      reasons: string[];
    }>;
    changedFiles: string[];
    currentFile?: string;
  };
  repairIntelligence?: AppleRepairIntelligence;
  repairPlan: Array<{
    title: string;
    detail: string;
    command?: string;
  }>;
  nextSteps: string[];
  repairPrompt: string;
  learningSignal?: CloudLearningSignal;
}

export interface CloudLearningSignal {
  id: string;
  reportId: string;
  kind: CloudLearningKind;
  priority: CloudLearningPriority;
  fingerprint: string;
  title: string;
  summary: string;
  compilerVersion: string;
  surface: string;
  language: CloudCheckLanguage;
  fileName: string;
  status: CloudCheckStatus;
  diagnosticCodes: string[];
  diagnosticSummary: string;
  signals: string[];
  sourceShape: {
    sourceLines: number;
    outputLines: number;
  };
  suggestedOwner: CloudLearningOwner;
  suggestedAction: string;
  redaction: "source_not_included";
  createdAt: string;
}

const DEFAULT_CLOUD_PROMPT_RENDER_CHARS = 1_600;
const DEFAULT_CLOUD_JSON_PROMPT_CHARS = 3_000;
const DEFAULT_CLOUD_EVIDENCE_SUMMARY_CHARS = 800;

export function runCloudCheck(input: CloudCheckInput): CloudCheckReport {
  const { source, fileName } = readCloudCheckSource(input);
  const compilerVersion = packageVersion();
  const versionInfo = buildCloudCheckVersionInfo(input, compilerVersion);
  const language = input.language ?? inferLanguage(fileName, source);
  const createdAt = new Date().toISOString();
  let surface = language === "swift" ? inferSwiftSurface(source) : "unknown";
  let swiftCode: string | undefined;
  let outputPath: string | undefined;
  let diagnostics: Diagnostic[];
  let generated = false;
  const nonAppleArtifact = language === "unknown" && isNonAppleArtifact(fileName, source);

  if (nonAppleArtifact) {
    surface = inferNonAppleArtifactSurface(fileName, source);
    diagnostics = [
      {
        code: "AXCLOUD-NON-APPLE-ARTIFACT",
        severity: "info",
        file: fileName,
        message:
          "Cloud Check received a document or web artifact instead of Swift, Axint TypeScript, or Apple-native source.",
        suggestion:
          "Use browser/render/link verification for this artifact, then run Cloud Check on the Swift or Axint source that implements the Apple-facing behavior.",
      },
    ];
  } else if (language === "swift") {
    diagnostics = validateSwiftSource(source, fileName).diagnostics;
    swiftCode = source;
  } else {
    const result = compileAnySource(source, fileName);
    surface = result.surface;
    diagnostics = result.diagnostics;
    const output = result.output as CompilerOutput | undefined;
    if (output?.swiftCode) {
      swiftCode = output.swiftCode;
      outputPath = output.outputPath;
      generated = true;
      diagnostics = [
        ...diagnostics,
        ...validateSwiftSource(output.swiftCode, output.outputPath ?? fileName)
          .diagnostics,
      ];
    }
  }

  const evidence = collectCloudEvidence(input);
  const projectContext = resolveCloudProjectContext({ input, fileName, surface });
  const repairIntelligence = analyzeAppleRepairTask({
    text: [
      input.xcodeBuildLog,
      input.testFailure,
      input.runtimeFailure,
      input.expectedBehavior,
      input.actualBehavior,
    ]
      .filter(Boolean)
      .join("\n"),
    source: swiftCode ?? source,
    fileName,
    platform: input.platform,
  });
  diagnostics = [
    ...diagnostics,
    ...inferEvidenceDiagnostics({
      input,
      source,
      swiftCode,
      fileName,
      surface,
      evidence,
    }),
  ];

  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const infos = diagnostics.filter((d) => d.severity === "info").length;
  const runtimeCoverageRequired = requiresRuntimeCoverage(language, surface, swiftCode);
  const runtimeEvidenceProvided =
    hasRuntimeEvidence(evidence) && !hasPendingRuntimeProofSignal(input);
  const status: CloudCheckStatus = nonAppleArtifact
    ? "needs_review"
    : errors > 0
      ? "fail"
      : warnings > 0 || (runtimeCoverageRequired && !runtimeEvidenceProvided)
        ? "needs_review"
        : "pass";
  const outputLines = swiftCode ? swiftCode.split("\n").length : 0;

  const checks = (
    nonAppleArtifact
      ? [
          {
            label: "Document/web artifact detected",
            state: "warn" as const,
            detail:
              "This input is not Swift or Axint source, so Apple compiler diagnostics are not the right proof surface.",
          },
          {
            label: "Apple-specific findings",
            state: "pass" as const,
            detail:
              "No Apple-native compiler rules were applied. Verify this artifact through browser/render/link evidence instead.",
          },
        ]
      : [
          {
            label: language === "swift" ? "Swift source loaded" : "Source parse",
            state: diagnostics.some((d) => d.code === "AX001")
              ? ("fail" as const)
              : ("pass" as const),
            detail:
              language === "swift"
                ? "Axint loaded Swift source directly for Apple-specific validation."
                : generated
                  ? "The source parsed into Axint IR and generated Swift."
                  : "Axint could not produce Swift from this source.",
          },
          {
            label: language === "swift" ? "Swift validation" : "Swift generation",
            state: swiftCode ? ("pass" as const) : ("fail" as const),
            detail: swiftCode
              ? `${generated ? "Generated" : "Checked"} ${outputLines} line${outputLines === 1 ? "" : "s"} of Swift.`
              : "No Swift output was available for validation.",
          },
          {
            label: "Apple-specific findings",
            state:
              errors > 0
                ? ("fail" as const)
                : warnings > 0
                  ? ("warn" as const)
                  : ("pass" as const),
            detail:
              errors > 0
                ? `${errors} error${errors === 1 ? "" : "s"} must be fixed before this is safe to ship.`
                : warnings > 0
                  ? `${warnings} warning${warnings === 1 ? "" : "s"} need review.`
                  : "No blocking static Apple-facing issues were found.",
          },
          ...(runtimeCoverageRequired
            ? [
                {
                  label: "Runtime and UI coverage",
                  state: runtimeEvidenceProvided ? ("pass" as const) : ("warn" as const),
                  detail: runtimeEvidenceProvided
                    ? "Cloud Check inspected supplied Xcode/test/runtime evidence in addition to static source checks."
                    : "Static Cloud Check does not execute Xcode builds, UI tests, accessibility flows, route transitions, or runtime state. Do not treat this as proof that the app flow works.",
                },
              ]
            : []),
        ]
  ) satisfies CloudCheckReport["checks"];
  if (projectContext) {
    checks.push({
      label: "Project context pack",
      state: "pass",
      detail: projectContext.summary.join(" "),
    });
  }
  const coverage = buildCloudCoverage({
    language,
    surface,
    generated,
    hasSwiftCode: Boolean(swiftCode),
    runtimeCoverageRequired,
    evidenceProvided: evidence.provided.length > 0,
    runtimeEvidenceProvided,
    projectContextLoaded: Boolean(projectContext),
    nonAppleArtifact,
  });
  const confidence = buildCloudConfidence({
    status,
    errors,
    warnings,
    runtimeCoverageRequired,
    evidenceProvided: evidence.provided.length > 0,
    runtimeEvidenceProvided,
    nonAppleArtifact,
  });
  const gate = buildCloudGate({
    status,
    errors,
    warnings,
    runtimeCoverageRequired,
    runtimeEvidenceProvided,
    evidenceProvided: evidence.provided.length > 0,
    nonAppleArtifact,
  });

  const nextSteps = diagnostics
    .filter((d) => d.severity !== "info")
    .slice(0, 4)
    .map((d) => d.suggestion || d.message);
  const repairPlan = buildCloudRepairPlan({
    diagnostics,
    runtimeCoverageRequired,
    runtimeEvidenceProvided,
    fileName,
    projectContext,
    nonAppleArtifact,
    repairIntelligence:
      repairIntelligence.isExistingProductRepair ||
      diagnostics.some((d) => d.severity !== "info")
        ? repairIntelligence
        : undefined,
  });

  if (nextSteps.length === 0) {
    if (nonAppleArtifact) {
      nextSteps.push(
        "Verify this document or web artifact with a browser/render smoke test instead of treating Cloud Check as an Apple compiler verdict."
      );
      nextSteps.push(
        "Run Cloud Check on the Swift or Axint source files that implement the Apple-facing behavior referenced by the artifact."
      );
    } else if (runtimeCoverageRequired) {
      nextSteps.push(
        "Treat this as a static source check only. Run the Xcode build plus the relevant unit/UI tests before claiming the bug is gone."
      );
      nextSteps.push(
        "If Cloud Check is clean but Xcode, UI tests, or runtime behavior fails, capture that as an Axint validator/runtime-coverage gap."
      );
    } else {
      nextSteps.push(
        "Keep the current behavior and rerun Cloud Check after the next generated change."
      );
      nextSteps.push(
        "If this came from an agent, move the generated Swift into Xcode and run the project build."
      );
    }
  }

  const reportBase = [
    fileName,
    source.length,
    swiftCode?.length ?? 0,
    diagnostics.map((d) => `${d.code}:${d.message}`).join("|"),
  ].join(":");

  const report: CloudCheckReport = {
    id: `cloud-${hashString(reportBase)}`,
    status,
    label: labelForStatus(status),
    confidence,
    gate,
    compilerVersion,
    versionInfo,
    language,
    surface,
    fileName,
    createdAt,
    sourceLines: source.split("\n").length,
    outputLines,
    outputPath,
    swiftCode,
    diagnostics,
    errors,
    warnings,
    infos,
    checks,
    coverage,
    evidence,
    projectContext: projectContext
      ? {
          path: projectContext.path,
          summary: projectContext.summary,
          relatedFiles: projectContext.relatedFiles.map((file) => ({
            path: file.path,
            reasons: file.reasons,
          })),
          changedFiles: projectContext.changedFiles,
          currentFile: projectContext.currentFile?.path,
        }
      : undefined,
    repairIntelligence:
      repairIntelligence.isExistingProductRepair ||
      diagnostics.some((d) => d.severity !== "info")
        ? repairIntelligence
        : undefined,
    repairPlan,
    nextSteps,
    repairPrompt: "",
  };

  report.repairPrompt = buildCloudRepairPrompt(report);
  report.learningSignal = buildCloudLearningSignal(report);
  return report;
}

export function renderCloudCheckReport(
  report: CloudCheckReport,
  format: CloudCheckFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(compactCloudCheckReport(report), null, 2);
  if (format === "prompt") return report.repairPrompt;
  if (format === "feedback") {
    return JSON.stringify(
      report.learningSignal ?? {
        status: "pass",
        message: "No compiler feedback signal was generated for a passing Cloud Check.",
      },
      null,
      2
    );
  }

  const lines = [
    `# Axint Cloud Check: ${report.label}`,
    "",
    `- Status: ${report.status}`,
    `- Input: ${report.fileName}`,
    `- Surface: ${report.surface}`,
    `- Language: ${report.language}`,
    `- Compiler: Axint ${report.compilerVersion}`,
    report.versionInfo.consistent
      ? `- Version truth: consistent (${report.versionInfo.cloudRulesetVersion})`
      : `- Version truth: needs attention — ${report.versionInfo.notes.join("; ")}`,
    `- Confidence: ${report.confidence.level} — ${report.confidence.detail}`,
    `- Gate: ${report.gate.decision} — ${report.gate.reason}`,
    `- Diagnostics: ${report.errors} errors, ${report.warnings} warnings, ${report.infos} info`,
    "",
    "## Checks",
    ...report.checks.map((check) => `- ${check.label}: ${check.detail}`),
    "",
    "## Coverage",
    ...report.coverage.map(
      (item) => `- ${item.label}: ${item.state.replace("_", " ")} — ${item.detail}`
    ),
    "",
    "## Evidence",
    ...(report.evidence.provided.length > 0
      ? report.evidence.summary.map((item) => `- ${item}`)
      : ["- No Xcode build, test, runtime, or behavior evidence was supplied."]),
    ...(report.projectContext
      ? [
          "",
          "## Project Context",
          ...report.projectContext.summary.map((item) => `- ${item}`),
          ...(report.projectContext.relatedFiles.length > 0
            ? [
                "- Related files:",
                ...report.projectContext.relatedFiles.map(
                  (file) =>
                    `  - ${file.path}${file.reasons.length > 0 ? ` — ${file.reasons.join(", ")}` : ""}`
                ),
              ]
            : []),
        ]
      : []),
    ...(report.repairIntelligence
      ? [
          "",
          "## Senior Repair Read",
          ...formatAppleRepairRead(report.repairIntelligence).map((item) => `- ${item}`),
          "- Inspect:",
          ...report.repairIntelligence.inspectionChecklist
            .slice(0, 5)
            .map((item) => `  - ${item}`),
          "- Avoid:",
          ...report.repairIntelligence.avoid.slice(0, 3).map((item) => `  - ${item}`),
        ]
      : []),
    "",
    "## Repair Plan",
    ...report.repairPlan.map(
      (step, index) =>
        `- ${index + 1}. ${step.title}: ${step.detail}${step.command ? ` Command: \`${step.command}\`` : ""}`
    ),
    "",
    "## Next Steps",
    ...report.nextSteps.map((step) => `- ${step}`),
  ];

  if (report.confidence.missingEvidence.length > 0) {
    lines.push(
      "",
      "## Missing Evidence",
      ...report.confidence.missingEvidence.map((item) => `- ${item}`)
    );
  }

  lines.push(
    "",
    "## Ship Gate",
    `- Can claim fixed: ${report.gate.canClaimFixed ? "yes" : "no"}`,
    `- Decision: ${report.gate.decision}`,
    `- Reason: ${report.gate.reason}`,
    ...(report.gate.requiredEvidence.length > 0
      ? report.gate.requiredEvidence.map((item) => `- Required evidence: ${item}`)
      : ["- Required evidence: none"])
  );

  if (report.diagnostics.length > 0) {
    lines.push("", "## Findings");
    for (const d of report.diagnostics) {
      lines.push(
        `- ${d.code} ${d.severity}${d.line ? ` line ${d.line}` : ""}: ${d.message}`
      );
      if (d.suggestion) lines.push(`  Fix: ${d.suggestion}`);
    }
  }

  if (report.learningSignal) {
    lines.push(
      "",
      "## Compiler Feedback Signal",
      `- Fingerprint: ${report.learningSignal.fingerprint}`,
      `- Priority: ${report.learningSignal.priority}`,
      `- Owner: ${report.learningSignal.suggestedOwner}`,
      `- Kind: ${report.learningSignal.kind}`,
      `- Suggested action: ${report.learningSignal.suggestedAction}`,
      `- Privacy: ${report.learningSignal.redaction}`
    );
  }

  const compactPrompt = trimMiddle(
    report.repairPrompt,
    positiveEnvInt("AXINT_CLOUD_PROMPT_RENDER_CHARS", DEFAULT_CLOUD_PROMPT_RENDER_CHARS),
    "agent repair prompt"
  );
  lines.push("", "## Agent Repair Prompt", "```text", compactPrompt, "```");
  if (compactPrompt !== report.repairPrompt) {
    lines.push(
      "",
      "_Prompt compacted for agent-token safety. Use `--format prompt` only when you need the full continuation block inline._"
    );
  }
  return lines.join("\n");
}

function readCloudCheckSource(input: CloudCheckInput): {
  source: string;
  fileName: string;
} {
  if (input.source !== undefined) {
    return {
      source: input.source,
      fileName: input.fileName || input.sourcePath || "<cloud-check>",
    };
  }

  if (!input.sourcePath) {
    throw new Error("Cloud Check requires either source or sourcePath.");
  }

  const path = resolve(input.sourcePath);
  if (!existsSync(path)) {
    throw new Error(`Cloud Check source file not found: ${path}`);
  }
  return {
    source: readFileSync(path, "utf-8"),
    fileName: input.fileName || path,
  };
}

function resolveCloudProjectContext(input: {
  input: CloudCheckInput;
  fileName: string;
  surface: string;
}): ProjectContextHint | undefined {
  const focus = looksLikeInputInteractivityFailure(
    normalizeTextForEvidence(
      [
        input.input.runtimeFailure,
        input.input.actualBehavior,
        input.input.testFailure,
        input.input.expectedBehavior,
      ]
        .filter(Boolean)
        .join("\n")
    )
  )
    ? "interactive-input"
    : input.surface === "view" || input.surface === "app"
      ? "runtime"
      : "generic";

  return buildProjectContextHint({
    sourcePath: input.input.sourcePath,
    fileName: input.fileName,
    contextPath: input.input.projectContextPath,
    projectContext: input.input.projectContext,
    focus,
  });
}

function inferLanguage(fileName: string, source: string): CloudCheckLanguage {
  if (/\.swift$/i.test(fileName)) return "swift";
  if (/\.(ts|tsx|mts|cts)$/i.test(fileName)) return "typescript";
  if (
    /\b(import\s+SwiftUI|import\s+AppIntents|:\s*AppIntent\b|:\s*View\b)/.test(source)
  ) {
    return "swift";
  }
  if (
    /\bdefine(Intent|View|Widget|App|LiveActivity|AppEnum|AppShortcut|Extension)\s*\(/.test(
      source
    )
  ) {
    return "typescript";
  }
  return "unknown";
}

function isNonAppleArtifact(fileName: string, source: string): boolean {
  if (/\.(html?|md|mdx|txt|pdf)$/i.test(fileName)) return true;
  if (/\b<!doctype\s+html\b|\b<html[\s>]/i.test(source)) return true;
  if (
    /^\s*#\s+\S+/m.test(source) &&
    !/\bdefine(Intent|View|Widget|App)\s*\(/.test(source)
  ) {
    return true;
  }
  return /\b(sprint|audit|roadmap|north star|north-star|appendix)\b/i.test(fileName);
}

function inferNonAppleArtifactSurface(fileName: string, source: string): string {
  if (/\.(html?|mdx?)$/i.test(fileName) || /\b<html[\s>]/i.test(source)) {
    return "document";
  }
  if (/\b(sprint|roadmap)\b/i.test(fileName)) return "sprint-artifact";
  if (/\b(audit|north star|north-star)\b/i.test(fileName)) return "audit-artifact";
  return "document-artifact";
}

function inferSwiftSurface(source: string): string {
  if (/\bAppIntent\b/.test(source)) return "intent";
  if (/\bWidget\b/.test(source) || /\bTimelineProvider\b/.test(source)) return "widget";
  if (/\bstruct\s+\w+\s*:\s*App\b/.test(source)) return "app";
  if (/\bView\b/.test(source)) return "view";
  return "swift";
}

function requiresRuntimeCoverage(
  language: CloudCheckLanguage,
  surface: string,
  swiftCode?: string
): boolean {
  if (!swiftCode) return false;
  if (!["view", "app"].includes(surface)) return false;
  return (
    language === "swift" ||
    /\b(import\s+SwiftUI|:\s*View\b|:\s*App\b|WindowGroup\s*\{)/.test(swiftCode)
  );
}

function collectCloudEvidence(input: CloudCheckInput): CloudCheckReport["evidence"] {
  const entries: Array<[string, string | undefined]> = [
    ["platform", input.platform],
    ["xcodeBuildLog", input.xcodeBuildLog],
    ["testFailure", input.testFailure],
    ["runtimeFailure", input.runtimeFailure],
    ["expectedBehavior", input.expectedBehavior],
    ["actualBehavior", input.actualBehavior],
  ];
  const provided = entries
    .filter(([, value]) => Boolean(value && String(value).trim()))
    .map(([label]) => label);

  const summary = provided.map((label) => {
    if (label === "platform") return `Platform hint: ${input.platform}`;
    const value = String((input as Record<string, unknown>)[label] ?? "");
    return `${label}: ${summarizeEvidenceValue(label, value)}`;
  });

  return { provided, summary };
}

function hasRuntimeEvidence(evidence: CloudCheckReport["evidence"]): boolean {
  return evidence.provided.some((label) =>
    ["xcodeBuildLog", "testFailure", "runtimeFailure"].includes(label)
  );
}

function hasPendingRuntimeProofSignal(input: CloudCheckInput): boolean {
  const text = normalizeTextForEvidence(
    [input.expectedBehavior, input.actualBehavior, input.xcodeBuildLog, input.testFailure]
      .filter(Boolean)
      .join("\n")
  );
  if (!text) return false;
  return (
    /\b(?:runtime|ui|xcode|focused|test|proof|verification|smoke)\s+(?:is\s+)?(?:pending|will run|will rerun|needs to run|not run yet|still pending)\b/.test(
      text
    ) ||
    /\b(?:will run|will rerun|run next|proof pending|verification pending|xcode proof pending|ui proof pending|runtime proof pending)\b/.test(
      text
    ) ||
    /\bno\s+(?:xcode|runtime|ui|focused test|test)\s+(?:proof|evidence|log|screenshot)\s+(?:attached|provided|yet)\b/.test(
      text
    )
  );
}

function inferEvidenceDiagnostics(input: {
  input: CloudCheckInput;
  source: string;
  swiftCode?: string;
  fileName: string;
  surface: string;
  evidence: CloudCheckReport["evidence"];
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const source = input.swiftCode ?? input.source;
  const evidenceText = normalizeTextForEvidence(
    [
      input.input.xcodeBuildLog,
      input.input.testFailure,
      input.input.runtimeFailure,
      input.input.expectedBehavior,
      input.input.actualBehavior,
    ]
      .filter(Boolean)
      .join("\n")
  );
  const sourceText = normalizeTextForEvidence(source);
  const file = input.fileName;
  const passingXcodeProof = hasPassingXcodeProof(input.input);
  const intentionalAbsenceProof =
    passingXcodeProof &&
    hasIntentionalAbsenceProof(
      input.input.expectedBehavior,
      input.input.actualBehavior,
      input.input.xcodeBuildLog
    );

  if (input.input.platform === "macOS") {
    const iosOnly = findIosOnlySwiftUIUsage(source);
    if (iosOnly) {
      diagnostics.push({
        code: "AXCLOUD-PLATFORM-MACOS",
        severity: "error",
        file,
        line: iosOnly.line,
        message: `${iosOnly.api} is commonly iOS-oriented and should not be emitted for a macOS-targeted SwiftUI surface without an availability guard.`,
        suggestion:
          "Regenerate or edit the view with platform: macOS. Replace iOS-only modifiers with macOS-safe toolbar, focus, command, or form patterns, then rerun Cloud Check and the Xcode build.",
      });
    }
  }

  if (input.input.xcodeBuildLog) {
    diagnostics.push(...diagnosticsFromBuildLog(input.input.xcodeBuildLog, file));
  }

  if (input.input.testFailure) {
    diagnostics.push(
      ...diagnosticsFromTestFailure(input.input.testFailure, source, file)
    );
  }

  if (input.input.runtimeFailure) {
    diagnostics.push(
      ...diagnosticsFromRuntimeFailure(input.input.runtimeFailure, source, file)
    );
  }

  diagnostics.push(
    ...diagnosticsFromInputInteractivityEvidence(
      [input.input.runtimeFailure, input.input.actualBehavior, input.input.testFailure]
        .filter(Boolean)
        .join("\n"),
      source,
      file
    )
  );
  diagnostics.push(
    ...diagnosticsFromStateTransitionHangEvidence(evidenceText, source, file)
  );

  if (
    input.input.expectedBehavior &&
    input.input.actualBehavior &&
    behaviorEvidenceContradictsExpectation(
      input.input.expectedBehavior,
      input.input.actualBehavior
    ) &&
    diagnostics.every(
      (d) =>
        d.code !== "AXCLOUD-XCTEST-AUTOMATION-INFRASTRUCTURE" &&
        d.code !== "AXCLOUD-XCTEST-RUNNER-HANG"
    ) &&
    !(
      passingXcodeProof &&
      (!hasNegativeBehaviorEvidence(input.input.actualBehavior) ||
        intentionalAbsenceProof)
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-BEHAVIOR-MISMATCH",
      severity: "warning",
      file,
      message:
        "The supplied actual behavior appears to contradict or miss the expected behavior, so the static pass is not enough to call this fixed.",
      suggestion:
        "Add or update a focused unit/UI test for the expected behavior. If the behavior is implemented, include clean build/test proof rather than only prose evidence.",
    });
  }

  if (
    input.evidence.provided.length > 0 &&
    diagnostics.length === 0 &&
    !passingXcodeProof &&
    /\b(fail|failed|error|crash|exception|not found|no match|timeout)\b/.test(
      evidenceText
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-EVIDENCE-UNCLASSIFIED",
      severity: "warning",
      file,
      message:
        "Supplied evidence appears to describe a failure, but Cloud Check could not classify it into a specific Apple-facing rule yet.",
      suggestion:
        "Attach the shortest reproducible build log, test failure, or runtime stack trace. Axint should convert repeated unclassified evidence into a validator rule.",
    });
  }

  if (
    input.surface === "view" &&
    evidenceText.includes("accessibility") &&
    sourceText.includes("accessibilityidentifier") &&
    hasNegativeAccessibilityEvidence(evidenceText) &&
    diagnostics.every((d) => d.code !== "AXCLOUD-UI-ACCESSIBILITY-ID")
  ) {
    diagnostics.push({
      code: "AXCLOUD-UI-ACCESSIBILITY-ID",
      severity: "warning",
      file,
      line: findLine(source, "accessibilityIdentifier"),
      message:
        "The source and evidence both mention accessibility identifiers. Verify identifiers are attached to the specific interactive/text elements the UI test queries, not a broad container that can mask child identifiers.",
      suggestion:
        "Move .accessibilityIdentifier to the exact Button, Text, List row, or control being asserted, then rerun the UI test.",
    });
  }

  return dedupeDiagnostics(diagnostics);
}

function compactCloudCheckReport(report: CloudCheckReport): Omit<
  CloudCheckReport,
  "swiftCode"
> & {
  sourceRedaction?: {
    swiftCode: "omitted_from_rendered_json";
    reason: string;
    sourceLines: number;
    outputLines: number;
  };
  outputRedaction: {
    mode: "compact";
    reason: string;
    fullPromptFormat: "--format prompt";
  };
} {
  const { swiftCode, ...rest } = report;
  const promptBudget = positiveEnvInt(
    "AXINT_CLOUD_JSON_PROMPT_CHARS",
    DEFAULT_CLOUD_JSON_PROMPT_CHARS
  );
  return {
    ...rest,
    evidence: {
      ...report.evidence,
      summary: report.evidence.summary.map((item) =>
        trimMiddle(item, DEFAULT_CLOUD_EVIDENCE_SUMMARY_CHARS, "evidence")
      ),
    },
    repairPrompt: trimMiddle(report.repairPrompt, promptBudget, "repair prompt"),
    outputRedaction: {
      mode: "compact" as const,
      reason:
        "Rendered Cloud Check JSON keeps verdict, diagnostics, evidence summary, and next steps compact for agent conversations.",
      fullPromptFormat: "--format prompt" as const,
    },
    ...(swiftCode
      ? {
          sourceRedaction: {
            swiftCode: "omitted_from_rendered_json" as const,
            reason:
              "Rendered JSON omits full Swift source by default. Use sourcePath/artifact files for code review and the repair prompt for agent guidance.",
            sourceLines: report.sourceLines,
            outputLines: report.outputLines,
          },
        }
      : {}),
  };
}

function buildCloudRepairPlan(input: {
  diagnostics: Diagnostic[];
  runtimeCoverageRequired: boolean;
  runtimeEvidenceProvided: boolean;
  fileName: string;
  projectContext?: ProjectContextHint;
  repairIntelligence?: AppleRepairIntelligence;
  nonAppleArtifact?: boolean;
}): CloudCheckReport["repairPlan"] {
  const actionable = input.diagnostics.filter((d) => d.severity !== "info");
  const intelligenceSteps: CloudCheckReport["repairPlan"] = input.repairIntelligence
    ? [
        {
          title: "Senior Apple repair read",
          detail: input.repairIntelligence.summary,
        },
        ...(input.repairIntelligence.rootCauses[0]
          ? [
              {
                title: input.repairIntelligence.rootCauses[0].title,
                detail: input.repairIntelligence.rootCauses[0].suggestedPatch,
              },
            ]
          : []),
      ]
    : [];

  if (input.nonAppleArtifact) {
    return [
      {
        title: "Use the right proof surface",
        detail:
          "This is a document or web artifact, so browser rendering, link checks, screenshots, and console output are the useful proof instead of Swift compiler diagnostics.",
      },
      {
        title: "Check related Apple source only if needed",
        detail:
          "If the artifact describes Swift, App Intents, Xcode, or runtime behavior changes, run Cloud Check against the related Swift or Axint source file, not the HTML/Markdown report.",
      },
    ];
  }

  if (actionable.length === 0) {
    return [
      ...intelligenceSteps,
      {
        title: "Keep source behavior stable",
        detail:
          input.runtimeCoverageRequired && !input.runtimeEvidenceProvided
            ? "Static checks are clean, but the SwiftUI/app flow still needs Xcode build or UI-test evidence."
            : "Static checks and supplied evidence did not surface a blocking Apple-facing issue.",
      },
      {
        title: "Run the next proof step",
        detail:
          input.runtimeCoverageRequired && !input.runtimeEvidenceProvided
            ? "Build and run the relevant unit/UI test before telling the user the bug is gone."
            : "Rerun Cloud Check after the next generated edit.",
        command: `axint cloud check ${input.fileName}`,
      },
    ];
  }

  const steps: CloudCheckReport["repairPlan"] = actionable
    .slice(0, 5)
    .map((diagnostic) => ({
      title: `${diagnostic.code} (${diagnostic.severity})`,
      detail: diagnostic.suggestion || diagnostic.message,
    }));
  steps.unshift(...intelligenceSteps);

  if (input.diagnostics.some((d) => d.code === "AXCLOUD-RUNTIME-FREEZE")) {
    steps.unshift(
      {
        title: "Capture a macOS hang sample",
        detail:
          "While the app is frozen, capture a short sample so Cloud Check can reason from the main-thread stack instead of guessing from static source.",
        command: "sample <AppProcessName> 5 -file /tmp/axint-freeze-sample.txt",
      },
      {
        title: "Inspect the first app-owned main-thread frame",
        detail:
          "Open the sample output, find Thread 0, and look for the first frame from your app module. Rerun Cloud Check with that source file and the sample excerpt.",
      }
    );
  }

  if (input.diagnostics.some((d) => d.code === "AXCLOUD-RUNTIME-STATE-TRANSITION-HANG")) {
    steps.unshift({
      title: "Trim SwiftUI transition work first",
      detail:
        "Remove broad `withAnimation` or `.animation` around filter, sort, and list updates before chasing unrelated fixes. Keep pinned headers stable, move expensive filtering/sorting out of View.body, and prove the repair with the focused UI test that scrolls and switches state.",
    });
  }

  if (input.projectContext?.relatedFiles.length) {
    steps.push({
      title: "Inspect related project files",
      detail: `Project context flagged ${input.projectContext.relatedFiles
        .slice(0, 5)
        .map(
          (file) =>
            `${file.path}${file.reasons.length > 0 ? ` (${file.reasons.slice(0, 2).join(", ")})` : ""}`
        )
        .join(", ")} as nearby context to review before guessing at another fix.`,
    });
  }

  steps.push({
    title: "Re-run Cloud Check",
    detail:
      "Validate the edited file again, then run the Xcode build or failing test that produced the evidence.",
    command: `axint cloud check ${input.fileName}`,
  });

  return steps;
}

function diagnosticsFromBuildLog(buildLog: string, file: string): Diagnostic[] {
  const text = normalizeTextForEvidence(buildLog);
  const diagnostics: Diagnostic[] = [];

  if (/\binvalid redeclaration\b|\balready declared\b|\bduplicate\b/.test(text)) {
    diagnostics.push({
      code: "AXCLOUD-BUILD-REDECLARATION",
      severity: "error",
      file,
      message: "Xcode build evidence reports a duplicate or redeclared symbol.",
      suggestion:
        "Remove the duplicate declaration instead of adding a second fixed declaration. This usually means a generator or fixer inserted beside the original line.",
    });
  }

  if (/\bfailed to terminate\s+[a-z0-9_.-]+:\d+\b/.test(text)) {
    diagnostics.push({
      code: "AXCLOUD-XCTEST-STALE-APP",
      severity: "warning",
      file,
      message:
        "Xcode UI setup could not terminate a stale app process before the test reached the app behavior under review.",
      suggestion:
        "Kill the stale app PID named in the log, clean up stale debugserver/test-runner processes if needed, then rerun the same focused selector before changing product code.",
    });
  }

  if (
    /\btimed out while enabling automation mode\b/.test(text) ||
    /\btest runner failed to initialize for ui testing\b/.test(text) ||
    /\bfailed to initialize\b.{0,80}\bui testing\b/.test(text)
  ) {
    diagnostics.push({
      code: "AXCLOUD-XCTEST-AUTOMATION-INFRASTRUCTURE",
      severity: "error",
      file,
      message:
        "Xcode UI automation failed before the UI test reached the app, so this is runner infrastructure evidence, not an app assertion failure.",
      suggestion:
        "Kill stale app/test-runner processes, retry the same focused UI test once, and report UI proof as blocked by XCTest infrastructure if the automation startup error repeats.",
    });
  }

  if (
    /\bcommand timed out after \d+s\b/.test(text) &&
    /\b(?:focused xcode test proof failed|xcode test failed|test failed|sending sigterm)\b/.test(
      text
    ) &&
    !/\bxct(?:assert|fail|waiter)|failed assertion|test case\b.*\bfailed\b/.test(text)
  ) {
    diagnostics.push({
      code: "AXCLOUD-XCTEST-RUNNER-HANG",
      severity: "error",
      file,
      message:
        "Xcode test evidence timed out before any focused assertion output, which points to runner health rather than a proven app failure.",
      suggestion:
        "Do not write another focused test. Clean up stale hosted app, debugserver, or xcodebuild processes, then rerun the same --only-testing selector or use alternate build/unit proof.",
    });
  }

  if (/\bcannot find\b.*\bin scope\b/.test(text)) {
    diagnostics.push({
      code: "AXCLOUD-BUILD-MISSING-SYMBOL",
      severity: "error",
      file,
      message: "Xcode build evidence reports a missing symbol.",
      suggestion:
        "Add the missing file to the target, import the required framework, or rename the generated reference to match the real project symbol.",
    });
  }

  const missingMember = text.match(
    /\b(?:(?:value\s+of\s+type)|type|value)\s+'([^']+)'\s+has\s+no\s+member\s+'([^']+)'/
  );
  if (missingMember) {
    const resolvedType = missingMember[1] ?? "the resolved type";
    const member = missingMember[2] ?? "member";
    const isTypeErasedSwiftUI =
      resolvedType === "some view" || resolvedType === "some swiftui.view";
    diagnostics.push({
      code: "AXCLOUD-BUILD-MISSING-MEMBER",
      severity: "error",
      file,
      message: `Xcode build evidence reports .${member} on ${resolvedType}, but that member does not exist on the resolved type.`,
      suggestion: isTypeErasedSwiftUI
        ? "A SwiftUI modifier earlier in the chain likely erased the concrete type. Move the project-specific modifier before `.labelStyle`, `.buttonStyle`, `.background`, `.overlay`, or rewrite the modifier as a generic View extension."
        : "Rename the generated enum case, static token, or type member to match the project symbol. If Axint generated it, feed the declaring type or design-token file as context before regenerating.",
    });
  }

  if (
    /\bincorrect argument label\b|\bextraneous argument label\b|\bmissing argument label\b/.test(
      text
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-BUILD-ARGUMENT-LABEL",
      severity: "error",
      file,
      message: "Xcode build evidence reports an incorrect function argument label.",
      suggestion:
        "Update the call site to the callee's real signature. For generated code, include the target method declaration as context before regenerating.",
    });
  }

  if (/\bcannot convert value of type\b|\bcannot assign value of type\b/.test(text)) {
    diagnostics.push({
      code: "AXCLOUD-BUILD-TYPE-MISMATCH",
      severity: "error",
      file,
      message: "Xcode build evidence reports a Swift type mismatch.",
      suggestion:
        "Fix the expression type instead of suppressing the error. Common agent mistakes include mapping a String/Substring into [String], quoting non-string defaults, or returning an array where a scalar is expected.",
    });
  }

  if (/\bdoes not conform to protocol\b|\bnon-conformance\b/.test(text)) {
    diagnostics.push({
      code: "AXCLOUD-BUILD-CONFORMANCE",
      severity: "error",
      file,
      message: "Xcode build evidence reports a protocol conformance failure.",
      suggestion:
        "Check required static properties, body/perform implementations, associated types, and platform-specific protocol requirements.",
    });
  }

  if (
    /\bis unavailable in macos\b|\bonly available in ios\b|\bavailability\b/.test(text)
  ) {
    diagnostics.push({
      code: "AXCLOUD-BUILD-AVAILABILITY",
      severity: "error",
      file,
      message: "Xcode build evidence reports a platform availability problem.",
      suggestion:
        "Pass the correct platform to Axint, replace iOS-only APIs, or wrap platform-specific code in availability guards.",
    });
  }

  return diagnostics;
}

function diagnosticsFromTestFailure(
  testFailure: string,
  source: string,
  file: string
): Diagnostic[] {
  const text = normalizeTextForEvidence(testFailure);
  const diagnostics: Diagnostic[] = [];

  if (/\bfailed to terminate\s+[a-z0-9_.-]+:\d+\b/.test(text)) {
    return [
      {
        code: "AXCLOUD-XCTEST-STALE-APP",
        severity: "warning",
        file,
        message:
          "XCTest setup could not terminate a stale app process, so this evidence is runner-health blocked rather than a product assertion failure.",
        suggestion:
          "Kill the stale app PID named in the log, clean up stale XCTest/debugserver processes if needed, and rerun the same focused selector before changing app code.",
      },
    ];
  }

  if (
    /\bxct(?:assert|fail|waiter)[a-z]*\s+failed\b|\btest case\b.*\bfailed\b|\bfailing test\b|\bis not equal to\b|\bfailed assertion\b/.test(
      text
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-XCTEST-FAILURE",
      severity: "error",
      file,
      message:
        "Supplied XCTest evidence contains an explicit failing assertion, so Cloud Check cannot return a pass.",
      suggestion:
        "Patch the behavior that the failing assertion names, rerun the focused XCTest, and include the passing test log before claiming the repair is fixed.",
    });
  }

  if (
    /\b(no matches|no matching|not found|failed to get matching|element.*not.*exist|should exist|wait.*timed out)\b/.test(
      text
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-UI-TEST-ELEMENT",
      severity: "error",
      file,
      message:
        "UI-test evidence says the expected element was not found, so a clean static source check is not enough.",
      suggestion:
        "Align the UI test query with the rendered element type and identifier. For SwiftUI, prefer asserting the visible Text/Button identifier directly, then rerun the failing UI test.",
    });
  }

  if (
    /\baccessibilityidentifier|accessibility identifier|identifier propagation|overwrote\b/.test(
      text
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-UI-ACCESSIBILITY-ID",
      severity: "error",
      file,
      line: findLine(source, "accessibilityIdentifier"),
      message:
        "UI-test evidence points to an accessibility identifier issue, often caused by putting one identifier on a broad SwiftUI container.",
      suggestion:
        "Remove container-level identifiers that mask children, attach identifiers to the exact queried controls, and rerun the UI smoke test.",
    });
  }

  if (
    /\b(should be hittable|should be tappable|not hittable|not tappable|not foreground|does not allow background interaction|background interaction|failed to synthesize event|hit point|scroll.*hittable)\b/.test(
      text
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-UI-HIT-TEST-BLOCKER",
      severity: "error",
      file,
      message:
        "UI-test evidence says a visible control is not actually hittable or in the foreground after scrolling.",
      suggestion:
        "Treat this as a SwiftUI hit-testing and focus-order bug. Check overlays, sheets, popovers, disabled ancestors, container identifiers, scroll anchors, zIndex, and app activation before claiming the UI is fixed.",
    });
  }

  return diagnostics;
}

function diagnosticsFromRuntimeFailure(
  runtimeFailure: string,
  source: string,
  file: string
): Diagnostic[] {
  const text = normalizeTextForEvidence(runtimeFailure);
  const diagnostics: Diagnostic[] = [];

  if (
    /\b(freeze|freezes|frozen|hang|hangs|hung|unresponsive|beachball|beachballs|spinning|stuck|launch timeout|launch timed out|timed out launching|ui does not respond|doesn't respond|not responding)\b/.test(
      text
    )
  ) {
    diagnostics.push({
      code: "AXCLOUD-RUNTIME-FREEZE",
      severity: "error",
      file,
      line: findLikelyMainThreadBlockerLine(source),
      message:
        "Runtime evidence says the app freezes, hangs, or becomes unresponsive. A static pass cannot clear this without launch/runtime evidence.",
      suggestion:
        "Treat this as a runtime blocker. Capture a sample stack or UI-test launch timeout, inspect app-owned frames on the main thread, and remove synchronous work, infinite loops, or blocking waits from View.body, init, onAppear, .task, App startup, and shared stores.",
    });
  }

  const blocker = findLikelyMainThreadBlocker(source);
  if (blocker) {
    diagnostics.push({
      code: "AXCLOUD-RUNTIME-MAIN-BLOCKER",
      severity: "error",
      file,
      line: blocker.line,
      message: `${blocker.pattern} is a likely main-thread freeze source when it runs during SwiftUI rendering, app launch, or view appearance.`,
      suggestion:
        "Move blocking work off the main actor, make it asynchronous, add cancellation/timeouts, and keep View.body/init/onAppear lightweight. Rerun Cloud Check with runtime evidence and then launch the app again.",
    });
  }

  diagnostics.push(...runtimeHazardDiagnostics(source, file));

  if (
    /\b(crash|fatal|exception|assertion|precondition|mainactor|actor|thread)\b/.test(text)
  ) {
    diagnostics.push({
      code: "AXCLOUD-RUNTIME-FAILURE",
      severity: "error",
      file,
      message: "Runtime evidence reports a crash or actor/thread failure.",
      suggestion:
        "Preserve the failing stack trace, identify the first app-owned frame, and rerun Cloud Check with that source file plus the runtimeFailure text.",
    });
  }

  return dedupeDiagnostics(diagnostics);
}

function diagnosticsFromInputInteractivityEvidence(
  evidenceText: string,
  source: string,
  file: string
): Diagnostic[] {
  const text = normalizeTextForEvidence(evidenceText);
  if (!looksLikeInputInteractivityFailure(text)) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const overlayHazard = findInputOverlayHazard(source);
  const disabledHazard = findDisabledInputHazard(source);
  const gestureHazard = findInputGestureHazard(source);

  if (overlayHazard) {
    diagnostics.push({
      code: "AXCLOUD-UI-HIT-TEST-BLOCKER",
      severity: "error",
      file,
      line: overlayHazard.line,
      message: `${overlayHazard.input} is paired with an overlay that can intercept taps and focus.`,
      suggestion:
        "If the overlay is decorative or placeholder-only, add `.allowsHitTesting(false)` to it. If it is meant to stay interactive, move it so it does not sit on top of the input field.",
    });
  }

  if (disabledHazard) {
    diagnostics.push({
      code: "AXCLOUD-UI-DISABLED-STATE",
      severity: "error",
      file,
      line: disabledHazard.line,
      message: `${disabledHazard.input} sits near .disabled(...), so a new loading, modal, or feature flag may be disabling the compose control.`,
      suggestion:
        "Trace the disabled condition and confirm the new feature did not start evaluating it to true. Keep unrelated loading or gating state off the composer subtree.",
    });
  }

  if (gestureHazard) {
    diagnostics.push({
      code: "AXCLOUD-UI-GESTURE-CAPTURE",
      severity: "warning",
      file,
      line: gestureHazard.line,
      message: `${gestureHazard.input} sits near ${gestureHazard.pattern}, which can steal taps or prevent the field from becoming first responder.`,
      suggestion:
        "Move the gesture to a background container, narrow its hit area, or use a simultaneous gesture strategy that does not sit on top of the text input.",
    });
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      code: "AXCLOUD-UI-INPUT-INTERACTION",
      severity: "error",
      file,
      message:
        "Runtime evidence says a visible input stopped accepting interaction. Common causes are overlay hit-testing, propagated disabled state, or gesture/focus conflicts.",
      suggestion:
        "Diff the input subtree for new `.overlay`, `.disabled`, `.gesture`, `.zIndex`, and focus-state changes. After each edit, rerun a focused tap/type smoke test instead of relying on a clean build alone.",
    });
  }

  return dedupeDiagnostics(diagnostics);
}

function diagnosticsFromStateTransitionHangEvidence(
  evidenceText: string,
  source: string,
  file: string
): Diagnostic[] {
  const text = normalizeTextForEvidence(evidenceText);
  if (!looksLikeStateTransitionMainThreadHang(text, source)) {
    return [];
  }

  return [
    {
      code: "AXCLOUD-RUNTIME-STATE-TRANSITION-HANG",
      severity: "error",
      file,
      line: findLikelyStateTransitionHangLine(source),
      message:
        "Runtime or UI-test evidence says the app main thread became busy after a UI state transition, which often comes from heavy SwiftUI list animations, pinned-header updates, or expensive body recomputation.",
      suggestion:
        "Treat this as a SwiftUI state-transition hang. Remove broad or per-card spring animations from filter/sort/list changes, keep pinned headers outside animated collection updates, move expensive filtering/sorting into a cached model or store, and rerun the focused UI test that scrolls and switches state.",
    },
  ];
}

function looksLikeStateTransitionMainThreadHang(
  evidenceText: string,
  source: string
): boolean {
  if (!evidenceText) return false;

  const mainThreadBusy =
    /\b(?:app|application)?\s*main thread\b.{0,90}\b(?:busy|blocked|stuck|unresponsive|not responding)\b/.test(
      evidenceText
    ) ||
    /\bmain thread was busy\b/.test(evidenceText) ||
    /\bbusy for \d+\s*(?:second|seconds|sec|secs)\b/.test(evidenceText) ||
    /\btimed out waiting for (?:the )?(?:app|application) to idle\b/.test(evidenceText);
  if (!mainThreadBusy) return false;

  const transitionEvidence =
    /\b(?:after|while|when|during)\b.{0,90}\b(?:filter|filters|sort|sorting|switch|switching|select|selection|selected|segment|tab|scroll|scrolling|pinned|header|list|feed|collection|animation|spring|transition|state change|state transition)\b/.test(
      evidenceText
    ) ||
    /\b(?:filter|filters|sort|sorting|switching|selected|selection|pinned header|list update|feed update|collection update|animation|spring|transition)\b.{0,90}\b(?:busy|blocked|hang|hung|freeze|frozen|unresponsive|not responding)\b/.test(
      evidenceText
    );

  return transitionEvidence || sourceHasStateTransitionHangShape(source);
}

function sourceHasStateTransitionHangShape(source: string): boolean {
  const text = normalizeTextForEvidence(source);
  if (!text) return false;

  const hasCollection = /\b(?:list|lazyvstack|lazyhstack|foreach|scrollview|grid)\b/.test(
    text
  );
  const hasStateMutation =
    /\b(?:@state|@observable|@published|withanimation|\.onchange|selected|selection|filter|sort|sorted)\b/.test(
      text
    );
  const hasHeavyTransition =
    /\b(?:withanimation|\.animation|\.transition|spring|bouncy|matchedgeometryeffect|pinnedviews|pinnedviews:|section\s*\(|\.filter\s*\(|\.sorted\s*\()\b/.test(
      text
    );

  return hasCollection && hasStateMutation && hasHeavyTransition;
}

function findLikelyStateTransitionHangLine(source: string): number | undefined {
  const needles = [
    "withAnimation",
    ".animation",
    ".transition",
    ".matchedGeometryEffect",
    "pinnedViews",
    ".onChange",
    ".filter",
    ".sorted",
    "LazyVStack",
    "List",
    "ForEach",
  ];

  for (const needle of needles) {
    const line = findLine(source, needle);
    if (line) return line;
  }

  return undefined;
}

function looksLikeInputInteractivityFailure(text: string): boolean {
  if (!text) return false;
  const subject =
    /\b(comment box|compose box|composer|composer row|reply box|post box|text field|textfield|text editor|texteditor|input field|input|editor)\b/.test(
      text
    ) ||
    /\b(can't tap|cannot tap|can't type|cannot type|won't focus|can't focus|cannot focus)\b/.test(
      text
    );
  const symptom =
    /\b(can't|cannot|won't|doesn't|does not|stopped|stop|no longer|never)\s+(?:tap|click|focus|type|edit|write|enter|respond|work)\b/.test(
      text
    ) ||
    /\b(?:stopped|stop|no longer)\s+accept(?:ing|s)?\s+(?:input|focus|typing|taps?)\b/.test(
      text
    ) ||
    /\b(not interactable|not editable|tap ignored|visible but dead|visible but won't focus|visible but can't type)\b/.test(
      text
    );
  return subject && symptom;
}

type InputHazard = {
  input: string;
  line?: number;
};

function findInputOverlayHazard(source: string): InputHazard | undefined {
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const inputMatch = lines[i]?.match(/\b(TextField|TextEditor|SecureField)\s*\(/);
    if (!inputMatch) continue;

    const windowStart = Math.max(0, i - 4);
    const windowEnd = Math.min(lines.length, i + 18);
    const windowText = lines.slice(windowStart, windowEnd).join("\n");
    if (!/\.overlay\s*(?:\(|\{)/.test(windowText)) continue;
    if (/\.allowsHitTesting\s*\(\s*false\s*\)/.test(windowText)) continue;

    const overlayLineOffset = lines
      .slice(windowStart, windowEnd)
      .findIndex((line) => /\.overlay\s*(?:\(|\{)/.test(line));
    return {
      input: inputMatch[1],
      line: overlayLineOffset >= 0 ? windowStart + overlayLineOffset + 1 : i + 1,
    };
  }

  return undefined;
}

function findDisabledInputHazard(source: string): InputHazard | undefined {
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const inputMatch = lines[i]?.match(/\b(TextField|TextEditor|SecureField)\s*\(/);
    if (!inputMatch) continue;

    const windowStart = Math.max(0, i - 8);
    const windowEnd = Math.min(lines.length, i + 18);
    const disabledLineOffset = lines
      .slice(windowStart, windowEnd)
      .findIndex(
        (line) =>
          /\.disabled\s*\(/.test(line) && !/\.disabled\s*\(\s*false\s*\)/.test(line)
      );
    if (disabledLineOffset < 0) continue;

    return {
      input: inputMatch[1],
      line: windowStart + disabledLineOffset + 1,
    };
  }

  return undefined;
}

function findInputGestureHazard(
  source: string
): (InputHazard & { pattern: string }) | undefined {
  const lines = source.split("\n");
  const gesturePatterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /\.highPriorityGesture\s*\(/, label: ".highPriorityGesture(...)" },
    { regex: /\.gesture\s*\(/, label: ".gesture(...)" },
    { regex: /\.onTapGesture\b/, label: ".onTapGesture" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const inputMatch = lines[i]?.match(/\b(TextField|TextEditor|SecureField)\s*\(/);
    if (!inputMatch) continue;

    const windowStart = Math.max(0, i - 8);
    const windowEnd = Math.min(lines.length, i + 18);
    const windowLines = lines.slice(windowStart, windowEnd);

    for (const pattern of gesturePatterns) {
      const gestureLineOffset = windowLines.findIndex((line) => pattern.regex.test(line));
      if (gestureLineOffset < 0) continue;
      return {
        input: inputMatch[1],
        line: windowStart + gestureLineOffset + 1,
        pattern: pattern.label,
      };
    }
  }

  return undefined;
}

function runtimeHazardDiagnostics(source: string, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const hazards = findRuntimeHazards(source);

  for (const hazard of hazards.slice(0, 4)) {
    diagnostics.push({
      code: hazard.code,
      severity: "error",
      file,
      line: hazard.line,
      message: hazard.message,
      suggestion: hazard.suggestion,
    });
  }

  const lifecycle = findLifecycleRuntimeHazard(source);
  if (lifecycle) {
    diagnostics.push({
      code: "AXCLOUD-RUNTIME-LIFECYCLE-BLOCKER",
      severity: "error",
      file,
      line: lifecycle.line,
      message: `${lifecycle.context} contains ${lifecycle.pattern}, which can freeze or repeatedly block SwiftUI rendering when the view appears.`,
      suggestion:
        "Move blocking or long-running lifecycle work into a cancellable async model method. Keep View.body, init, onAppear, and .task lightweight; add a launch/UI smoke test that proves the screen becomes interactive.",
    });
  }

  return diagnostics;
}

type RuntimeHazard = {
  code: string;
  pattern: string;
  line?: number;
  message: string;
  suggestion: string;
};

function findRuntimeHazards(source: string): RuntimeHazard[] {
  const hazardDefinitions = [
    {
      needles: ["DispatchQueue.main.sync"],
      code: "AXCLOUD-RUNTIME-MAIN-SYNC",
      pattern: "DispatchQueue.main.sync",
      message:
        "DispatchQueue.main.sync can deadlock when called from the main thread during app launch or SwiftUI rendering.",
      suggestion:
        "Replace main-thread sync dispatch with direct main-actor access or an async hop. Never call DispatchQueue.main.sync from View.body, init, onAppear, or app startup.",
    },
    {
      needles: ["DispatchSemaphore", ".wait()", "DispatchGroup"],
      code: "AXCLOUD-RUNTIME-BLOCKING-WAIT",
      pattern: "blocking wait",
      message:
        "Blocking waits can freeze SwiftUI/macOS apps when they run on the main thread.",
      suggestion:
        "Replace semaphores, DispatchGroup waits, and synchronous waits with async/await plus cancellation and timeout handling.",
    },
    {
      needles: ["Thread.sleep", "sleep(", "usleep("],
      code: "AXCLOUD-RUNTIME-SLEEP",
      pattern: "sleep",
      message:
        "Sleep calls block the current thread and commonly freeze launch, previews, or UI interactions when used in SwiftUI lifecycle code.",
      suggestion:
        "Use Task.sleep inside an async task, keep it off View.body/init/onAppear startup work, and make the task cancellable.",
    },
    {
      needles: ["while true", "while(true)", "for ;;"],
      code: "AXCLOUD-RUNTIME-INFINITE-LOOP",
      pattern: "infinite loop",
      message:
        "An unbounded loop is a likely freeze source if it runs during launch, rendering, or a main-actor task.",
      suggestion:
        "Add an exit condition, move repeated work to a cancellable timer/AsyncSequence, and prove the UI stays interactive with a launch smoke test.",
    },
    {
      needles: [
        "Data(contentsOf:",
        "String(contentsOf:",
        "NSImage(contentsOf:",
        "FileManager.default.contentsOfDirectory",
      ],
      code: "AXCLOUD-RUNTIME-SYNC-IO",
      pattern: "synchronous I/O",
      message:
        "Synchronous I/O, file, network, or image loading can freeze the UI when performed on the main actor or during SwiftUI view construction.",
      suggestion:
        "Move I/O into an async loader or background task, cache results in a model, and render loading state instead of blocking the view tree.",
    },
  ];

  const hazards: RuntimeHazard[] = [];
  for (const definition of hazardDefinitions) {
    for (const needle of definition.needles) {
      const line = findLine(source, needle);
      if (line) {
        hazards.push({
          code: definition.code,
          pattern: definition.pattern,
          line,
          message: definition.message,
          suggestion: definition.suggestion,
        });
        break;
      }
    }
  }

  return hazards;
}

function findLifecycleRuntimeHazard(
  source: string
): { context: string; pattern: string; line?: number } | undefined {
  const lifecyclePatterns = [
    { context: ".onAppear", needle: ".onAppear" },
    { context: ".task", needle: ".task" },
    { context: "View init", needle: "init(" },
    { context: "App startup", needle: "WindowGroup" },
  ];
  const hazardNeedles = [
    "DispatchQueue.main.sync",
    "DispatchSemaphore",
    ".wait()",
    "Thread.sleep",
    "sleep(",
    "while true",
    "Data(contentsOf:",
    "String(contentsOf:",
  ];

  const lines = source.split("\n");
  for (const lifecycle of lifecyclePatterns) {
    const index = lines.findIndex((line) =>
      line.toLowerCase().includes(lifecycle.needle.toLowerCase())
    );
    if (index < 0) continue;
    const window = lines.slice(index, Math.min(lines.length, index + 16)).join("\n");
    const hazard = hazardNeedles.find((needle) =>
      window.toLowerCase().includes(needle.toLowerCase())
    );
    if (hazard) {
      return {
        context: lifecycle.context,
        pattern: hazard,
        line: index + 1,
      };
    }
  }

  return undefined;
}

function findLikelyMainThreadBlocker(
  source: string
): { pattern: string; line?: number } | undefined {
  const patterns: Array<{ needle: string; label: string }> = [
    { needle: "DispatchQueue.main.sync", label: "DispatchQueue.main.sync" },
    { needle: "DispatchSemaphore", label: "DispatchSemaphore" },
    { needle: ".wait()", label: "Blocking wait()" },
    { needle: "DispatchGroup", label: "DispatchGroup" },
    { needle: "Thread.sleep", label: "Thread.sleep" },
    { needle: "sleep(", label: "sleep(...)" },
    { needle: "usleep(", label: "usleep(...)" },
    { needle: "while true", label: "while true" },
    { needle: "while(true)", label: "while true" },
    { needle: "for ;;", label: "for ;;" },
  ];

  for (const pattern of patterns) {
    const line = findLine(source, pattern.needle);
    if (line) return { pattern: pattern.label, line };
  }

  return undefined;
}

function findLikelyMainThreadBlockerLine(source: string): number | undefined {
  return findLikelyMainThreadBlocker(source)?.line;
}

function findIosOnlySwiftUIUsage(
  source: string
): { api: string; line?: number } | undefined {
  const patterns = [
    ".keyboardType(",
    ".navigationBarTitleDisplayMode(",
    ".navigationBarItems(",
    ".topBarTrailing",
    ".topBarLeading",
  ];

  for (const api of patterns) {
    const line = findLine(source, api);
    if (line) return { api, line };
  }

  return undefined;
}

function findLine(source: string, needle: string): number | undefined {
  const lines = source.split("\n");
  const lowerNeedle = needle.toLowerCase();
  const index = lines.findIndex((line) => line.toLowerCase().includes(lowerNeedle));
  return index >= 0 ? index + 1 : undefined;
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.file ?? ""}:${diagnostic.line ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTextForEvidence(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function hasPassingXcodeProof(input: CloudCheckInput): boolean {
  if (!input.xcodeBuildLog) return false;
  const text = normalizeTextForEvidence(input.xcodeBuildLog);
  if (!text) return false;
  const focusedProofPass =
    /\bfocused xcode test proof passed\b/.test(text) &&
    /\*\*\s*test\s+succeeded\s*\*\*/.test(text);
  if (/\*\*\s*build\s+failed\s*\*\*|\bfatal error\b|\berror:/.test(text)) {
    return false;
  }
  if (hasConcreteXcodeFailure(text) && !focusedProofPass) return false;

  return (
    focusedProofPass ||
    /\*\*\s*(?:test|build)\s+succeeded\s*\*\*/.test(text) ||
    /\b(?:test|tests|test suite|test case|build)\s+(?:passed|succeeded)\b/.test(text) ||
    /\b\d+\s+tests?\s+passed\b/.test(text) ||
    /\bexecuted\s+\d+\s+tests?,?\s+with\s+0\s+failures\b/.test(text) ||
    /\b0\s+failures\b/.test(text)
  );
}

function hasConcreteXcodeFailure(normalizedXcodeLog: string): boolean {
  const text = normalizedXcodeLog
    .replace(/\b0\s+(?:failures?|failed|errors?)\b/g, " ")
    .replace(/\bwith\s+0\s+failures\b/g, " ");

  return /\*\*\s*(?:test|build)\s+failed\s*\*\*|\b(?:test|tests|test suite|test case|build)\s+failed\b|\berror:|\bfatal error\b|\bcrash(?:ed|es)?\b|\bexit(?:ed)?\s+(?:with\s+)?(?:code\s+)?[1-9]\d*\b/.test(
    text
  );
}

function hasNegativeBehaviorEvidence(actualBehavior: string): boolean {
  const actual = normalizeTextForEvidence(actualBehavior);
  if (!actual) return false;
  return (
    /\b(fail|fails|failed|failing|missing|misses|missed|never|no longer|wrong|incorrect|broken|regress|regressed|regression|freeze|freezes|frozen|hang|hangs|hung|crash|crashes|unresponsive|timeout|timed out|instead|mismatch|contradict|contradicts)\b/.test(
      actual
    ) ||
    /\b(?:not|doesn't|does not|can't|cannot)\s+(?:work|working|implemented|show|render|match|pass|compile|build|load|open|respond|appear|exist|route|preserve)\b/.test(
      actual
    )
  );
}

function hasIntentionalAbsenceProof(
  expectedBehavior: string | undefined,
  actualBehavior: string | undefined,
  xcodeBuildLog: string | undefined
): boolean {
  const expected = normalizeTextForEvidence(expectedBehavior ?? "");
  const actual = normalizeTextForEvidence(actualBehavior ?? "");
  const xcode = normalizeTextForEvidence(xcodeBuildLog ?? "");
  if (!expected || !actual) return false;

  const expectedAbsence =
    /\b(do not|does not|should not|must not|hide|hides|hidden|absent|absence|not show|not display|not render|not present|does not exist)\b/.test(
      expected
    );
  const actualVerifiedAbsence =
    /\b(asserted|assert|verified|confirmed|passed|proves|proof|expected)\b/.test(
      actual
    ) &&
    /\b(did not exist|does not exist|not exist|not present|not visible|not shown|not rendered|absent|absence|hidden|do not show|not show|not display)\b/.test(
      actual
    );
  const passingProof =
    /\*\*\s*test\s+succeeded\s*\*\*/.test(xcode) ||
    /\btest case\b.*\bpassed\b/.test(xcode) ||
    /\b0\s+failures\b/.test(xcode);

  return expectedAbsence && actualVerifiedAbsence && passingProof;
}

function hasNegativeAccessibilityEvidence(evidence: string): boolean {
  const text = normalizeTextForEvidence(evidence);
  if (!text) return false;

  const mentionsAccessibility =
    /\b(accessibility|accessibilityidentifier|accessibility identifier|identifier|hittable|tap target|button|textfield|text field|element)\b/.test(
      text
    );
  if (!mentionsAccessibility) return false;

  return /\b(fail|fails|failed|failing|failure|not found|no match|no matching|not hittable|does not exist|not exist|never appears|timed out|timeout|masked|masking|overwrote|blocked|can't tap|cannot tap|not tappable)\b/.test(
    text
  );
}

function behaviorEvidenceContradictsExpectation(
  expectedBehavior: string,
  actualBehavior: string
): boolean {
  const expected = normalizeTextForEvidence(expectedBehavior);
  const actual = normalizeTextForEvidence(actualBehavior);
  if (!expected || !actual || expected === actual) return false;

  if (hasNegativeBehaviorEvidence(actual)) return true;

  const implementationEvidence =
    /\b(implemented|added|wired|built|created|preserved|kept|supports|shows|renders|uses|matches|includes|completed|fixed|passes|passed|clean|succeeds|succeeded)\b/.test(
      actual
    );
  if (implementationEvidence) return false;

  const expectedTokens = evidenceConceptTokens(expected);
  const actualTokens = evidenceConceptTokens(actual);
  if (expectedTokens.length === 0 || actualTokens.length === 0) return false;

  const actualSet = new Set(actualTokens);
  const overlap = expectedTokens.filter((token) => actualSet.has(token)).length;
  const overlapRatio = overlap / Math.max(1, Math.min(expectedTokens.length, 10));
  return overlap < 2 && overlapRatio < 0.25;
}

function evidenceConceptTokens(text: string): string[] {
  const stopWords = new Set([
    "about",
    "actual",
    "after",
    "and",
    "are",
    "behavior",
    "but",
    "can",
    "code",
    "expected",
    "for",
    "from",
    "has",
    "have",
    "into",
    "its",
    "not",
    "now",
    "out",
    "should",
    "that",
    "the",
    "this",
    "through",
    "with",
  ]);
  return Array.from(
    new Set(
      text
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 3 && !stopWords.has(token))
    )
  );
}

function labelForStatus(status: CloudCheckStatus): string {
  if (status === "pass") return "Pass";
  if (status === "needs_review") return "Needs review";
  return "Fail";
}

function buildCloudCoverage(input: {
  language: CloudCheckLanguage;
  surface: string;
  generated: boolean;
  hasSwiftCode: boolean;
  runtimeCoverageRequired: boolean;
  evidenceProvided: boolean;
  runtimeEvidenceProvided: boolean;
  projectContextLoaded: boolean;
  nonAppleArtifact: boolean;
}): CloudCheckReport["coverage"] {
  const coverage: CloudCheckReport["coverage"] = [];

  coverage.push({
    label: input.nonAppleArtifact
      ? "Document/web artifact routing"
      : input.language === "typescript"
        ? "Axint parse and lowering"
        : "Source loading",
    state: "checked",
    detail: input.nonAppleArtifact
      ? "Detected that this input is not Swift or Axint source, so Cloud Check skipped Apple-native compilation instead of emitting a fake intent diagnostic."
      : input.language === "typescript"
        ? "Parsed the Axint source and attempted to lower it into Swift before validation."
        : "Loaded the Swift source directly and ran static Apple-facing validation.",
  });

  if (input.nonAppleArtifact) {
    coverage.push({
      label: "Swift validator rule engine",
      state: "not_applicable",
      detail:
        "This artifact needs browser/render/link proof, not Swift validator diagnostics.",
    });
  } else if (input.hasSwiftCode) {
    coverage.push({
      label: "Swift validator rule engine",
      state: "checked",
      detail:
        "Ran App Intents, WidgetKit, SwiftUI structure, Swift concurrency, Live Activities, Observation, and accessibility heuristics.",
    });
  } else {
    coverage.push({
      label: "Swift validator rule engine",
      state: "not_applicable",
      detail: "No Swift output was available, so Swift-specific rules could not run.",
    });
  }

  coverage.push({
    label: "Actionable diagnostics",
    state: "checked",
    detail:
      "Returned matching AX diagnostics with severity, line number when known, and fix guidance. A clean result means no current static rule fired, not that the app has no bug.",
  });

  coverage.push({
    label: "Xcode build, UI tests, and runtime behavior",
    state: input.runtimeEvidenceProvided
      ? "checked"
      : input.runtimeCoverageRequired
        ? "needs_runtime"
        : "not_applicable",
    detail: input.runtimeEvidenceProvided
      ? "Inspected supplied Xcode build, test, runtime, or behavior evidence and converted recognized failures into Cloud diagnostics."
      : input.runtimeCoverageRequired
        ? "Not executed by Cloud Check. Run Xcode build/test evidence for SwiftUI route, accessibility, state, and interaction claims."
        : "Not required for this static Apple contract check unless the surrounding project behavior is under investigation.",
  });

  coverage.push({
    label: "Project-wide context",
    state: input.projectContextLoaded ? "checked" : "not_applicable",
    detail: input.projectContextLoaded
      ? "Loaded a local .axint/context pack so Cloud Check could consider changed files, nearby SwiftUI surfaces, and interaction-risk files."
      : "No local .axint/context pack was loaded. Run `axint project index` to give Cloud Check project-level visibility beyond the current file.",
  });

  return coverage;
}

function buildCloudConfidence(input: {
  status: CloudCheckStatus;
  errors: number;
  warnings: number;
  runtimeCoverageRequired: boolean;
  evidenceProvided: boolean;
  runtimeEvidenceProvided: boolean;
  nonAppleArtifact: boolean;
}): CloudCheckReport["confidence"] {
  if (input.nonAppleArtifact) {
    return {
      level: "medium",
      detail:
        "Cloud Check correctly identified this as a document/web artifact, not an Apple-native compiler target.",
      missingEvidence: [
        "Browser/render smoke test",
        "Link or route verification",
        "Cloud Check on the related Swift or Axint source if Apple behavior changed",
      ],
    };
  }

  if (input.errors > 0) {
    return {
      level: "high",
      detail: "High confidence that the listed static findings need attention.",
      missingEvidence: ["Xcode build/test confirmation after fixes"],
    };
  }

  if (input.warnings > 0) {
    return {
      level: "medium",
      detail:
        "Static validation found warnings that an agent should review before continuing.",
      missingEvidence: ["Xcode build/test confirmation after review"],
    };
  }

  if (
    (input.runtimeCoverageRequired && !input.runtimeEvidenceProvided) ||
    input.status === "needs_review"
  ) {
    return {
      level: "medium",
      detail:
        "Static checks are clean, but SwiftUI runtime behavior still needs Xcode build or UI-test evidence.",
      missingEvidence: [
        "Xcode build",
        "Relevant unit/UI tests",
        "Runtime route/accessibility verification",
      ],
    };
  }

  if (input.evidenceProvided) {
    return {
      level: "high",
      detail:
        "Static checks and supplied Xcode/test/runtime evidence were inspected without classified findings.",
      missingEvidence: [
        "Full project build/test logs if this was only a partial evidence sample",
      ],
    };
  }

  return {
    level: "high",
    detail:
      "Static Apple-facing checks completed without findings for the detected surface.",
    missingEvidence: ["Full project build if this file was edited inside an app"],
  };
}

function buildCloudGate(input: {
  status: CloudCheckStatus;
  errors: number;
  warnings: number;
  runtimeCoverageRequired: boolean;
  runtimeEvidenceProvided: boolean;
  evidenceProvided: boolean;
  nonAppleArtifact: boolean;
}): CloudCheckReport["gate"] {
  if (input.nonAppleArtifact) {
    return {
      decision: "evidence_required",
      canClaimFixed: false,
      reason:
        "Cloud Check is not applicable as the final proof for a document or web artifact.",
      requiredEvidence: [
        "Rendered browser verification",
        "Relevant route/link checks",
        "Apple-source Cloud Check only if Swift or Axint source changed",
      ],
    };
  }

  if (input.errors > 0 || input.warnings > 0 || input.status === "fail") {
    return {
      decision: "fix_required",
      canClaimFixed: false,
      reason:
        input.errors > 0
          ? "Cloud Check found blocking diagnostics."
          : "Cloud Check found warnings that need review before claiming the issue is fixed.",
      requiredEvidence: ["Edited source", "Cloud Check rerun", "Xcode build/test proof"],
    };
  }

  if (input.runtimeCoverageRequired && !input.runtimeEvidenceProvided) {
    return {
      decision: "evidence_required",
      canClaimFixed: false,
      reason:
        "Static SwiftUI/app checks are clean, but runtime, route, accessibility, and state behavior still need Xcode evidence.",
      requiredEvidence: [
        "Xcode build",
        "Relevant unit or UI test",
        "Runtime/preview verification for the touched flow",
      ],
    };
  }

  if (input.runtimeCoverageRequired && input.runtimeEvidenceProvided) {
    return {
      decision: "ready_to_ship",
      canClaimFixed: true,
      reason:
        "Static checks and supplied runtime/build/test evidence did not surface a classified issue.",
      requiredEvidence: [],
    };
  }

  return {
    decision: input.evidenceProvided ? "ready_to_ship" : "ready_for_build",
    canClaimFixed: input.evidenceProvided,
    reason: input.evidenceProvided
      ? "Static checks and supplied evidence were clean."
      : "Static Apple-facing checks are clean; build proof is still the next step.",
    requiredEvidence: input.evidenceProvided ? [] : ["Xcode build"],
  };
}

function buildCloudRepairPrompt(report: CloudCheckReport): string {
  const actionable = report.diagnostics.filter((d) => d.severity !== "info").slice(0, 4);

  if (actionable.length === 0) {
    if (report.diagnostics.some((d) => d.code === "AXCLOUD-NON-APPLE-ARTIFACT")) {
      return [
        `Review ${report.fileName}.`,
        "Axint Cloud Check identified this as a document or web artifact, not an Apple-native source file.",
        `Ship gate: ${report.gate.decision}. ${report.gate.reason}`,
        `Checked: ${checkedCoverageSummary(report)}.`,
        "Use browser/render/link proof for this artifact.",
        "Run Cloud Check on the related Swift or Axint source only if Apple-facing behavior changed.",
        "",
        "Repair plan:",
        ...report.repairPlan.map(
          (step, index) => `${index + 1}. ${step.title}: ${step.detail}`
        ),
      ].join("\n");
    }

    if (hasRuntimeCoverageWarning(report)) {
      return [
        `Review ${report.fileName}.`,
        "Axint Cloud Check did not find blocking static Apple-facing issues.",
        `Static confidence: ${report.confidence.level}. ${report.confidence.detail}`,
        `Ship gate: ${report.gate.decision}. ${report.gate.reason}`,
        `Checked: ${checkedCoverageSummary(report)}.`,
        ...(report.projectContext
          ? [
              "Project context:",
              ...report.projectContext.summary.map((item) => `- ${item}`),
            ]
          : []),
        ...(report.repairIntelligence
          ? ["", ...formatAppleRepairRead(report.repairIntelligence)]
          : []),
        "This is not a runtime pass. Run the Xcode build plus the relevant unit/UI tests before claiming there is no bug.",
        "",
        "Repair plan:",
        ...report.repairPlan.map(
          (step, index) => `${index + 1}. ${step.title}: ${step.detail}`
        ),
        "If those fail after Cloud Check is clean, log the failure as an Axint validator/runtime-coverage gap.",
      ].join("\n");
    }

    return [
      `Review ${report.fileName}.`,
      "Axint Cloud Check did not find blocking Apple-facing issues.",
      `Static confidence: ${report.confidence.level}. ${report.confidence.detail}`,
      `Ship gate: ${report.gate.decision}. ${report.gate.reason}`,
      `Checked: ${checkedCoverageSummary(report)}.`,
      ...(report.projectContext
        ? [
            "Project context:",
            ...report.projectContext.summary.map((item) => `- ${item}`),
          ]
        : []),
      ...(report.repairIntelligence
        ? ["", ...formatAppleRepairRead(report.repairIntelligence)]
        : []),
      `Repair plan: ${report.repairPlan.map((step) => step.title).join(" -> ")}.`,
      "Preserve the feature behavior and rerun Cloud Check after the next agent edit.",
    ].join("\n");
  }

  return [
    `Fix the Apple-facing issues in ${report.fileName} without changing the user's intended feature behavior.`,
    `Surface: ${report.surface}`,
    `Confidence: ${report.confidence.level}. ${report.confidence.detail}`,
    `Ship gate: ${report.gate.decision}. ${report.gate.reason}`,
    ...(report.evidence.provided.length > 0
      ? ["", "Evidence supplied:", ...report.evidence.summary.map((item) => `- ${item}`)]
      : []),
    ...(report.projectContext
      ? [
          "",
          "Project context:",
          ...report.projectContext.summary.map((item) => `- ${item}`),
          ...(report.projectContext.relatedFiles.length > 0
            ? [
                "- Related files to inspect:",
                ...report.projectContext.relatedFiles.map(
                  (file) =>
                    `  - ${file.path}${file.reasons.length > 0 ? ` (${file.reasons.slice(0, 2).join(", ")})` : ""}`
                ),
              ]
            : []),
        ]
      : []),
    ...(report.repairIntelligence
      ? ["", ...formatAppleRepairRead(report.repairIntelligence)]
      : []),
    "",
    "Address these findings:",
    ...actionable.map(
      (d) => `- ${d.code}: ${d.message}${d.suggestion ? ` Fix: ${d.suggestion}` : ""}`
    ),
    ...(report.diagnostics.some((d) => d.code === "AXCLOUD-RUNTIME-FREEZE")
      ? [
          "",
          "Freeze triage:",
          "- Capture a macOS sample while the app is frozen: `sample <AppProcessName> 5 -file /tmp/axint-freeze-sample.txt`.",
          "- Inspect Thread 0 for the first app-owned frame.",
          "- Check View.body, init, onAppear, .task, App startup, and shared stores for blocking work.",
          "- Rerun Cloud Check with the sample excerpt and then rerun the launch/UI smoke test.",
        ]
      : []),
    "",
    "Repair plan:",
    ...report.repairPlan.map(
      (step, index) => `${index + 1}. ${step.title}: ${step.detail}`
    ),
    "",
    "After editing, rerun `axint cloud check --source <file>` and then build in Xcode.",
  ].join("\n");
}

function checkedCoverageSummary(report: CloudCheckReport): string {
  const checked = report.coverage
    .filter((item) => item.state === "checked")
    .map((item) => item.label);
  return checked.length > 0 ? checked.join(", ") : "No static checks completed";
}

function buildCloudLearningSignal(
  report: CloudCheckReport
): CloudLearningSignal | undefined {
  const runtimeCoverageOnly =
    report.diagnostics.length === 0 && hasRuntimeCoverageWarning(report);

  if (
    report.status === "pass" ||
    (report.diagnostics.length === 0 && !runtimeCoverageOnly)
  ) {
    return undefined;
  }

  const diagnosticCodes = unique(
    report.diagnostics.length > 0
      ? report.diagnostics.map((d) => d.code)
      : ["AXCLOUD-RUNTIME-COVERAGE"]
  );
  const diagnosticSummary =
    report.diagnostics.length > 0
      ? report.diagnostics
          .slice(0, 5)
          .map((d) => `${d.code}:${d.severity}:${normalizeDiagnosticText(d.message)}`)
          .join("|")
      : "AXCLOUD-RUNTIME-COVERAGE:warning:static-check-needs-xcode-runtime-evidence";
  const signals = inferLearningSignals(report);
  const kind = inferLearningKind(report, signals);
  const suggestedOwner = inferLearningOwner(report, kind, signals);
  const priority = inferLearningPriority(report);
  const fingerprint = `learn-${hashString(
    [
      report.compilerVersion,
      report.language,
      report.surface,
      report.status,
      diagnosticCodes.join(","),
      signals.join(","),
      diagnosticSummary,
    ].join(":")
  )}`;

  return {
    id: `signal-${hashString(`${report.id}:${fingerprint}`)}`,
    reportId: report.id,
    kind,
    priority,
    fingerprint,
    title: titleForLearningSignal(kind, diagnosticCodes),
    summary: [
      `${report.fileName} produced ${report.errors} error(s), ${report.warnings} warning(s), and ${report.infos} info diagnostic(s).`,
      `Cloud Check classified this as ${kind} for ${suggestedOwner}.`,
    ].join(" "),
    compilerVersion: report.compilerVersion,
    surface: report.surface,
    language: report.language,
    fileName: report.fileName,
    status: report.status,
    diagnosticCodes,
    diagnosticSummary,
    signals,
    sourceShape: {
      sourceLines: report.sourceLines,
      outputLines: report.outputLines,
    },
    suggestedOwner,
    suggestedAction: suggestedActionForLearningSignal(report, kind, suggestedOwner),
    redaction: "source_not_included",
    createdAt: report.createdAt,
  };
}

function inferLearningSignals(report: CloudCheckReport): string[] {
  const body = report.diagnostics
    .map((d) => `${d.code} ${d.message} ${d.suggestion ?? ""}`)
    .join("\n")
    .toLowerCase();
  const signals: string[] = [];

  if (hasRuntimeCoverageWarning(report)) {
    signals.push("runtime-evidence-missing");
  }
  if (report.evidence.provided.length > 0) {
    signals.push("runtime-evidence-supplied");
  }
  if (/\bAXCLOUD-RUNTIME-FREEZE\b/i.test(body)) {
    signals.push("runtime-freeze-evidence");
  }
  if (/\bAXCLOUD-RUNTIME-STATE-TRANSITION-HANG\b/i.test(body)) {
    signals.push("swiftui-state-transition-hang");
  }
  if (
    /\bAXCLOUD-RUNTIME-(MAIN-BLOCKER|MAIN-SYNC|BLOCKING-WAIT|SLEEP|INFINITE-LOOP|SYNC-IO|LIFECYCLE-BLOCKER|STATE-TRANSITION-HANG)\b/i.test(
      body
    )
  ) {
    signals.push("runtime-main-thread-blocker");
  }
  if (/\bAXCLOUD-UI-[A-Z-]+\b/i.test(body)) {
    signals.push("ui-interaction-evidence");
  }

  if (
    report.language === "typescript" &&
    report.swiftCode &&
    report.diagnostics.length > 0
  ) {
    signals.push("generated-swift-did-not-pass-validation");
  }
  if (
    report.language !== "swift" &&
    /\b(static\s+let|let vs var|must be declared as var|title)\b/.test(body)
  ) {
    signals.push("generator-validator-contract-drift");
  }
  if (
    report.language === "swift" &&
    /\b(static\s+let|let vs var|must be declared as var|title)\b/.test(body)
  ) {
    signals.push("app-intents-contract-finding");
  }
  if (/\b(duplicate|already declared|invalid redeclaration)\b/.test(body)) {
    signals.push("duplicate-generated-symbol");
  }
  if (
    /\b(keyboardtype|topbartrailing|availability|macos|ios-only|platform)\b/.test(body)
  ) {
    signals.push("platform-availability-gap");
  }
  if (
    /\b(info\.plist|entitlement|privacy usage|nsh(ealth|ome)|usage description)\b/.test(
      body
    )
  ) {
    signals.push("apple-metadata-gap");
  }
  if (/\b(parse|syntax|unsupported|could not produce swift)\b/.test(body)) {
    signals.push("compiler-parse-gap");
  }

  return unique(signals.length > 0 ? signals : ["unclassified-cloud-finding"]);
}

function inferLearningKind(
  report: CloudCheckReport,
  signals: string[]
): CloudLearningKind {
  if (signals.includes("platform-availability-gap")) return "platform_gap";
  if (signals.includes("swiftui-state-transition-hang")) return "validator_gap";
  if (signals.includes("runtime-freeze-evidence")) return "validator_gap";
  if (signals.includes("runtime-evidence-missing")) return "validator_gap";
  if (report.language === "swift") return "validator_gap";
  if (signals.includes("generator-validator-contract-drift")) return "generator_gap";
  if (signals.includes("duplicate-generated-symbol")) return "generator_gap";
  if (signals.includes("apple-metadata-gap")) return "swift_api_gap";
  if (signals.includes("compiler-parse-gap")) return "compiler_gap";
  if (report.language === "typescript" && report.swiftCode) return "generator_gap";
  return "unknown";
}

function inferLearningOwner(
  report: CloudCheckReport,
  kind: CloudLearningKind,
  signals: string[]
): CloudLearningOwner {
  if (signals.includes("platform-availability-gap")) return "swift-validator";
  if (signals.includes("swiftui-state-transition-hang")) return "cloud";
  if (signals.includes("runtime-freeze-evidence")) return "cloud";
  if (signals.includes("runtime-evidence-missing")) return "cloud";
  if (signals.includes("ui-interaction-evidence")) return "cloud";
  if (kind === "validator_gap") return "swift-validator";
  if (signals.includes("generator-validator-contract-drift")) return "compiler";
  if (signals.includes("duplicate-generated-symbol")) return "feature-generator";
  if (kind === "compiler_gap") return "compiler";
  if (kind === "generator_gap" && report.surface === "view") return "schema-compile";
  if (kind === "generator_gap") return "compiler";
  if (kind === "swift_api_gap") return "swift-validator";
  return "cloud";
}

function inferLearningPriority(report: CloudCheckReport): CloudLearningPriority {
  if (report.errors > 0 && report.language !== "swift") return "p0";
  if (report.errors > 0) return "p1";
  if (hasRuntimeCoverageWarning(report)) return "p2";
  if (report.warnings > 0) return "p2";
  return "p3";
}

function titleForLearningSignal(
  kind: CloudLearningKind,
  diagnosticCodes: string[]
): string {
  const codeList = diagnosticCodes.slice(0, 3).join(", ");
  if (kind === "generator_gap") return `Generated output failed validation (${codeList})`;
  if (kind === "platform_gap") return `Platform-specific Apple API gap (${codeList})`;
  if (diagnosticCodes.includes("AXCLOUD-RUNTIME-COVERAGE")) {
    return "Static Cloud Check needs runtime evidence";
  }
  if (diagnosticCodes.includes("AXCLOUD-RUNTIME-FREEZE")) {
    return "Runtime freeze evidence needs Cloud triage";
  }
  if (diagnosticCodes.includes("AXCLOUD-RUNTIME-STATE-TRANSITION-HANG")) {
    return "SwiftUI state-transition hang needs Cloud triage";
  }
  if (diagnosticCodes.some((code) => code.startsWith("AXCLOUD-UI-"))) {
    return `UI interaction evidence needs Cloud triage (${codeList})`;
  }
  if (kind === "compiler_gap")
    return `Compiler could not lower source cleanly (${codeList})`;
  if (kind === "swift_api_gap") return `Apple metadata or API contract gap (${codeList})`;
  if (kind === "validator_gap")
    return `Swift validator finding needs review (${codeList})`;
  return `Cloud Check finding needs triage (${codeList})`;
}

function suggestedActionForLearningSignal(
  report: CloudCheckReport,
  kind: CloudLearningKind,
  owner: CloudLearningOwner
): string {
  if (report.diagnostics.some((d) => d.code === "AXCLOUD-RUNTIME-FREEZE")) {
    return "Capture a freeze sample fixture, classify the first app-owned main-thread frame, and promote repeated freeze signatures into Cloud runtime diagnostics.";
  }
  if (
    report.diagnostics.some((d) => d.code === "AXCLOUD-RUNTIME-STATE-TRANSITION-HANG")
  ) {
    return "Capture a focused UI-test fixture for scroll-plus-state transitions, then teach Cloud Check to map main-thread busy failures to SwiftUI animation, pinned-header, and collection recomputation repairs.";
  }
  if (report.diagnostics.some((d) => d.code.startsWith("AXCLOUD-UI-"))) {
    return "Turn repeated tap/focus/input regressions into UI-interaction fixtures so Cloud Check can classify overlay, disabled-state, and gesture-capture bugs immediately.";
  }
  if (kind === "generator_gap") {
    return "Create a regression fixture from the source shape, fix the generator, then require the generated Swift to pass axint.swift.validate.";
  }
  if (kind === "platform_gap") {
    return "Add platform-aware validator coverage and generator guards for this API family.";
  }
  if (kind === "compiler_gap") {
    return "Add a parser/compiler regression test and return a targeted diagnostic instead of a generic failure.";
  }
  if (kind === "swift_api_gap") {
    return "Add or tighten an Apple-specific diagnostic with a concrete Fix Packet next step.";
  }
  if (owner === "cloud") {
    return "Require Xcode build/test evidence for SwiftUI runtime claims and record clean-static/failing-runtime cases as validator gap reports.";
  }
  if (owner === "swift-validator") {
    const firstCode = report.diagnostics[0]?.code ?? "the diagnostic";
    return `Review ${firstCode} severity and repair guidance against current Apple SDK behavior.`;
  }
  return "Cluster this signal with matching fingerprints and convert repeated failures into a test-backed compiler issue.";
}

function hasRuntimeCoverageWarning(report: CloudCheckReport): boolean {
  return report.checks.some(
    (check) => check.label === "Runtime and UI coverage" && check.state === "warn"
  );
}

function normalizeDiagnosticText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function summarizeEvidenceValue(label: string, value: string): string {
  if (label !== "xcodeBuildLog") return normalizeDiagnosticText(value);

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const highSignal = unique([
    ...lines.filter((line) => /\bfocused xcode test proof\b/i.test(line)),
    ...lines.filter((line) => /\bselectors?:\b/i.test(line)),
    ...lines.filter((line) => /\*\*\s*test\s+(?:succeeded|failed)\s*\*\*/i.test(line)),
    ...lines.filter((line) => /\bexecuted\s+\d+\s+tests?\b/i.test(line)),
    ...lines.filter((line) => /\btest case\b/i.test(line)),
  ]);
  return (highSignal.length > 0 ? highSignal : lines)
    .slice(0, 12)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DEFAULT_CLOUD_EVIDENCE_SUMMARY_CHARS);
}

function trimMiddle(value: string, maxChars: number, label: string): string {
  if (value.length <= maxChars) return value;
  const marker = `\n\n[... axint compacted ${value.length - maxChars} chars from ${label}; use the dedicated full-output format or inspect artifacts if needed ...]\n\n`;
  if (marker.length >= maxChars) return value.slice(0, maxChars);
  const headChars = Math.max(200, Math.floor((maxChars - marker.length) * 0.45));
  const tailChars = Math.max(200, maxChars - marker.length - headChars);
  return `${value.slice(0, headChars).trimEnd()}${marker}${value
    .slice(-tailChars)
    .trimStart()}`;
}

function positiveEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function packageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(here, "../../package.json"),
    resolve(process.cwd(), "package.json"),
  ]) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf-8")) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // ignore missing package files in bundled environments
    }
  }
  return "unknown";
}

function buildCloudCheckVersionInfo(
  input: CloudCheckInput,
  compilerVersion: string
): CloudCheckReport["versionInfo"] {
  const expectedProjectVersion =
    input.expectedVersion ?? expectedVersionFromProject(input.sourcePath);
  const localPackageVersion = input.localPackageVersion ?? compilerVersion;
  const cloudRulesetVersion = input.cloudRulesetVersion ?? compilerVersion;
  const mcpServerVersion = input.mcpServerVersion;
  const notes: string[] = [];

  const comparisons: Array<[string, string | undefined]> = [
    ["local package", localPackageVersion],
    ["MCP server", mcpServerVersion],
    ["expected project", expectedProjectVersion],
    ["Cloud ruleset", cloudRulesetVersion],
  ];

  for (const [label, value] of comparisons) {
    if (
      value &&
      value !== "unknown" &&
      compilerVersion !== "unknown" &&
      value !== compilerVersion
    ) {
      notes.push(`${label} is ${value}, compiler is ${compilerVersion}`);
    }
  }

  return {
    compilerVersion,
    localPackageVersion,
    mcpServerVersion,
    cloudRulesetVersion,
    expectedProjectVersion,
    consistent: notes.length === 0,
    notes,
  };
}

function expectedVersionFromProject(sourcePath: string | undefined): string | undefined {
  if (!sourcePath) return undefined;
  let current = dirname(resolve(sourcePath));
  for (let i = 0; i < 12; i++) {
    const candidate = resolve(current, ".axint/project.json");
    try {
      const project = JSON.parse(readFileSync(candidate, "utf-8")) as {
        axintVersion?: string;
        expectedVersion?: string;
      };
      return project.axintVersion ?? project.expectedVersion;
    } catch {
      // keep walking up
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
