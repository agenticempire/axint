// Compute every headline metric directly from the source tree.
// `scripts/emit-metrics.mjs` writes the result; `scripts/check-metrics.mjs`
// compares it against the committed snapshot so CI catches drift.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function computeMetrics({ countTests = true } = {}) {
  const version = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")).version;
  const xcodeFixRules = collectXcodeFixRules();

  return {
    version,
    mcpTools: countExportedArray("src/mcp/manifest.ts", "TOOL_MANIFEST"),
    mcpToolNames: extractTopLevelNames("src/mcp/manifest.ts", "TOOL_MANIFEST"),
    mcpPrompts: countExportedArray("src/mcp/prompts.ts", "PROMPT_MANIFEST"),
    mcpPromptNames: extractTopLevelNames("src/mcp/prompts.ts", "PROMPT_MANIFEST"),
    bundledTemplates: countExportedArray("src/templates/index.ts", "TEMPLATES"),
    diagnostics: countUniqueDiagnostics(),
    xcodeFixRules: xcodeFixRules.count,
    xcodeFixRuleCodes: xcodeFixRules.codes,
    tests: countTests
      ? {
          typescript: runVitestCount(),
          python: runPytestCount(),
        }
      : { typescript: 0, python: 0 },
    // Kept as explicit constants — both depend on repos outside the compiler tree.
    // Update these when the corresponding surface ships a new package.
    registryPackages: 8,
    distributionSurfaces: 4,
  };
}

function extractTopLevelNames(relPath, symbol) {
  const src = readFileSync(resolve(ROOT, relPath), "utf-8");
  const anchor = new RegExp(`export\\s+const\\s+${symbol}[^=]*=\\s*\\[`, "m");
  const match = anchor.exec(src);
  if (!match) throw new Error(`${relPath}: no export const ${symbol} = [ ... ]`);
  const open = match.index + match[0].length - 1;
  const close = findArrayClose(src, open, relPath, symbol);
  const inner = src.slice(open + 1, close);

  return [...inner.matchAll(/^ {4}name:\s*"([^"]+)"/gm)].map((entry) => entry[1]);
}

function countExportedArray(relPath, symbol) {
  const src = readFileSync(resolve(ROOT, relPath), "utf-8");
  const anchor = new RegExp(`export\\s+const\\s+${symbol}[^=]*=\\s*\\[`, "m");
  const match = anchor.exec(src);
  if (!match) throw new Error(`${relPath}: no export const ${symbol} = [ ... ]`);
  const open = match.index + match[0].length - 1;
  const close = findArrayClose(src, open, relPath, symbol);
  const inner = src.slice(open + 1, close);
  const items = countTopLevelCommas(inner);
  return items === 0 ? (inner.trim() ? 1 : 0) : items + (endsWithTrailingComma(inner) ? 0 : 1);
}

function findArrayClose(src, open, relPath, symbol) {
  let depth = 0;
  let inString = null;
  let escaped = false;

  for (let i = open; i < src.length; i++) {
    const c = src[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === inString) inString = null;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }

    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") {
      depth--;
      if (depth === 0 && c === "]") {
        return i;
      }
    }
  }
  throw new Error(`${relPath}: unterminated ${symbol} array`);
}

function countTopLevelCommas(s) {
  let depth = 0;
  let inString = null;
  let escaped = false;
  let commas = 0;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if (c === "," && depth === 0) commas++;
  }
  return commas;
}

function endsWithTrailingComma(s) {
  const trimmed = s.trimEnd();
  return trimmed.endsWith(",");
}

function countUniqueDiagnostics() {
  const seen = new Set();
  const pattern = /code:\s*"(AX\d+)"/g;

  for (const file of walk(resolve(ROOT, "src/core"), ".ts")) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(pattern)) {
      seen.add(match[1]);
    }
  }

  return seen.size;
}

function collectXcodeFixRules() {
  const seen = new Set();
  const literalRulePattern = /code:\s*"(AX\d+)"/g;
  const bespokeRulePattern = /case\s+"(AX\d+)"/g;

  for (const match of readFileSync(resolve(ROOT, "src/core/swift-fix-rules.ts"), "utf-8").matchAll(
    literalRulePattern,
  )) {
    seen.add(match[1]);
  }

  for (const match of readFileSync(resolve(ROOT, "src/core/swift-fixer.ts"), "utf-8").matchAll(
    bespokeRulePattern,
  )) {
    seen.add(match[1]);
  }

  const codes = [...seen].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  return { count: codes.length, codes };
}

function runVitestCount() {
  // Use a standardized CI=1 discovery path so local-only watch tests stay
  // excluded everywhere without depending on a prebuilt dist/ tree.
  const vitestEntry = resolve(ROOT, "node_modules", "vitest", "vitest.mjs");

  const out = execFileSync(process.execPath, [vitestEntry, "list", "--json"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CI: "1" },
  });
  const jsonStart = out.indexOf("[");
  if (jsonStart === -1) {
    throw new Error("vitest list --json produced no array");
  }
  const data = JSON.parse(out.slice(jsonStart));
  return Array.isArray(data) ? data.length : 0;
}

function runPytestCount() {
  const pythonDir = resolve(ROOT, "python");
  try {
    statSync(resolve(pythonDir, "pyproject.toml"));
  } catch {
    return 0;
  }
  try {
    const out = runPython(["-m", "pytest", "-q"], pythonDir);
    const match = out.match(/(\d+)\s+passed(?:[,\s]|$)/);
    if (!match) {
      throw new Error("pytest output did not include a passing-test count");
    }
    return Number(match[1]);
  } catch {
    let total = 0;
    for (const file of walk(resolve(pythonDir, "tests"), ".py")) {
      const text = readFileSync(file, "utf-8");
      total += (text.match(/^\s*def\s+test_/gm) ?? []).length;
    }
    return total;
  }
}

function runPython(args, cwd) {
  const errors = [];
  for (const bin of ["python3", "python"]) {
    try {
      return execFileSync(bin, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      errors.push(`${bin}: ${error.message}`);
    }
  }
  throw new Error(`Unable to execute Python test runner\n${errors.join("\n")}`);
}

function* walk(dir, ...exts) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules" || name === "__pycache__") continue;
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      yield* walk(full, ...exts);
    } else if (exts.some((e) => name.endsWith(e))) {
      yield full;
    }
  }
}
