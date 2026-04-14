/**
 * Bridge to the axint-syntax helper binary (tools/swift-syntax-helper).
 *
 * The helper is a Swift executable built with apple/swift-syntax that
 * replaces regex scanning for rules the AST handles more accurately —
 * nested types, comment-aware parsing, multi-line declarations.
 *
 * When the binary isn't available (Linux, Windows, or a fresh checkout
 * without a release build), this module returns `null` so the caller
 * can fall back to the regex validator. That's deliberate: the AST path
 * is an optimization, not a hard dependency.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic } from "./types.js";

interface HelperDiagnostic {
  code: string;
  severity: "error" | "warning";
  line: number;
  column: number;
  message: string;
}

const HELPER_NAME = "axint-syntax";

let cachedDefault: string | null | undefined;

export function findHelperBinary(): string | null {
  // Env override wins but is never cached — tests and dev loops can
  // swap binaries between calls without restarting the process.
  const override = process.env.AXINT_SYNTAX_HELPER;
  if (override) return existsSync(override) ? override : null;

  if (cachedDefault !== undefined) return cachedDefault;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../tools/swift-syntax-helper/.build/release", HELPER_NAME),
    resolve(here, "../../tools/swift-syntax-helper/.build/debug", HELPER_NAME),
    resolve(here, "../../bin", HELPER_NAME),
  ];

  cachedDefault = candidates.find(existsSync) ?? null;
  return cachedDefault;
}

export function lintWithHelper(file: string, source: string): Diagnostic[] | null {
  const binary = findHelperBinary();
  if (!binary) return null;

  const result = spawnSync(binary, ["lint", "-"], {
    input: source,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.error || result.status === 2) return null;

  let parsed: HelperDiagnostic[];
  try {
    parsed = JSON.parse(result.stdout || "[]") as HelperDiagnostic[];
  } catch {
    return null;
  }

  return parsed.map((d) => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
    file,
    line: d.line,
  }));
}
