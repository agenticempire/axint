/**
 * axint xcode fix — Auto-fix mechanical Swift issues caught by the validator.
 *
 * Reads .swift files, runs the validator, applies mechanical fixes for the
 * subset of diagnostics that have unambiguous rewrites (e.g. `@State let` →
 * `@State var`, injecting a `perform()` stub into an AppIntent). Dry-run by
 * default — pass `--apply` to write the changes back to disk.
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join, extname, relative } from "node:path";
import { fixSwiftSourceMultipass } from "../core/swift-fixer.js";
import type { Diagnostic } from "../core/types.js";

const ORANGE = "\x1b[38;5;208m";
const GREEN = "\x1b[38;5;82m";
const RED = "\x1b[38;5;196m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

interface FixOptions {
  apply: boolean;
  quiet?: boolean;
}

interface FileResult {
  file: string;
  fixed: Diagnostic[];
  remaining: Diagnostic[];
  rewritten: boolean;
  iterations: number;
  quiescent: boolean;
}

export async function runXcodeFix(pathArg: string, options: FixOptions) {
  const target = resolve(pathArg);
  const files = collectSwiftFiles(target);

  if (files.length === 0) {
    console.error(`${RED}error:${RESET} no .swift files found at ${pathArg}`);
    process.exit(1);
  }

  const results: FileResult[] = [];
  for (const file of files) {
    const original = readFileSync(file, "utf-8");
    const result = fixSwiftSourceMultipass(original, file);

    const rewritten = result.fixed.length > 0;
    if (rewritten && options.apply) {
      writeFileSync(file, result.source, "utf-8");
    }

    results.push({
      file,
      fixed: result.fixed,
      remaining: result.remaining,
      rewritten,
      iterations: result.iterations,
      quiescent: result.quiescent,
    });
  }

  printReport(results, options, target);

  const remainingErrors = results
    .flatMap((r) => r.remaining)
    .filter((d) => d.severity === "error");

  if (remainingErrors.length > 0) {
    process.exit(1);
  }
}

function printReport(results: FileResult[], options: FixOptions, _root: string) {
  const totalFixed = results.reduce((n, r) => n + r.fixed.length, 0);
  const totalRemaining = results.reduce((n, r) => n + r.remaining.length, 0);
  const touched = results.filter((r) => r.rewritten);

  console.log();
  console.log(
    `  ${ORANGE}◆${RESET} ${BOLD}axint xcode fix${RESET} ${DIM}· ${results.length} file${results.length === 1 ? "" : "s"} scanned${RESET}`
  );
  console.log();

  if (totalFixed === 0 && totalRemaining === 0) {
    console.log(`  ${GREEN}✓${RESET} nothing to fix — Swift sources look clean`);
    console.log();
    return;
  }

  for (const r of touched) {
    const rel = relative(process.cwd(), r.file);
    console.log(`  ${BOLD}${rel}${RESET}`);
    for (const d of r.fixed) {
      console.log(`    ${GREEN}fix${RESET} ${DIM}[${d.code}]${RESET} ${d.message}`);
    }
    const stillBroken = r.remaining.filter((d) => d.severity === "error");
    for (const d of stillBroken) {
      console.log(`    ${RED}skip${RESET} ${DIM}[${d.code}]${RESET} ${d.message}`);
    }
    console.log();
  }

  for (const r of results.filter((x) => !x.rewritten && x.remaining.length > 0)) {
    const rel = relative(process.cwd(), r.file);
    console.log(`  ${BOLD}${rel}${RESET}`);
    for (const d of r.remaining) {
      const colour = d.severity === "error" ? RED : YELLOW;
      console.log(
        `    ${colour}${d.severity}${RESET} ${DIM}[${d.code}]${RESET} ${d.message}`
      );
      if (d.suggestion) {
        console.log(`      ${DIM}help: ${d.suggestion}${RESET}`);
      }
    }
    console.log();
  }

  const verb = options.apply ? "applied" : "would apply";
  const maxPasses = results.reduce((n, r) => Math.max(n, r.iterations), 0);
  const passSuffix = maxPasses > 1 ? ` over up to ${maxPasses} passes` : "";
  console.log(
    `  ${verb} ${BOLD}${totalFixed}${RESET} fix${totalFixed === 1 ? "" : "es"} across ${touched.length} file${touched.length === 1 ? "" : "s"}${passSuffix}`
  );

  const nonQuiescent = results.filter((r) => !r.quiescent && r.fixed.length > 0);
  if (nonQuiescent.length > 0) {
    console.log(
      `  ${YELLOW}note${RESET} ${DIM}${nonQuiescent.length} file${nonQuiescent.length === 1 ? "" : "s"} hit the iteration cap; rerun to keep applying fixes${RESET}`
    );
  }

  if (!options.apply && totalFixed > 0) {
    console.log(`  ${DIM}re-run with --apply to write changes${RESET}`);
  }

  const remainingErrors = results
    .flatMap((r) => r.remaining)
    .filter((d) => d.severity === "error").length;
  if (remainingErrors > 0) {
    console.log(
      `  ${RED}${remainingErrors} error${remainingErrors === 1 ? "" : "s"} remain${RESET} ${DIM}(non-mechanical — fix by hand)${RESET}`
    );
  }
  console.log();
}

function collectSwiftFiles(target: string): string[] {
  const stat = safeStat(target);
  if (!stat) return [];
  if (stat.isFile()) return target.endsWith(".swift") ? [target] : [];
  const out: string[] = [];
  walk(target, out);
  return out;
}

function safeStat(target: string) {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules" || entry.name === ".build") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && extname(entry.name) === ".swift") out.push(full);
  }
}
