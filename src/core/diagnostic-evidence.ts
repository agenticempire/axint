import { basename } from "node:path";
import { getDiagnosticEvidencePolicy } from "./diagnostics.js";
import { diagnosticFingerprint } from "./diagnostic-id.js";
import type {
  Diagnostic,
  DiagnosticConfidence,
  DiagnosticEvidence,
  DiagnosticSeverity,
} from "./types.js";

export interface DiagnosticEvidenceInput {
  build?: {
    command?: string;
    exitCode: number | null;
    stdout?: string;
    stderr?: string;
    artifactPath?: string;
    dryRun?: boolean;
  };
  tests?: {
    command?: string;
    exitCode: number | null;
    stdout?: string;
    stderr?: string;
    artifactPath?: string;
    dryRun?: boolean;
  };
  advisoryOnly?: boolean;
}

export interface DiagnosticEvidenceSummary {
  total: number;
  confirmed: number;
  probable: number;
  advisory: number;
  suppressed: number;
  blocking: number;
}

interface CompilerFinding {
  file?: string;
  line?: number;
  severity: "error" | "warning";
  message: string;
}

export function normalizeDiagnosticEvidence(diagnostic: Diagnostic): Diagnostic {
  const policy = getDiagnosticEvidencePolicy(diagnostic.code);
  const originalSeverity = diagnostic.originalSeverity ?? diagnostic.severity;
  const confidence = diagnostic.confidence ?? policy.confidence;
  const status = diagnostic.status ?? "active";
  return {
    ...diagnostic,
    id: diagnostic.id ?? diagnosticFingerprint(diagnostic),
    originalSeverity,
    confidence,
    status,
    blocking:
      diagnostic.blocking ??
      (status === "active" && originalSeverity === "error" && confidence !== "advisory"),
    evidenceClass: diagnostic.evidenceClass ?? policy.evidenceClass,
    evidence: diagnostic.evidence ?? [
      {
        source: policy.evidenceClass === "project" ? "project-index" : "axint-static",
        relation: "supports",
        summary:
          confidence === "confirmed"
            ? "Axint deterministic analysis confirmed this finding."
            : confidence === "advisory"
              ? "Axint heuristic identified a review lead."
              : "Axint static analysis identified a probable finding.",
      },
    ],
  };
}

export function reconcileDiagnosticsWithEvidence(
  diagnostics: Diagnostic[],
  input: DiagnosticEvidenceInput = {}
): Diagnostic[] {
  const buildFindings = parseCompilerFindings(
    `${input.build?.stdout ?? ""}\n${input.build?.stderr ?? ""}`
  );
  const buildPassed =
    input.build !== undefined &&
    input.build.dryRun !== true &&
    input.build.exitCode === 0;
  const buildFailed =
    input.build !== undefined &&
    input.build.dryRun !== true &&
    input.build.exitCode !== null &&
    input.build.exitCode !== 0;
  const testsPassed =
    input.tests !== undefined &&
    input.tests.dryRun !== true &&
    input.tests.exitCode === 0;

  return diagnostics.map((raw) => {
    const diagnostic = normalizeDiagnosticEvidence(raw);
    const policy = getDiagnosticEvidencePolicy(diagnostic.code);
    const match = buildFindings.find((finding) =>
      compilerFindingMatches(diagnostic, finding)
    );
    let next = diagnostic;

    if (match && buildFailed) {
      next = withEvidence(next, {
        source: "xcode-build",
        relation: "supports",
        summary: `Xcode emitted a matching ${match.severity} at the same source location: ${match.message}`,
        command: input.build?.command,
        artifactPath: input.build?.artifactPath,
      });
      next = {
        ...next,
        confidence: "confirmed",
        status: "active",
        severity: next.originalSeverity ?? next.severity,
        blocking: (next.originalSeverity ?? next.severity) === "error",
      };
    } else if (buildPassed && policy.compilerContradictable) {
      next = withEvidence(next, {
        source: "xcode-build",
        relation: "contradicts",
        summary:
          "The selected Xcode build succeeded, so this compiler-shaped static finding is suppressed for this receipt.",
        command: input.build?.command,
        artifactPath: input.build?.artifactPath,
      });
      next = {
        ...next,
        status: "suppressed",
        severity: "info",
        blocking: false,
      };
    }

    if (testsPassed && next.status !== "suppressed") {
      next = withEvidence(next, {
        source: "xcode-test",
        relation: "context",
        summary:
          "The selected Xcode tests passed. This is supporting behavior evidence, but it does not automatically disprove advisory accessibility, design, or runtime findings.",
        command: input.tests?.command,
        artifactPath: input.tests?.artifactPath,
      });
    }

    if (input.advisoryOnly) {
      next = {
        ...next,
        blocking: false,
      };
    }

    return next;
  });
}

export function isDiagnosticBlocking(diagnostic: Diagnostic): boolean {
  if (diagnostic.status === "suppressed") return false;
  if (typeof diagnostic.blocking === "boolean") return diagnostic.blocking;
  return diagnostic.severity === "error" && diagnostic.confidence !== "advisory";
}

export function summarizeDiagnosticEvidence(
  diagnostics: Diagnostic[]
): DiagnosticEvidenceSummary {
  const normalized = diagnostics.map(normalizeDiagnosticEvidence);
  return {
    total: normalized.length,
    confirmed: normalized.filter(
      (diagnostic) =>
        diagnostic.status !== "suppressed" && diagnostic.confidence === "confirmed"
    ).length,
    probable: normalized.filter(
      (diagnostic) =>
        diagnostic.status !== "suppressed" && diagnostic.confidence === "probable"
    ).length,
    advisory: normalized.filter(
      (diagnostic) =>
        diagnostic.status !== "suppressed" && diagnostic.confidence === "advisory"
    ).length,
    suppressed: normalized.filter((diagnostic) => diagnostic.status === "suppressed")
      .length,
    blocking: normalized.filter(isDiagnosticBlocking).length,
  };
}

export function diagnosticConfidenceLabel(diagnostic: Diagnostic): string {
  if (diagnostic.status === "suppressed") return "suppressed";
  return diagnostic.confidence ?? "probable";
}

function withEvidence(diagnostic: Diagnostic, evidence: DiagnosticEvidence): Diagnostic {
  return {
    ...diagnostic,
    evidence: [...(diagnostic.evidence ?? []), evidence],
  };
}

function parseCompilerFindings(output: string): CompilerFinding[] {
  const findings: CompilerFinding[] = [];
  const pattern = /^(.*?\.swift):(\d+)(?::\d+)?:\s*(error|warning):\s*(.+)$/gm;
  for (const match of output.matchAll(pattern)) {
    findings.push({
      file: match[1],
      line: Number(match[2]),
      severity: match[3] as "error" | "warning",
      message: match[4]!.trim(),
    });
  }
  return findings;
}

function compilerFindingMatches(
  diagnostic: Diagnostic,
  finding: CompilerFinding
): boolean {
  if (!diagnostic.file || !finding.file) return false;
  const sameFile =
    diagnostic.file === finding.file ||
    basename(diagnostic.file) === basename(finding.file);
  if (!sameFile) return false;
  if (diagnostic.line === undefined || finding.line === undefined) return true;
  return Math.abs(diagnostic.line - finding.line) <= 2;
}

export function effectiveDiagnosticSeverity(diagnostic: Diagnostic): DiagnosticSeverity {
  return diagnostic.status === "suppressed" ? "info" : diagnostic.severity;
}

export function strongestDiagnosticConfidence(
  diagnostics: Diagnostic[]
): DiagnosticConfidence | undefined {
  const active = diagnostics.filter((diagnostic) => diagnostic.status !== "suppressed");
  if (active.some((diagnostic) => diagnostic.confidence === "confirmed")) {
    return "confirmed";
  }
  if (active.some((diagnostic) => diagnostic.confidence === "probable")) {
    return "probable";
  }
  if (active.some((diagnostic) => diagnostic.confidence === "advisory")) {
    return "advisory";
  }
  return undefined;
}
