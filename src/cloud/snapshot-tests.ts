/**
 * Snapshot test integration for Cloud Check.
 *
 * Opt-in companion to swift -typecheck. Where typecheck closes the
 * "compiler-rejection" class of misses, snapshots close the "looks-fine-
 * to-the-compiler-but-renders-wrong" class — dead-but-rendered views,
 * white-on-white regressions, layout drift, density changes the agent
 * didn't intend.
 *
 * Implementation: shells out to `xcodebuild test -only-testing:<suite>`
 * when the host has Xcode and a snapshot suite is configured. Parses the
 * pass/fail output and any reference-image diffs surfaced by the suite.
 *
 * Snapshot library is project-specific (pointfree/swift-snapshot-testing,
 * Apple's XCTest snapshot APIs, custom). We don't try to drive a specific
 * library — we just orchestrate the test invocation and surface the
 * results. The project's existing snapshot suite stays the source of
 * truth for what's tested.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Diagnostic } from "../core/types.js";

export interface SnapshotTestOptions {
  /** Project directory containing the .xcodeproj or .xcworkspace. */
  projectRoot: string;
  /** Xcode scheme that contains the snapshot test target. */
  scheme: string;
  /**
   * Test target / class identifier passed to `-only-testing`. E.g.
   * "SwarmSnapshotTests" or "MyAppTests/MyComponentSnapshotTests".
   */
  onlyTesting: string;
  /**
   * Destination passed to xcodebuild. Defaults to the same iPhone
   * simulator slug `axint run` uses.
   */
  destination?: string;
  /**
   * Override the xcodebuild binary path. Defaults to PATH lookup.
   */
  xcodebuildBinary?: string;
  /** Cap how long we wait. Defaults to 5 min — snapshots can be slow. */
  timeoutMs?: number;
  /**
   * Optional explicit workspace or project to pass to xcodebuild. When
   * omitted we let xcodebuild auto-discover from the current directory.
   */
  workspace?: string;
  project?: string;
}

export interface SnapshotTestResult {
  /** Whether xcodebuild was found and executed. */
  available: boolean;
  /** The xcodebuild binary path we used. */
  xcodebuildBinary: string | null;
  /** Exit code from xcodebuild. */
  exitCode: number | null;
  /** Diagnostic objects representing snapshot failures. */
  diagnostics: Diagnostic[];
  /** Number of tests that passed. */
  passed: number;
  /** Number of tests that failed. */
  failed: number;
  /** Whether the run timed out. */
  timedOut: boolean;
  /** Why the snapshot suite couldn't run, when available is false. */
  unavailableReason?: string;
  /** Raw stderr from xcodebuild — kept for debugging unparsed failures. */
  rawStderr: string;
}

const DEFAULT_DESTINATION = "platform=iOS Simulator,name=iPhone 16 Pro,OS=latest";

/**
 * Locate xcodebuild on the host. Returns null on Linux/CI without Xcode.
 */
export function locateXcodebuild(override?: string): string | null {
  if (override && existsSync(override)) return override;
  if (
    process.env.AXINT_XCODEBUILD_BINARY &&
    existsSync(process.env.AXINT_XCODEBUILD_BINARY)
  ) {
    return process.env.AXINT_XCODEBUILD_BINARY;
  }
  const which = spawnSync("which", ["xcodebuild"], { encoding: "utf-8" });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }
  return null;
}

/**
 * Run the configured snapshot test suite via xcodebuild and return
 * structured results. No-op on hosts without xcodebuild.
 */
export function runSnapshotTests(options: SnapshotTestOptions): SnapshotTestResult {
  const xcodebuildBinary = locateXcodebuild(options.xcodebuildBinary);
  if (!xcodebuildBinary) {
    return {
      available: false,
      xcodebuildBinary: null,
      exitCode: null,
      diagnostics: [],
      passed: 0,
      failed: 0,
      timedOut: false,
      rawStderr: "",
      unavailableReason:
        "xcodebuild not found. Install Xcode or set AXINT_XCODEBUILD_BINARY.",
    };
  }

  const projectRoot = resolve(options.projectRoot);
  if (!existsSync(projectRoot)) {
    return {
      available: false,
      xcodebuildBinary,
      exitCode: null,
      diagnostics: [],
      passed: 0,
      failed: 0,
      timedOut: false,
      rawStderr: "",
      unavailableReason: `Project root does not exist: ${projectRoot}`,
    };
  }

  const args: string[] = ["test"];
  if (options.workspace) {
    args.push("-workspace", options.workspace);
  } else if (options.project) {
    args.push("-project", options.project);
  }
  args.push(
    "-scheme",
    options.scheme,
    "-destination",
    options.destination ?? DEFAULT_DESTINATION,
    "-only-testing",
    options.onlyTesting,
    "-quiet"
  );

  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  const result = spawnSync(xcodebuildBinary, args, {
    cwd: projectRoot,
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });

  const stderr = result.stderr ?? "";
  const stdout = result.stdout ?? "";
  const combined = `${stdout}\n${stderr}`;
  const timedOut = result.signal === "SIGTERM";

  const diagnostics = parseSnapshotFailures(combined, options.projectRoot);
  const { passed, failed } = countTestOutcomes(combined);

  return {
    available: true,
    xcodebuildBinary,
    exitCode: typeof result.status === "number" ? result.status : null,
    diagnostics,
    passed,
    failed,
    timedOut,
    rawStderr: stderr,
  };
}

/**
 * xcodebuild test failure shapes:
 *
 *   /path/Test.swift:42: error: -[MyTests testFoo] : XCTAssertEqual failed: ...
 *   /path/Test.swift:42: error: -[MyTests testFoo] : Snapshot failed: ...
 *
 * pointfree/swift-snapshot-testing additionally writes a "Recorded:" line
 * pointing at the failure artifact path, which we surface in the suggestion.
 */
const SNAPSHOT_FAIL_RE =
  /^(.+?\.swift):(\d+):\s+error:\s+-\[([^\]]+)\s+([^\]]+)\]\s*:\s*(.+)$/gm;
const SNAPSHOT_ARTIFACT_RE = /Recorded[^"]*"([^"]+\.png)"/;

export function parseSnapshotFailures(output: string, projectRoot: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = SNAPSHOT_FAIL_RE.exec(output)) !== null) {
    const [, file, lineStr, suite, testName, message] = match;
    const artifactMatch = SNAPSHOT_ARTIFACT_RE.exec(message ?? "");
    const artifactSuggestion = artifactMatch
      ? `Inspect the failure artifact at ${artifactMatch[1]}, then either accept the new baseline (delete the recorded image to re-record) or fix the rendering regression.`
      : "Inspect the test report — either accept the new baseline or fix the rendering regression.";
    diagnostics.push({
      code: "AX-SNAPSHOT-FAIL",
      severity: "error",
      message: `Snapshot test '${suite}.${testName}' failed: ${message!.trim()}`,
      file: file!,
      line: Number(lineStr!),
      suggestion: artifactSuggestion,
    });
  }
  // projectRoot kept in the signature for future use (relativizing paths).
  void projectRoot;
  return diagnostics;
}

const PASSED_RE = /Test Suite '[^']+' passed/g;
const FAILED_RE = /Test Suite '[^']+' failed/g;

function countTestOutcomes(output: string): { passed: number; failed: number } {
  const passed = (output.match(PASSED_RE) ?? []).length;
  const failed = (output.match(FAILED_RE) ?? []).length;
  return { passed, failed };
}
