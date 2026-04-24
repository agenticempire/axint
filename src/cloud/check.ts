import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAnySource } from "../core/compiler.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import type { CompilerOutput, Diagnostic } from "../core/types.js";

export type CloudCheckFormat = "markdown" | "json" | "prompt";
export type CloudCheckLanguage = "swift" | "typescript" | "unknown";
export type CloudCheckStatus = "pass" | "needs_review" | "fail";

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
  return report;
}

export function renderCloudCheckReport(
  report: CloudCheckReport,
  format: CloudCheckFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "prompt") return report.repairPrompt;

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
