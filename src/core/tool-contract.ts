import type { Diagnostic } from "./types.js";

export type AxintToolContractStatus = "pass" | "warn" | "fail" | "needs_action";
export type AxintToolContractConfidence = "high" | "medium" | "low";

export type AxintToolContractVerdict =
  | "ready"
  | "ready_to_ship"
  | "ready_for_build"
  | "ready_to_prove"
  | "needs_action"
  | "needs_context"
  | "needs_review"
  | "evidence_required"
  | "fix_required"
  | "blocked"
  | "running";

export interface AxintToolContractDiagnostic {
  code?: string;
  severity: string;
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface AxintToolContract {
  schema: "https://axint.ai/schemas/tool-contract.v2.json";
  version: 2;
  tool: string;
  status: AxintToolContractStatus;
  verdict: AxintToolContractVerdict;
  confidence: AxintToolContractConfidence;
  summary: string;
  evidence: {
    provided: string[];
    missing: string[];
    checked: string[];
  };
  diagnostics: AxintToolContractDiagnostic[];
  nextAction: {
    label: string;
    command?: string;
    reason?: string;
  };
  safeCommand?: string;
  artifactPaths: string[];
  feedbackSignal?: {
    status: "none" | "available" | "recommended" | "required";
    reason: string;
    path?: string;
    fingerprint?: string;
    kind?: string;
    priority?: string;
  };
  outputMode: {
    default: "compact";
    sourceIncluded: boolean;
    sourceOptIn?: string;
  };
}

export interface BuildToolContractInput {
  tool: string;
  status: AxintToolContractStatus;
  verdict: AxintToolContractVerdict;
  confidence: AxintToolContractConfidence;
  summary: string;
  evidenceProvided?: string[];
  evidenceMissing?: string[];
  evidenceChecked?: string[];
  diagnostics?: AxintToolContractDiagnostic[];
  nextActionLabel?: string;
  nextActionCommand?: string;
  nextActionReason?: string;
  safeCommand?: string;
  artifactPaths?: Array<string | undefined>;
  feedbackSignal?: AxintToolContract["feedbackSignal"];
  sourceIncluded?: boolean;
  sourceOptIn?: string;
}

export function buildToolContract(input: BuildToolContractInput): AxintToolContract {
  const safeCommand =
    input.safeCommand ??
    input.nextActionCommand ??
    extractBacktickedCommand(input.nextActionLabel);
  return {
    schema: "https://axint.ai/schemas/tool-contract.v2.json",
    version: 2,
    tool: input.tool,
    status: input.status,
    verdict: input.verdict,
    confidence: input.confidence,
    summary: compactLine(input.summary),
    evidence: {
      provided: uniqueNonEmpty(input.evidenceProvided),
      missing: uniqueNonEmpty(input.evidenceMissing),
      checked: uniqueNonEmpty(input.evidenceChecked),
    },
    diagnostics: (input.diagnostics ?? []).slice(0, 12).map((diagnostic) => ({
      ...diagnostic,
      message: compactLine(diagnostic.message),
      suggestion: diagnostic.suggestion ? compactLine(diagnostic.suggestion) : undefined,
    })),
    nextAction: {
      label: compactLine(input.nextActionLabel ?? "No next action required."),
      command: input.nextActionCommand,
      reason: input.nextActionReason ? compactLine(input.nextActionReason) : undefined,
    },
    safeCommand,
    artifactPaths: uniqueNonEmpty(input.artifactPaths),
    feedbackSignal: input.feedbackSignal ?? {
      status: "none",
      reason: "No feedback signal was generated for this tool result.",
    },
    outputMode: {
      default: "compact",
      sourceIncluded: Boolean(input.sourceIncluded),
      sourceOptIn: input.sourceOptIn,
    },
  };
}

export function toolDiagnosticsFromDiagnostics(
  diagnostics: Diagnostic[],
  limit = 12
): AxintToolContractDiagnostic[] {
  return diagnostics.slice(0, limit).map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    file: diagnostic.file,
    line: diagnostic.line,
    message: diagnostic.message,
    suggestion: diagnostic.suggestion,
  }));
}

export function renderToolContractMarkdown(contract: AxintToolContract): string {
  const lines = [
    "## Tool Contract",
    `- Tool: ${contract.tool}`,
    `- Verdict: ${contract.verdict}`,
    `- Confidence: ${contract.confidence}`,
    `- Summary: ${contract.summary}`,
    `- Next action: ${contract.nextAction.label}`,
  ];
  if (contract.nextAction.reason) lines.push(`- Reason: ${contract.nextAction.reason}`);
  if (contract.safeCommand) lines.push(`- Safe command: \`${contract.safeCommand}\``);
  lines.push(
    `- Output: ${contract.outputMode.default}${contract.outputMode.sourceOptIn ? `; source opt-in ${contract.outputMode.sourceOptIn}` : ""}`
  );
  lines.push("", "### Evidence");
  lines.push(
    ...(contract.evidence.provided.length > 0
      ? contract.evidence.provided.slice(0, 6).map((item) => `- Provided: ${item}`)
      : ["- Provided: none"])
  );
  lines.push(
    ...(contract.evidence.missing.length > 0
      ? contract.evidence.missing.slice(0, 6).map((item) => `- Missing: ${item}`)
      : ["- Missing: none"])
  );
  lines.push(
    ...(contract.evidence.checked.length > 0
      ? contract.evidence.checked.slice(0, 6).map((item) => `- Checked: ${item}`)
      : ["- Checked: none"])
  );
  if (contract.diagnostics.length > 0) {
    lines.push("", "### Diagnostics");
    for (const diagnostic of contract.diagnostics.slice(0, 8)) {
      const where = diagnostic.file
        ? ` ${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}`
        : "";
      lines.push(
        `- ${diagnostic.code ?? "AXINT"} ${diagnostic.severity}${where}: ${diagnostic.message}`
      );
      if (diagnostic.suggestion) lines.push(`  Fix: ${diagnostic.suggestion}`);
    }
  }
  if (contract.artifactPaths.length > 0) {
    lines.push("", "### Artifacts");
    lines.push(...contract.artifactPaths.slice(0, 8).map((path) => `- ${path}`));
  }
  if (contract.feedbackSignal && contract.feedbackSignal.status !== "none") {
    lines.push(
      "",
      "### Feedback Signal",
      `- Status: ${contract.feedbackSignal.status}`,
      `- Reason: ${contract.feedbackSignal.reason}`
    );
    if (contract.feedbackSignal.fingerprint) {
      lines.push(`- Fingerprint: ${contract.feedbackSignal.fingerprint}`);
    }
    if (contract.feedbackSignal.path)
      lines.push(`- Path: ${contract.feedbackSignal.path}`);
  }
  return lines.join("\n");
}

export function extractBacktickedCommand(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.match(/`([^`]+)`/)?.[1];
}

export function uniqueNonEmpty(values: Array<string | undefined> | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function compactLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
