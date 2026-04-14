/**
 * Shared parsing helpers for Swift source analysis.
 *
 * The Swift validator family (core rules, concurrency, Live Activities)
 * all need the same lightweight primitives: strip comments, find type
 * declarations, match braces. Keeping them in one module avoids drift
 * and keeps each validator file focused on rules rather than parsing.
 */

import type { Diagnostic } from "./types.js";
import { getDiagnostic } from "./diagnostics.js";

export interface SwiftDeclaration {
  kind: "struct" | "class" | "actor" | "enum" | "extension";
  name: string;
  conformances: string[];
  attributes: string[];
  startLine: number;
  endLine: number;
  bodyStart: number;
  bodyEnd: number;
  source: string;
}

const DECL_REGEX =
  /\b(struct|class|actor|enum|extension)\s+([A-Za-z_][A-Za-z0-9_.]*)(?:\s*<[^>]*>)?\s*(?::\s*([^{]+?))?\s*\{/g;

export function findTypeDeclarations(
  stripped: string,
  original: string
): SwiftDeclaration[] {
  const decls: SwiftDeclaration[] = [];
  let match: RegExpExecArray | null;

  DECL_REGEX.lastIndex = 0;
  while ((match = DECL_REGEX.exec(stripped)) !== null) {
    const [full, kind, name, conformanceList] = match;
    const bodyStart = match.index + full.length;
    const bodyEnd = findMatchingBrace(stripped, bodyStart - 1);
    if (bodyEnd === -1) continue;

    const startLine = 1 + countNewlinesUpTo(stripped, match.index);
    const endLine = 1 + countNewlinesUpTo(stripped, bodyEnd);
    const attributes = attributesBefore(stripped, match.index);

    decls.push({
      kind: kind as SwiftDeclaration["kind"],
      name,
      conformances: parseConformances(conformanceList ?? ""),
      attributes,
      startLine,
      endLine,
      bodyStart,
      bodyEnd,
      source: original,
    });
  }

  return decls;
}

export function hasConformance(decl: SwiftDeclaration, protocolName: string): boolean {
  return decl.conformances.some((c) => c === protocolName);
}

export function hasAttribute(decl: SwiftDeclaration, attr: string): boolean {
  return decl.attributes.some((a) => a === attr || a.startsWith(`${attr}(`));
}

function parseConformances(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => s.split("&").map((p) => p.trim()));
}

/**
 * Walk backwards from the declaration keyword collecting attributes
 * (@MainActor, @Observable, @objc, etc.) that sit on the lines above it.
 * Also collects leading modifiers like `final`, `public`, `private`.
 */
function attributesBefore(source: string, declIdx: number): string[] {
  const attrs: string[] = [];
  let i = declIdx - 1;

  // Skip back over whitespace and modifiers on the same declaration.
  while (i >= 0) {
    // Skip whitespace.
    while (i >= 0 && /\s/.test(source[i])) i--;
    if (i < 0) break;

    // Try to read a token ending at i.
    const end = i + 1;
    let start = i;
    while (start > 0 && /[A-Za-z0-9_]/.test(source[start - 1])) start--;
    const token = source.slice(start, end);

    // Attribute: preceded by @.
    if (start > 0 && source[start - 1] === "@") {
      // May have parentheses after the token on the original line.
      // Scan forward from `end` to see if a balanced paren group follows
      // on the same line — include it in the attribute text.
      let attrEnd = end;
      let k = end;
      while (k < source.length && /\s/.test(source[k]) && source[k] !== "\n") k++;
      if (source[k] === "(") {
        let depth = 0;
        while (k < source.length) {
          if (source[k] === "(") depth++;
          else if (source[k] === ")") {
            depth--;
            if (depth === 0) {
              attrEnd = k + 1;
              break;
            }
          }
          k++;
        }
      }
      attrs.unshift("@" + source.slice(start, attrEnd));
      i = start - 2;
      continue;
    }

    // Modifier keywords that can precede struct/class/actor.
    if (
      token === "final" ||
      token === "public" ||
      token === "private" ||
      token === "internal" ||
      token === "fileprivate" ||
      token === "open" ||
      token === "indirect"
    ) {
      attrs.unshift(token);
      i = start - 1;
      continue;
    }

    break;
  }

  return attrs;
}

export function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function countNewlinesUpTo(source: string, index: number): number {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (source[i] === "\n") count++;
  }
  return count;
}

/**
 * Replace comments and string literals with spaces, preserving length
 * and line count so the declaration finder's line math stays accurate.
 */
export function stripCommentsAndStrings(source: string): string {
  const out: string[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out.push("  ");
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out.push(source[i] === "\n" ? "\n" : " ");
        i++;
      }
      if (i < n) {
        out.push("  ");
        i += 2;
      }
      continue;
    }
    if (ch === '"') {
      if (source.slice(i, i + 3) === '"""') {
        out.push("   ");
        i += 3;
        while (i < n && source.slice(i, i + 3) !== '"""') {
          out.push(source[i] === "\n" ? "\n" : " ");
          i++;
        }
        if (i < n) {
          out.push("   ");
          i += 3;
        }
        continue;
      }
      out.push(" ");
      i++;
      while (i < n && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < n) {
          out.push("  ");
          i += 2;
          continue;
        }
        out.push(source[i] === "\n" ? "\n" : " ");
        i++;
      }
      if (i < n) {
        out.push(" ");
        i++;
      }
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
}

export function makeDiagnostic(
  code: string,
  file: string,
  line: number,
  overrides: { message?: string; suggestion?: string }
): Diagnostic {
  const info = getDiagnostic(code);
  return {
    code,
    severity: info?.severity ?? "error",
    message: overrides.message ?? info?.message ?? code,
    file,
    line,
    suggestion: overrides.suggestion,
  };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
