/**
 * Axint DSL — Diagnostic record
 *
 * Exact mirror of spec/language/diagnostic-protocol.md. The schemaVersion is
 * pinned to 1; any additive change bumps the protocol version (see
 * spec/language/README.md on versioning).
 *
 * Two shapes live here because the protocol is the external contract:
 *   - `Position` and `Span` match the JSON the compiler emits under
 *     `axint check --format=json` — 1-indexed line/column, end exclusive.
 *   - The internal lexer/parser span (byte offsets + line/column) lives in
 *     `token.ts` as `TokenSpan`. Converting between them is a pure function
 *     and happens at the diagnostic-emission boundary so internal code can
 *     keep using byte offsets for slicing and the formatter.
 *
 * Diagnostics are data, not exceptions. The parser returns them alongside a
 * best-effort AST so one parse pass yields every repairable signal a caller
 * needs (see spec/language/parser-recovery.md).
 */

/**
 * Pinned schema version for the diagnostic record shape. Consumers that
 * parse JSON diagnostics must refuse records with an unknown version.
 */
export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;

/** 1-indexed line and column. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/** Half-open range: `end` is exclusive. A zero-width span is an insertion point. */
export interface Span {
  readonly start: Position;
  readonly end: Position;
}

/** Matches the spec — no `info` tier in v1. */
export type DiagnosticSeverity = "error" | "warning";

/**
 * Closed fix-kind taxonomy. Six kinds, exhaustive — changing this set is a
 * schemaVersion bump. See diagnostic-protocol.md §Fix kinds.
 */
export type FixKind =
  | "insert_required_clause"
  | "remove_field"
  | "replace_literal"
  | "change_type"
  | "rename_identifier"
  | "replace_identifier";

/**
 * A machine-readable repair hint. `suggestedEdit.text` is present when the
 * compiler can synthesize the full replacement; `candidates` is present when
 * the target resolves to a closed set of valid identifiers.
 *
 * Applying the edit is textual: replace the bytes at `targetSpan` with
 * `suggestedEdit.text`. For insertion kinds, `targetSpan` is zero-width at
 * the insertion point.
 */
export interface Fix {
  readonly kind: FixKind;
  readonly targetSpan: Span;
  readonly suggestedEdit?: { readonly text: string };
  readonly candidates?: readonly string[];
}

export interface Diagnostic {
  readonly schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  /** One of the codes in spec/language/diagnostics.md. */
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  /** One sentence. Wording may change without a protocol bump. */
  readonly message: string;
  /** Path relative to the project root — reported verbatim by the compiler. */
  readonly file: string;
  readonly span: Span;
  /**
   * Always present. `null` when no principled author-side fix exists
   * (compiler-bug codes AX200–AX202, registry code AX600). Every other
   * diagnostic carries a `Fix` with a `kind` and a `targetSpan`.
   */
  readonly fix: Fix | null;
}
