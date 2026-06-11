/**
 * Human-facing diagnostic renderer (rust-style).
 *
 *   error[AX127]: Parameter "value" is declared param.string() but its default is the number 8
 *     --> intents/make-thing.ts:8:46
 *      |
 *    7 |   params: {
 *    8 |     value: param.string("Length", { default: 8 }),
 *      |                                              ^
 *     = help: Change the default to a string (e.g. "8"), or change the param to param.int(...).
 *
 * The snippet renders only when the caller can supply the original
 * source for the diagnostic's file; everything degrades gracefully to
 * the plain `--> file:line:col` form.
 */

import type { Diagnostic } from "../core/types.js";

export interface DiagnosticRenderContext {
  color: boolean;
  /** Original source text keyed by the file path diagnostics point at. */
  sources?: ReadonlyMap<string, string>;
}

const SEVERITY_ANSI: Record<Diagnostic["severity"], string> = {
  error: "\x1b[31m",
  warning: "\x1b[33m",
  info: "\x1b[36m",
};

export function renderDiagnostic(d: Diagnostic, ctx: DiagnosticRenderContext): string {
  const paint = (ansi: string, text: string) =>
    ctx.color ? `${ansi}${text}\x1b[0m` : text;

  const lines = [
    `  ${paint(SEVERITY_ANSI[d.severity], d.severity)}[${d.code}]: ${d.message}`,
  ];

  if (d.file) {
    const location = d.line
      ? d.column
        ? `${d.file}:${d.line}:${d.column}`
        : `${d.file}:${d.line}`
      : d.file;
    lines.push(`    --> ${location}`);
    lines.push(...renderSnippet(d, ctx, paint));
  }

  if (d.suggestion) {
    lines.push(`    = ${paint("\x1b[2m", "help:")} ${d.suggestion}`);
  }

  return lines.join("\n");
}

export function renderDiagnostics(
  diagnostics: Diagnostic[],
  ctx: DiagnosticRenderContext
): string[] {
  return diagnostics.map((d) => renderDiagnostic(d, ctx));
}

function renderSnippet(
  d: Diagnostic,
  ctx: DiagnosticRenderContext,
  paint: (ansi: string, text: string) => string
): string[] {
  if (!d.file || !d.line) return [];
  const source = ctx.sources?.get(d.file);
  if (!source) return [];

  const allLines = source.split(/\r?\n/);
  const target = allLines[d.line - 1];
  if (target === undefined) return [];

  const width = String(d.line).length;
  const bar = `   ${" ".repeat(width)} ${paint("\x1b[2m", "|")}`;
  const codeRow = (line: number, text: string) =>
    `   ${paint("\x1b[2m", `${String(line).padStart(width)} |`)} ${text}`;

  const rows = [bar];
  const previous = d.line > 1 ? allLines[d.line - 2] : undefined;
  if (previous !== undefined && previous.trim().length > 0) {
    rows.push(codeRow(d.line - 1, previous));
  }
  rows.push(codeRow(d.line, target));

  if (d.column && d.column <= target.length + 1) {
    const marker = `^${"~".repeat(Math.max(0, underlineLength(target, d.column) - 1))}`;
    rows.push(
      `${bar} ${" ".repeat(d.column - 1)}${paint(SEVERITY_ANSI[d.severity], marker)}`
    );
  }

  return rows;
}

/**
 * Underline the token starting at the caret: a full string literal when
 * the caret sits on a quote, otherwise the contiguous identifier/number.
 */
function underlineLength(lineText: string, column: number): number {
  const rest = lineText.slice(column - 1);
  if (!rest) return 1;

  const first = rest[0];
  if (first === '"' || first === "'" || first === "`") {
    const close = rest.indexOf(first, 1);
    if (close > 0) return close + 1;
  }

  const token = rest.match(/^[A-Za-z0-9_$.]+/);
  return token ? token[0].length : 1;
}
