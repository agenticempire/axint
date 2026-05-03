/**
 * --diff-only support for Cloud Check.
 *
 * Why this exists. From dogfooding 2026-05-03: agents validate views,
 * find ambient pre-existing warnings unrelated to their diff, and either
 * waste a turn explaining them or absorb them as noise. The fix is a
 * simple filter — only report diagnostics on lines the agent actually
 * touched in this branch.
 *
 * Returns null when git isn't usable (no repo, no git binary, base ref
 * doesn't exist). Callers should treat null as "no filtering applied"
 * and pass the diagnostics through unchanged.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Diagnostic } from "../core/types.js";

export interface DiffOnlyOptions {
  /** Files to scope the diff to. Empty means all changed files. */
  files?: string[];
  /** Base ref to diff against. Defaults to HEAD (working-tree changes only). */
  baseRef?: string;
  /** Repository root. Defaults to process.cwd(). */
  cwd?: string;
}

export interface ChangedLines {
  /** path → set of 1-indexed line numbers that changed. */
  byFile: Map<string, Set<number>>;
  /** Files that appear in the diff with at least one changed line. */
  files: Set<string>;
}

/**
 * Run `git diff --unified=0 <baseRef>?` and parse hunk headers to extract
 * exactly which lines changed. Returns null if git isn't available or the
 * working directory isn't a git repo.
 */
export function loadChangedLines(options: DiffOnlyOptions = {}): ChangedLines | null {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!existsSync(cwd)) return null;

  const args = ["diff", "--unified=0", "--no-color", "--no-renames"];
  if (options.baseRef) args.push(options.baseRef);
  if (options.files && options.files.length > 0) {
    args.push("--", ...options.files);
  }

  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status === null && result.error) return null;
  if (result.status !== 0 && !result.stdout) return null;

  return parseUnifiedDiff(result.stdout, cwd);
}

const FILE_HEADER_RE = /^\+\+\+ b\/(.+)$/;
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(diff: string, cwd: string): ChangedLines {
  const byFile = new Map<string, Set<number>>();
  const files = new Set<string>();
  let currentFile: string | null = null;

  for (const rawLine of diff.split("\n")) {
    const fileMatch = FILE_HEADER_RE.exec(rawLine);
    if (fileMatch) {
      currentFile = resolve(cwd, fileMatch[1]!);
      if (!byFile.has(currentFile)) byFile.set(currentFile, new Set<number>());
      files.add(currentFile);
      continue;
    }
    if (!currentFile) continue;
    const hunkMatch = HUNK_HEADER_RE.exec(rawLine);
    if (!hunkMatch) continue;
    const start = Number(hunkMatch[1]!);
    const length = hunkMatch[2] !== undefined ? Number(hunkMatch[2]) : 1;
    if (length === 0) continue; // pure deletion — no lines to flag in the new file
    const set = byFile.get(currentFile)!;
    for (let i = 0; i < length; i++) set.add(start + i);
  }

  return { byFile, files };
}

/**
 * Filter a diagnostic list down to only those whose (file, line) appear
 * in the changed-lines map. Diagnostics with no line number are kept (they
 * are usually file-scoped and matter regardless of where the change is).
 *
 * Whole-file additions (the file appears in the diff but `byFile` shows no
 * specific line — usually because every line was added) keep all of their
 * diagnostics.
 */
export function filterDiagnosticsToDiff(
  diagnostics: Diagnostic[],
  changed: ChangedLines
): { kept: Diagnostic[]; suppressed: number } {
  const kept: Diagnostic[] = [];
  let suppressed = 0;
  for (const d of diagnostics) {
    if (!d.file) {
      kept.push(d);
      continue;
    }
    const resolvedFile = resolve(d.file);
    if (!changed.files.has(resolvedFile)) {
      // File untouched — suppress the diagnostic entirely.
      suppressed++;
      continue;
    }
    if (!d.line) {
      kept.push(d);
      continue;
    }
    const lines = changed.byFile.get(resolvedFile);
    if (!lines || lines.size === 0) {
      // File is in the diff but we have no per-line data (rare — usually
      // means a binary or a fully-new file). Keep the diagnostic; agent
      // touched the file.
      kept.push(d);
      continue;
    }
    if (lines.has(d.line)) {
      kept.push(d);
    } else {
      suppressed++;
    }
  }
  return { kept, suppressed };
}
