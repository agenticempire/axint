/**
 * Snapshot-baseline affinity hint for Cloud Check.
 *
 * From dogfooding 2026-05-03: when an agent touches a SwiftUI View that
 * has matching `__Snapshots__/<view>*.png` baselines on disk, the
 * sprint summary repeatedly forgot to mention re-recording. The data is
 * sitting on the filesystem — a `readdirSync` away — so Cloud Check's
 * report should append a one-line reminder.
 *
 * Pure read-only filesystem scan; no parsing, no diagnostic generation.
 * Returns the matching baseline paths so the report can name them.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export interface SnapshotAffinityOptions {
  /** Path to the Swift file being validated. */
  swiftFile: string;
  /**
   * Project root used to scope the search. Walks upward from the swift
   * file to find a `SwarmSnapshotTests/` (or any `*SnapshotTests/`)
   * sibling, then scans its `__Snapshots__/` directories.
   */
  projectRoot?: string;
  /**
   * Override the snapshot directory pattern. Defaults to matching
   * directories that end in `Snapshots` or `SnapshotTests`.
   */
  snapshotDirPattern?: RegExp;
}

export interface SnapshotAffinityResult {
  /** True if at least one matching baseline was found. */
  hasBaselines: boolean;
  /** The view-name prefix used to match baselines (file basename minus .swift). */
  viewName: string;
  /** Absolute paths of the PNG baselines that match the view name. */
  baselinePaths: string[];
}

const DEFAULT_SNAPSHOT_DIR_PATTERN = /(?:Snapshots|SnapshotTests)$/i;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".build",
  "DerivedData",
  ".axint",
  "build",
  "dist",
  ".next",
  ".swiftpm",
  "Pods",
  "Carthage",
]);

export function findSnapshotAffinity(
  options: SnapshotAffinityOptions
): SnapshotAffinityResult {
  const swiftFile = resolve(options.swiftFile);
  const viewName = basename(swiftFile).replace(/\.swift$/i, "");
  const empty: SnapshotAffinityResult = {
    hasBaselines: false,
    viewName,
    baselinePaths: [],
  };
  if (!viewName) return empty;

  const projectRoot = resolve(options.projectRoot ?? findProjectRoot(swiftFile));
  if (!existsSync(projectRoot)) return empty;

  const dirPattern = options.snapshotDirPattern ?? DEFAULT_SNAPSHOT_DIR_PATTERN;
  const snapshotsRoots = collectSnapshotsDirs(projectRoot, dirPattern);
  if (snapshotsRoots.length === 0) return empty;

  const baselines: string[] = [];
  const namePattern = new RegExp(`^${escapeForRegex(viewName)}[._-].+\\.png$`, "i");
  for (const root of snapshotsRoots) {
    walkPngs(root, (file) => {
      if (namePattern.test(basename(file))) baselines.push(file);
    });
  }

  return {
    hasBaselines: baselines.length > 0,
    viewName,
    baselinePaths: baselines,
  };
}

/**
 * Render the affinity hint as a one-line summary suitable for the Cloud
 * Check report's nextSteps or evidence section.
 */
export function renderSnapshotAffinityHint(
  result: SnapshotAffinityResult
): string | null {
  if (!result.hasBaselines) return null;
  const n = result.baselinePaths.length;
  return `${result.viewName} has ${n} snapshot baseline${n === 1 ? "" : "s"} on disk — rebaseline after the next Xcode build if rendering changed (delete the matching PNG to re-record).`;
}

function findProjectRoot(file: string): string {
  // Walk upward looking for a `.git` or `Package.swift` or a `*.xcodeproj`.
  let current = dirname(file);
  for (let depth = 0; depth < 10; depth++) {
    if (
      existsSync(resolve(current, ".git")) ||
      existsSync(resolve(current, "Package.swift")) ||
      hasXcodeProject(current)
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirname(file);
}

function hasXcodeProject(dir: string): boolean {
  try {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".xcodeproj") || name.endsWith(".xcworkspace")) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function collectSnapshotsDirs(root: string, dirPattern: RegExp): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      if (name.startsWith(".")) continue;
      const full = resolve(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      // Two cases we want to capture:
      //   (a) a *SnapshotTests/ container — scan its __Snapshots__ subtree.
      //   (b) a __Snapshots__/ directory directly.
      if (name === "__Snapshots__") {
        out.push(full);
      } else if (dirPattern.test(name)) {
        // Recurse to find __Snapshots__ underneath.
        walk(full, depth + 1);
      } else {
        walk(full, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

function walkPngs(dir: string, visit: (file: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = resolve(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkPngs(full, visit);
    } else if (stat.isFile() && name.toLowerCase().endsWith(".png")) {
      visit(full);
    }
  }
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
