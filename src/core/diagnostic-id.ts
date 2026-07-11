import { createHash } from "node:crypto";
import type { Diagnostic } from "./types.js";

/**
 * A source-free identity that survives line movement while remaining scoped to
 * the rule, file, and normalized finding text.
 */
export function diagnosticFingerprint(
  diagnostic: Pick<Diagnostic, "code" | "file" | "message" | "evidenceClass">
): string {
  const stable = [
    diagnostic.code.trim().toUpperCase(),
    normalizeDiagnosticPath(diagnostic.file),
    diagnostic.evidenceClass ?? "unknown",
    normalizeDiagnosticMessage(diagnostic.message),
  ].join("\n");
  return `axf_${createHash("sha256").update(stable).digest("hex").slice(0, 20)}`;
}

function normalizeDiagnosticPath(file?: string): string {
  if (!file) return "unknown-file";
  return file.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").trim();
}

function normalizeDiagnosticMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}
