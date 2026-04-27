import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAnySource } from "../core/compiler.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import type { CompilerOutput, Diagnostic } from "../core/types.js";

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
  xcodeBuildLog?: string;
  testFailure?: string;
  runtimeFailure?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
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

export function runCloudCheck(input: CloudCheckInput): CloudCheckReport {
  const { source, fileName } = readCloudCheckSource(input);
  const language = input.language ?? inferLanguage(fileName, source);
  const createdAt = new Date().toISOString();
  let surface = language === "swift" ? inferSwiftSurface(source) : "unknown";
  let swiftCode: string | undefined;
  let outputPath: string | undefined;
  let diagnostics: Diagnostic[];
  let generated = false;

  if (language === "swift") {
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
  const runtimeEvidenceProvided = hasRuntimeEvidence(evidence);
  const status: CloudCheckStatus =
    errors > 0
      ? "fail"
      : warnings > 0 || (runtimeCoverageRequired && !runtimeEvidenceProvided)
        ? "needs_review"
        : "pass";
  const outputLines = swiftCode ? swiftCode.split("\n").length : 0;

  const checks = [
    {
      label: language === "swift" ? "Swift source loaded" : "Source parse",
      state: diagnostics.some((d) => d.code === "AX001") ? "fail" : "pass",
      detail:
        language === "swift"
          ? "Axint loaded Swift source directly for Apple-specific validation."
          : generated
            ? "The source parsed into Axint IR and generated Swift."
            : "Axint could not produce Swift from this source.",
    },
    {
      label: language === "swift" ? "Swift validation" : "Swift generation",
      state: swiftCode ? "pass" : "fail",
      detail: swiftCode
        ? `${generated ? "Generated" : "Checked"} ${outputLines} line${outputLines === 1 ? "" : "s"} of Swift.`
        : "No Swift output was available for validation.",
    },
    {
      label: "Apple-specific findings",
      state: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
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
  ] satisfies CloudCheckReport["checks"];
  const coverage = buildCloudCoverage({
    language,
    surface,
    generated,
    hasSwiftCode: Boolean(swiftCode),
    runtimeCoverageRequired,
    evidenceProvided: evidence.provided.length > 0,
    runtimeEvidenceProvided,
  });
  const confidence = buildCloudConfidence({
    status,
    errors,
    warnings,
    runtimeCoverageRequired,
    evidenceProvided: evidence.provided.length > 0,
    runtimeEvidenceProvided,
  });
  const gate = buildCloudGate({
    status,
    errors,
    warnings,
    runtimeCoverageRequired,
    runtimeEvidenceProvided,
    evidenceProvided: evidence.provided.length > 0,
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
  });

  if (nextSteps.length === 0) {
    if (runtimeCoverageRequired) {
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
    compilerVersion: packageVersion(),
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
  if (format === "json") return JSON.stringify(report, null, 2);
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

  lines.push("", "## Agent Repair Prompt", "```text", report.repairPrompt, "```");
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
    return `${label}: ${normalizeDiagnosticText(value)}`;
  });

  return { provided, summary };
}

function hasRuntimeEvidence(evidence: CloudCheckReport["evidence"]): boolean {
  return evidence.provided.some((label) =>
    [
      "xcodeBuildLog",
      "testFailure",
      "runtimeFailure",
      "expectedBehavior",
      "actualBehavior",
    ].includes(label)
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

  if (
    input.input.expectedBehavior &&
    input.input.actualBehavior &&
    behaviorEvidenceContradictsExpectation(
      input.input.expectedBehavior,
      input.input.actualBehavior
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

function buildCloudRepairPlan(input: {
  diagnostics: Diagnostic[];
  runtimeCoverageRequired: boolean;
  runtimeEvidenceProvided: boolean;
  fileName: string;
}): CloudCheckReport["repairPlan"] {
  const actionable = input.diagnostics.filter((d) => d.severity !== "info");

  if (actionable.length === 0) {
    return [
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

  if (/\b(?:type|value)\s+'[^']+'\s+has no member\s+'[^']+'/.test(text)) {
    diagnostics.push({
      code: "AXCLOUD-BUILD-MISSING-MEMBER",
      severity: "error",
      file,
      message:
        "Xcode build evidence reports a member reference that does not exist on the resolved type.",
      suggestion:
        "Rename the generated enum case, static token, or type member to match the project symbol. If Axint generated it, feed the declaring type or design-token file as context before regenerating.",
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

  if (
    /\b(no matches|no matching|not found|failed to get matching|element.*not.*exist|wait.*timed out)\b/.test(
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

function behaviorEvidenceContradictsExpectation(
  expectedBehavior: string,
  actualBehavior: string
): boolean {
  const expected = normalizeTextForEvidence(expectedBehavior);
  const actual = normalizeTextForEvidence(actualBehavior);
  if (!expected || !actual || expected === actual) return false;

  const negativeEvidence =
    /\b(fail|fails|failed|failing|missing|misses|missed|never|no longer|wrong|incorrect|broken|regress|regressed|regression|freeze|freezes|frozen|hang|hangs|hung|crash|crashes|unresponsive|timeout|timed out|instead|mismatch|contradict|contradicts)\b/.test(
      actual
    ) ||
    /\b(?:not|doesn't|does not|can't|cannot)\s+(?:work|working|implemented|show|render|match|pass|compile|build|load|open|respond|appear|exist|route|preserve)\b/.test(
      actual
    );
  if (negativeEvidence) return true;

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
}): CloudCheckReport["coverage"] {
  const coverage: CloudCheckReport["coverage"] = [];

  coverage.push({
    label:
      input.language === "typescript" ? "Axint parse and lowering" : "Source loading",
    state: "checked",
    detail:
      input.language === "typescript"
        ? "Parsed the Axint source and attempted to lower it into Swift before validation."
        : "Loaded the Swift source directly and ran static Apple-facing validation.",
  });

  if (input.hasSwiftCode) {
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

  return coverage;
}

function buildCloudConfidence(input: {
  status: CloudCheckStatus;
  errors: number;
  warnings: number;
  runtimeCoverageRequired: boolean;
  evidenceProvided: boolean;
  runtimeEvidenceProvided: boolean;
}): CloudCheckReport["confidence"] {
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
}): CloudCheckReport["gate"] {
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
    if (hasRuntimeCoverageWarning(report)) {
      return [
        `Review ${report.fileName}.`,
        "Axint Cloud Check did not find blocking static Apple-facing issues.",
        `Static confidence: ${report.confidence.level}. ${report.confidence.detail}`,
        `Ship gate: ${report.gate.decision}. ${report.gate.reason}`,
        `Checked: ${checkedCoverageSummary(report)}.`,
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
  if (
    /\bAXCLOUD-RUNTIME-(MAIN-BLOCKER|MAIN-SYNC|BLOCKING-WAIT|SLEEP|INFINITE-LOOP|SYNC-IO|LIFECYCLE-BLOCKER)\b/i.test(
      body
    )
  ) {
    signals.push("runtime-main-thread-blocker");
  }
  if (/\bAXCLOUD-UI-TEST|AXCLOUD-UI-ACCESSIBILITY\b/i.test(body)) {
    signals.push("ui-test-evidence-gap");
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
  if (signals.includes("runtime-freeze-evidence")) return "cloud";
  if (signals.includes("runtime-evidence-missing")) return "cloud";
  if (signals.includes("ui-test-evidence-gap")) return "cloud";
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

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
