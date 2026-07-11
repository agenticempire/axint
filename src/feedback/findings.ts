import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { normalizeDiagnosticEvidence } from "../core/diagnostic-evidence.js";
import type { Diagnostic, DiagnosticFeedbackVerdict } from "../core/types.js";

export interface FindingFeedbackRecord {
  schema: "https://axint.ai/schemas/finding-feedback.v1.json";
  findingId: string;
  code: string;
  file?: string;
  message: string;
  verdict: DiagnosticFeedbackVerdict;
  note?: string;
  receiptId?: string;
  recordedAt: string;
  privacy: {
    sourceIncluded: false;
    sourceSharing: "never_by_default";
  };
}

export interface FindingFeedbackWriteResult {
  record: FindingFeedbackRecord;
  path: string;
}

export interface FindingFeedbackListResult {
  cwd: string;
  records: FindingFeedbackRecord[];
  directory: string;
}

export function applyFindingFeedback(
  diagnostics: Diagnostic[],
  cwd: string
): Diagnostic[] {
  const records = new Map(
    listFindingFeedback(cwd).records.map((record) => [record.findingId, record])
  );

  return diagnostics.map((raw) => {
    const diagnostic = normalizeDiagnosticEvidence(raw);
    const record = records.get(diagnostic.id!);
    if (!record) return diagnostic;

    const canSuppress = diagnostic.confidence !== "confirmed";
    const suppresses =
      canSuppress &&
      (record.verdict === "irrelevant" || record.verdict === "false-positive");
    const summary = suppresses
      ? `Project feedback marked this finding ${record.verdict}; it remains visible but does not gate this receipt.`
      : record.verdict === "accurate"
        ? "Project feedback marked this finding accurate."
        : `Project feedback marked this finding ${record.verdict}, but stronger evidence now confirms it, so it remains active.`;

    return {
      ...diagnostic,
      ...(suppresses
        ? {
            status: "suppressed" as const,
            severity: "info" as const,
            blocking: false,
          }
        : {}),
      feedback: {
        verdict: record.verdict,
        recordedAt: record.recordedAt,
        note: record.note,
        receiptId: record.receiptId,
        applied: suppresses || record.verdict === "accurate",
      },
      evidence: [
        ...(diagnostic.evidence ?? []),
        {
          source: "developer-feedback" as const,
          relation: suppresses ? ("contradicts" as const) : ("context" as const),
          summary,
        },
      ],
    };
  });
}

export function writeFindingFeedback(input: {
  cwd?: string;
  diagnostic: Diagnostic;
  verdict: DiagnosticFeedbackVerdict;
  note?: string;
  receiptId?: string;
}): FindingFeedbackWriteResult {
  const cwd = resolve(input.cwd ?? process.cwd());
  const diagnostic = normalizeDiagnosticEvidence(input.diagnostic);
  const record: FindingFeedbackRecord = {
    schema: "https://axint.ai/schemas/finding-feedback.v1.json",
    findingId: diagnostic.id!,
    code: diagnostic.code,
    file: diagnostic.file,
    message: diagnostic.message,
    verdict: input.verdict,
    note: input.note,
    receiptId: input.receiptId,
    recordedAt: new Date().toISOString(),
    privacy: {
      sourceIncluded: false,
      sourceSharing: "never_by_default",
    },
  };
  const directory = feedbackDirectory(cwd);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${record.findingId}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return { record, path };
}

export function writeFindingFeedbackFromReceipt(input: {
  cwd?: string;
  receiptPath: string;
  identifier: string;
  verdict: DiagnosticFeedbackVerdict;
  note?: string;
}): FindingFeedbackWriteResult {
  const receiptPath = resolve(input.cwd ?? process.cwd(), input.receiptPath);
  const parsed = JSON.parse(readFileSync(receiptPath, "utf-8")) as unknown;
  const { receiptId, diagnostics } = diagnosticsFromReceipt(parsed);
  const matches = diagnostics.filter(
    (diagnostic) =>
      diagnostic.id === input.identifier ||
      diagnostic.code === input.identifier.toUpperCase()
  );
  if (matches.length === 0) {
    throw new Error(
      `No finding '${input.identifier}' exists in ${basename(receiptPath)}.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Finding code '${input.identifier}' is ambiguous in this receipt. Use one of: ${matches
        .map((diagnostic) => diagnostic.id)
        .join(", ")}`
    );
  }
  return writeFindingFeedback({
    cwd: input.cwd,
    diagnostic: matches[0]!,
    verdict: input.verdict,
    note: input.note,
    receiptId,
  });
}

export function listFindingFeedback(cwd = process.cwd()): FindingFeedbackListResult {
  const resolvedCwd = resolve(cwd);
  const directory = feedbackDirectory(resolvedCwd);
  if (!existsSync(directory)) return { cwd: resolvedCwd, records: [], directory };
  const records = readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const record = JSON.parse(
          readFileSync(join(directory, file), "utf-8")
        ) as FindingFeedbackRecord;
        return record.schema === "https://axint.ai/schemas/finding-feedback.v1.json"
          ? [record]
          : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  return { cwd: resolvedCwd, records, directory };
}

export function removeFindingFeedback(cwd: string, findingId: string): boolean {
  const path = join(feedbackDirectory(resolve(cwd)), `${findingId}.json`);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

function feedbackDirectory(cwd: string): string {
  return resolve(cwd, ".axint/feedback/findings");
}

function diagnosticsFromReceipt(value: unknown): {
  receiptId?: string;
  diagnostics: Diagnostic[];
} {
  if (!value || typeof value !== "object") {
    throw new Error("Receipt must be a JSON object.");
  }
  const object = value as Record<string, unknown>;
  const payload =
    object.payload && typeof object.payload === "object"
      ? (object.payload as Record<string, unknown>)
      : object;
  const findings = Array.isArray(payload.findings)
    ? payload.findings
    : payload.swiftValidation && typeof payload.swiftValidation === "object"
      ? (payload.swiftValidation as Record<string, unknown>).diagnostics
      : undefined;
  if (!Array.isArray(findings)) {
    throw new Error("Receipt does not contain a findings array.");
  }
  return {
    receiptId: typeof payload.id === "string" ? payload.id : undefined,
    diagnostics: findings.filter(isDiagnostic),
  };
}

function isDiagnostic(value: unknown): value is Diagnostic {
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  return (
    typeof object.code === "string" &&
    typeof object.message === "string" &&
    typeof object.severity === "string"
  );
}
