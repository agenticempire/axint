// Compute every headline metric directly from the source tree.
// `scripts/emit-metrics.mjs` writes the result; `scripts/check-metrics.mjs`
// compares it against the committed snapshot so CI catches drift.

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function computeMetrics({ countTests = true } = {}) {
  const version = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")).version;

  return {
    version,
    mcpTools: countExportedArray("src/mcp/manifest.ts", "TOOL_MANIFEST"),
    mcpPrompts: countExportedArray("src/mcp/prompts.ts", "PROMPT_MANIFEST"),
    bundledTemplates: countExportedArray("src/templates/index.ts", "TEMPLATES"),
    diagnostics: countUniqueDiagnostics(),
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

function countExportedArray(relPath, symbol) {
  const src = readFileSync(resolve(ROOT, relPath), "utf-8");
  const anchor = new RegExp(`export\\s+const\\s+${symbol}[^=]*=\\s*\\[`, "m");
  const match = anchor.exec(src);
  if (!match) throw new Error(`${relPath}: no export const ${symbol} = [ ... ]`);
  const open = match.index + match[0].length - 1;

  let depth = 0;
  let items = 0;
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
        // Count top-level commas inside the array. Trailing commas don't add an item.
        const inner = src.slice(open + 1, i);
        items = countTopLevelCommas(inner);
        return items === 0 ? (inner.trim() ? 1 : 0) : items + (endsWithTrailingComma(inner) ? 0 : 1);
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

function runVitestCount() {
  const out = execSync("npx vitest list --json", {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const jsonStart = out.indexOf("[");
  if (jsonStart === -1) throw new Error("vitest list --json produced no array");
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
    const out = execSync("python -m pytest --collect-only -q", {
      cwd: pythonDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const match = out.match(/(\d+)\s+tests?\s+collected/);
    if (match) return Number(match[1]);
    return out.split("\n").filter((line) => line.includes("::test_")).length;
  } catch {
    // pytest not installed locally — fall back to static grep so the snapshot
    // stays deterministic between dev machines and CI
    let total = 0;
    for (const file of walk(resolve(pythonDir, "tests"), ".py")) {
      const text = readFileSync(file, "utf-8");
      total += (text.match(/^\s*def\s+test_/gm) ?? []).length;
    }
    return total;
  }
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
