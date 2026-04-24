import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAnySource } from "../core/compiler.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import type { CompilerOutput, Diagnostic } from "../core/types.js";

export type CloudCheckFormat = "markdown" | "json" | "prompt" | "feedback";
export type CloudCheckLanguage = "swift" | "typescript" | "unknown";
export type CloudCheckStatus = "pass" | "needs_review" | "fail";
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

export interface CloudCheckInput {
  source?: string;
  sourcePath?: string;
  fileName?: string;
  language?: CloudCheckLanguage;
}

export interface CloudCheckReport {
  id: string;
  status: CloudCheckStatus;
  label: string;
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

  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const infos = diagnostics.filter((d) => d.severity === "info").length;
  const status: CloudCheckStatus =
    errors > 0 ? "fail" : warnings > 0 ? "needs_review" : "pass";
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
            : "No blocking Apple-facing issues were found.",
    },
  ] satisfies CloudCheckReport["checks"];

  const nextSteps = diagnostics
    .filter((d) => d.severity !== "info")
    .slice(0, 4)
    .map((d) => d.suggestion || d.message);

  if (nextSteps.length === 0) {
    nextSteps.push(
      "Keep the current behavior and rerun Cloud Check after the next generated change."
    );
    nextSteps.push(
      "If this came from an agent, move the generated Swift into Xcode and run the project build."
    );
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
    `- Diagnostics: ${report.errors} errors, ${report.warnings} warnings, ${report.infos} info`,
    "",
    "## Checks",
    ...report.checks.map((check) => `- ${check.label}: ${check.detail}`),
    "",
    "## Next Steps",
    ...report.nextSteps.map((step) => `- ${step}`),
  ];

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

function labelForStatus(status: CloudCheckStatus): string {
  if (status === "pass") return "Pass";
  if (status === "needs_review") return "Needs review";
  return "Fail";
}

function buildCloudRepairPrompt(report: CloudCheckReport): string {
  const actionable = report.diagnostics.filter((d) => d.severity !== "info").slice(0, 4);

  if (actionable.length === 0) {
    return [
      `Review ${report.fileName}.`,
      "Axint Cloud Check did not find blocking Apple-facing issues.",
      "Preserve the feature behavior and rerun Cloud Check after the next agent edit.",
    ].join("\n");
  }

  return [
    `Fix the Apple-facing issues in ${report.fileName} without changing the user's intended feature behavior.`,
    `Surface: ${report.surface}`,
    "",
    "Address these findings:",
    ...actionable.map(
      (d) => `- ${d.code}: ${d.message}${d.suggestion ? ` Fix: ${d.suggestion}` : ""}`
    ),
    "",
    "After editing, rerun `axint cloud check --source <file>` and then build in Xcode.",
  ].join("\n");
}

function buildCloudLearningSignal(
  report: CloudCheckReport
): CloudLearningSignal | undefined {
  if (report.status === "pass" || report.diagnostics.length === 0) {
    return undefined;
  }

  const diagnosticCodes = unique(report.diagnostics.map((d) => d.code));
  const diagnosticSummary = report.diagnostics
    .slice(0, 5)
    .map((d) => `${d.code}:${d.severity}:${normalizeDiagnosticText(d.message)}`)
    .join("|");
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
  if (owner === "swift-validator") {
    const firstCode = report.diagnostics[0]?.code ?? "the diagnostic";
    return `Review ${firstCode} severity and repair guidance against current Apple SDK behavior.`;
  }
  return "Cluster this signal with matching fingerprints and convert repeated failures into a test-backed compiler issue.";
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
