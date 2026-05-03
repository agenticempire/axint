/**
 * Apple Swift typechecker integration.
 *
 * Shells out to `swift -typecheck` (or `swiftc -typecheck`) when the
 * Swift toolchain is available on the host machine. Parses the compiler's
 * structured diagnostic output and converts it to axint Diagnostic
 * format so cloud check reports them alongside the static rule pack.
 *
 * Why this matters (the wow-factor change):
 *
 * axint's static rule pack catches ~50 things Apple's compiler doesn't —
 * dead views, layout collapses, redundant lifecycle wrappers, etc. But
 * the 4-5 things axint MISSES per sprint tend to be the most visible
 * failure mode: Xcode rejecting code in front of the user. All of them
 * come down to "Swift's type-checker resolves at the cross-context
 * declaration boundary; axint doesn't."
 *
 * `swift -typecheck` IS that type-checker, free, maintained by Apple,
 * exact to the latest SDK. Invoking it closes the gap. On non-Mac
 * runners (Linux CI, axint cloud, Cowork sandbox) the toolchain isn't
 * available and we fall back to the static rule pack alone.
 *
 * Net effect: axint goes from "one of several quality tools" to "runs
 * Apple's typechecker for you, plus 200+ rules Apple's compiler doesn't
 * have."
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Diagnostic } from "../core/types.js";

export interface SwiftTypecheckOptions {
  /** Source files to type-check. Required. */
  files: string[];
  /**
   * Project root used to discover Swift source roots for `-I` include paths.
   * Defaults to the current working directory.
   */
  projectRoot?: string;
  /**
   * Apple platform target, used to pick the right SDK.
   * "macOS" | "iOS" | "watchOS" | "tvOS" | "visionOS". Defaults to macOS.
   */
  platform?: "macOS" | "iOS" | "watchOS" | "tvOS" | "visionOS";
  /**
   * Override the Swift compiler binary path. Defaults to whatever `which swift` resolves.
   * Useful for projects on a non-default toolchain.
   */
  swiftBinary?: string;
  /**
   * Cap how long we wait for the type-checker before giving up. Defaults to 60s.
   * The typechecker is fast (usually < 5s) but pathological inputs can spin.
   */
  timeoutMs?: number;
}

export interface SwiftTypecheckResult {
  /** Whether `swift -typecheck` was found and executed successfully. */
  available: boolean;
  /** The Swift binary path we used, when available. */
  swiftBinary: string | null;
  /** The exit code from the typechecker, when available. */
  exitCode: number | null;
  /** Parsed diagnostics in axint Diagnostic format. */
  diagnostics: Diagnostic[];
  /** Raw stderr from the compiler — useful for debugging unparsed output. */
  rawStderr: string;
  /** Whether the run timed out. */
  timedOut: boolean;
  /** Why the typechecker wasn't run, when available is false. */
  unavailableReason?: string;
}

const SKIP_PROJECT_DIRS = new Set([
  "node_modules",
  ".git",
  ".build",
  "DerivedData",
  ".axint",
  "build",
  "dist",
  ".next",
  ".vercel",
  ".swiftpm",
  "Pods",
  "Carthage",
]);

/**
 * Locate the Swift toolchain. Returns the binary path or null if not found.
 * Honors AXINT_SWIFT_BINARY env var for explicit override.
 */
export function locateSwiftBinary(override?: string): string | null {
  if (override && existsSync(override)) return override;
  if (process.env.AXINT_SWIFT_BINARY && existsSync(process.env.AXINT_SWIFT_BINARY)) {
    return process.env.AXINT_SWIFT_BINARY;
  }
  // Try `which swift` — works on macOS dev machines + Linux with toolchain installed.
  const which = spawnSync("which", ["swift"], { encoding: "utf-8" });
  if (which.status === 0 && which.stdout.trim()) {
    const binary = which.stdout.trim();
    if (existsSync(binary)) return binary;
  }
  return null;
}

/**
 * Run `swift -typecheck` against the supplied files. Returns parsed
 * diagnostics plus availability metadata so callers can degrade gracefully
 * when the toolchain isn't present.
 */
export function runSwiftTypecheck(options: SwiftTypecheckOptions): SwiftTypecheckResult {
  const swiftBinary = locateSwiftBinary(options.swiftBinary);
  if (!swiftBinary) {
    return {
      available: false,
      swiftBinary: null,
      exitCode: null,
      diagnostics: [],
      rawStderr: "",
      timedOut: false,
      unavailableReason:
        "Swift toolchain not found. Install Xcode or set AXINT_SWIFT_BINARY to the swift binary path.",
    };
  }

  if (options.files.length === 0) {
    return {
      available: true,
      swiftBinary,
      exitCode: 0,
      diagnostics: [],
      rawStderr: "",
      timedOut: false,
    };
  }

  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const sourceRoots = collectSwiftSourceRoots(projectRoot, options.files);
  const args: string[] = ["-typecheck"];
  for (const root of sourceRoots) {
    args.push("-I", root);
  }
  // `-Xfrontend -enable-incremental-imports` would speed up but isn't
  // universally available; skip for portability.
  args.push(...options.files);

  const timeoutMs = options.timeoutMs ?? 60_000;
  const result = spawnSync(swiftBinary, args, {
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024, // 16 MB stderr cap
  });

  const timedOut =
    result.signal === "SIGTERM" || result.error?.message?.includes("ETIMEDOUT") || false;
  const stderr = result.stderr ?? "";

  return {
    available: true,
    swiftBinary,
    exitCode: typeof result.status === "number" ? result.status : null,
    diagnostics: parseSwiftDiagnostics(stderr),
    rawStderr: stderr,
    timedOut,
  };
}

/**
 * Walk the project tree finding directories that contain at least one
 * .swift file. Used as `-I` include paths so cross-file resolution works
 * without xcodebuild.
 */
function collectSwiftSourceRoots(projectRoot: string, focusFiles: string[]): string[] {
  const roots = new Set<string>();
  // Always include the directories of the focus files themselves.
  for (const file of focusFiles) {
    const dir = resolve(file).split("/").slice(0, -1).join("/");
    if (dir) roots.add(dir);
  }

  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    let hasSwift = false;
    for (const name of entries) {
      if (SKIP_PROJECT_DIRS.has(name)) continue;
      if (name.startsWith(".")) continue;
      const full = resolve(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile() && name.endsWith(".swift")) {
        hasSwift = true;
      }
    }
    if (hasSwift) roots.add(dir);
  };

  walk(projectRoot, 0);
  return [...roots];
}

/**
 * Swift compiler diagnostic format:
 *
 *   /path/to/File.swift:24:14: error: Value of type 'AnyShape' has no member 'strokeBorder'
 *   /path/to/File.swift:8:5: warning: 'foo' is deprecated
 *
 * Followed by source context lines (we ignore those for the structured
 * Diagnostic output but keep them in rawStderr for debugging).
 */
const DIAG_LINE_RE = /^(.+?\.swift):(\d+):(\d+):\s+(error|warning|note):\s+(.+)$/;

export function parseSwiftDiagnostics(stderr: string): Diagnostic[] {
  if (!stderr) return [];
  const diagnostics: Diagnostic[] = [];
  for (const line of stderr.split("\n")) {
    const match = DIAG_LINE_RE.exec(line);
    if (!match) continue;
    const [, file, lineNum, colNum, kind, message] = match;
    if (kind === "note") continue; // notes are follow-ons; skip for compactness
    diagnostics.push({
      code: kind === "error" ? "AX-SWIFTC-ERROR" : "AX-SWIFTC-WARNING",
      severity: kind === "error" ? "error" : "warning",
      message: `swift: ${message!.trim()}`,
      file: file!,
      line: Number(lineNum!),
      column: Number(colNum!),
      suggestion:
        kind === "error"
          ? "This came directly from Apple's Swift typechecker. The fix is whatever the compiler error suggests; no axint heuristic involved."
          : undefined,
    });
  }
  return diagnostics;
}
