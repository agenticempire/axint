/**
 * Swift Fixer
 *
 * Takes a Swift source file plus the diagnostics reported by the Swift
 * validator and rewrites the source to fix the mechanical issues.
 *
 * Most rules are declared as data in swift-fix-rules.ts and dispatched
 * generically here. A handful of rules (line-based insertions, closure
 * unwrapping) need custom logic and live as bespoke functions at the
 * bottom of this file.
 *
 * This file is the source of truth. scripts/gen-swift-fixer.ts reads
 * the rules registry and emits AxintFixer.swift for the Xcode Source
 * Editor Extension, keeping the two implementations in lockstep.
 */

import type { Diagnostic } from "./types.js";
import { validateSwiftSource } from "./swift-validator.js";
import {
  REGEX_FIX_RULES,
  STRUCT_INJECT_FIX_RULES,
  type RegexFix,
  type StructInjectFix,
} from "./swift-fix-rules.js";

export interface FixResult {
  source: string;
  fixed: Diagnostic[];
  remaining: Diagnostic[];
}

const REGEX_RULES_BY_CODE = new Map(REGEX_FIX_RULES.map((r) => [r.code, r]));
const STRUCT_RULES_BY_CODE = new Map(STRUCT_INJECT_FIX_RULES.map((r) => [r.code, r]));

export function fixSwiftSource(source: string, file: string): FixResult {
  const initial = validateSwiftSource(source, file).diagnostics;

  let out = source;
  const fixed: Diagnostic[] = [];

  for (const d of initial) {
    const rewrite = applyFix(out, d);
    if (rewrite !== null && rewrite !== out) {
      out = rewrite;
      fixed.push(d);
    }
  }

  const remaining = validateSwiftSource(out, file).diagnostics;
  return { source: out, fixed, remaining };
}

function applyFix(source: string, d: Diagnostic): string | null {
  if (d.code === "AX704") return fixAppIntentTitle(source);

  const regexRule = REGEX_RULES_BY_CODE.get(d.code);
  if (regexRule) return applyRegexRule(source, regexRule);

  const structRule = STRUCT_RULES_BY_CODE.get(d.code);
  if (structRule) return applyStructInjectRule(source, structRule);

  switch (d.code) {
    case "AX721":
      return addMainActorToClass(source, d, "ObservableObject");
    case "AX722":
      return addMainActorToClass(source, d, "@Observable");
    case "AX716":
      return addImport(source, "AppIntents");
    case "AX717":
      return addImport(source, "WidgetKit");
    case "AX718":
      return addImport(source, "SwiftUI");
    case "AX724":
      return stripMainActorFromActor(source, d);
    case "AX728":
      return addFinalToClass(source, d);
    case "AX730":
      return stripRedundantMainActorRun(source);
    case "AX733":
      return stripMainActorFromView(source, d);
    case "AX737":
      return removeDuplicateStoredProperties(source);
    case "AX741":
    case "AX742":
      return addCodableHashableToContentState(source);
    case "AX748":
      return addImport(source, "ActivityKit");
    default:
      return null;
  }
}

// ─── Generic rule appliers ──────────────────────────────────────────

function applyRegexRule(source: string, rule: RegexFix): string {
  const re = new RegExp(rule.pattern, "g");
  const next = source.replace(re, rule.replacement);
  return next === source ? source : next;
}

function applyStructInjectRule(source: string, rule: StructInjectFix): string | null {
  const decl = new RegExp(
    `\\bstruct\\s+(\\w+)\\s*:\\s*[^{]*\\b${escapeRegex(rule.conformance)}\\b[^{]*\\{`,
    "g"
  );
  let m: RegExpExecArray | null;
  while ((m = decl.exec(source)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingBrace(source, openIdx);
    if (closeIdx === -1) continue;
    const body = source.slice(openIdx + 1, closeIdx);
    if (body.includes(rule.sentinel)) continue;
    return source.slice(0, openIdx + 1) + "\n" + rule.stub + source.slice(openIdx + 1);
  }
  return null;
}

function findMatchingBrace(source: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─── Bespoke fixes (line-based / callback replacement) ─────────────

function addMainActorToClass(
  source: string,
  d: Diagnostic,
  conformanceHint: string
): string | null {
  const lines = source.split("\n");
  if (!d.line || d.line > lines.length) return null;
  const idx = d.line - 1;
  const line = lines[idx];
  if (!line.includes(conformanceHint) && !/\bclass\s+\w+/.test(line)) return null;
  if (line.includes("@MainActor")) return source;
  const indent = line.match(/^\s*/)?.[0] ?? "";
  lines.splice(idx, 0, `${indent}@MainActor`);
  return lines.join("\n");
}

function fixAppIntentTitle(source: string): string | null {
  const decl = /\bstruct\s+(\w+)\s*:\s*[^{]*\bAppIntent\b[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = decl.exec(source)) !== null) {
    const openIdx = match.index + match[0].length - 1;
    const closeIdx = findMatchingBrace(source, openIdx);
    if (closeIdx === -1) continue;

    const body = source.slice(openIdx + 1, closeIdx);
    if (/\bstatic\s+var\s+title\s*:\s*LocalizedStringResource\b/.test(body)) {
      continue;
    }

    const rewritten = body.replace(
      /\bstatic\s+let\s+title\s*:\s*LocalizedStringResource\b/,
      "static var title: LocalizedStringResource"
    );
    if (rewritten !== body) {
      return source.slice(0, openIdx + 1) + rewritten + source.slice(closeIdx);
    }

    return (
      source.slice(0, openIdx + 1) +
      '\n    static var title: LocalizedStringResource = "Intent"' +
      source.slice(openIdx + 1)
    );
  }
  return null;
}

function stripMainActorFromActor(source: string, d: Diagnostic): string | null {
  if (!d.line) return null;
  const lines = source.split("\n");
  const idx = d.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const stripped = lines[idx].replace(/@MainActor\s*/g, "");
  if (stripped === lines[idx]) return source;
  lines[idx] = stripped;
  return lines.join("\n");
}

function addFinalToClass(source: string, d: Diagnostic): string | null {
  if (!d.line) return null;
  const lines = source.split("\n");
  const idx = d.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx];
  if (/\bfinal\s+class\b/.test(line)) return source;
  const next = line.replace(/\bclass\s+/, "final class ");
  if (next === line) return null;
  lines[idx] = next;
  return lines.join("\n");
}

function stripRedundantMainActorRun(source: string): string {
  return source.replace(/\bawait\s+MainActor\.run\s*\{([\s\S]*?)\}/g, (_, body) =>
    body.trim()
  );
}

function stripMainActorFromView(source: string, d: Diagnostic): string | null {
  if (!d.line) return null;
  const lines = source.split("\n");
  const idx = d.line - 1;
  for (let i = Math.max(0, idx - 2); i <= idx; i++) {
    if (/@MainActor/.test(lines[i])) {
      const stripped = lines[i].replace(/@MainActor\s*/g, "");
      if (stripped.trim() === "") {
        lines.splice(i, 1);
      } else {
        lines[i] = stripped;
      }
      return lines.join("\n");
    }
  }
  return null;
}

function removeDuplicateStoredProperties(source: string): string | null {
  const lines = source.split("\n");
  const seenStack: Array<Set<string>> = [];
  let depth = 0;
  let changed = false;

  const nextLines = lines.filter((line) => {
    const currentDepth = depth;
    if (!seenStack[currentDepth]) seenStack[currentDepth] = new Set<string>();

    const trimmed = line.trim();
    const match =
      currentDepth > 0 &&
      !trimmed.includes("{") &&
      !trimmed.includes("}") &&
      !/\bfunc\b|\binit\b|\bsubscript\b/.test(trimmed)
        ? line.match(
            /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)*(?:(?:public|private|fileprivate|internal|open|static|weak|unowned|nonisolated)\s+)*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/
          )
        : null;

    let keep = true;
    if (match?.[1]) {
      const properties = seenStack[currentDepth]!;
      if (properties.has(match[1])) {
        keep = false;
        changed = true;
      } else {
        properties.add(match[1]);
      }
    }

    for (const ch of line) {
      if (ch === "{") {
        depth++;
        if (!seenStack[depth]) seenStack[depth] = new Set<string>();
      } else if (ch === "}") {
        seenStack[depth]?.clear();
        depth = Math.max(0, depth - 1);
      }
    }

    return keep;
  });

  return changed ? nextLines.join("\n") : source;
}

function addCodableHashableToContentState(source: string): string {
  return source.replace(
    /\b(struct|class)\s+ContentState\s*(?::\s*([^{]+?))?\s*\{/,
    (_, kind, conformRaw) => {
      const existing = (conformRaw ?? "")
        .split(/[,&]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      for (const n of ["Codable", "Hashable"]) {
        if (!existing.includes(n)) existing.push(n);
      }
      return `${kind} ContentState: ${existing.join(", ")} {`;
    }
  );
}

function addImport(source: string, importName: string): string {
  if (new RegExp(`\\bimport\\s+${escapeRegex(importName)}\\b`).test(source))
    return source;
  const importRe = /^import\s+\w+.*$/gm;
  let lastIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx === -1) return `import ${importName}\n${source}`;
  return source.slice(0, lastIdx) + `\nimport ${importName}` + source.slice(lastIdx);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
