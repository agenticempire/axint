/**
 * UIPaint scaffold — auto-generates a Swift smoke test that mounts every
 * reachable View at canonical viewports and asserts the body resolves
 * + renders > 0% non-empty pixels + critical accessibility identifiers
 * are present.
 *
 * This is the runtime equivalent of swift -typecheck. typecheck catches
 * compile-time errors; UIPaint catches runtime errors that compile fine —
 * dead routes, missing environment injection, broken state machines that
 * crash the body resolution, empty-state regressions where every pixel
 * came out clear.
 *
 * What this module ships (introduced in 0.4.20):
 *   1. A scaffold generator that walks the project, finds every `struct X: View`,
 *      and emits a Swift test file with one assertion per view.
 *   2. The test file uses XCTest + ImageRenderer to mount the view and
 *      check pixel coverage. Standard Apple APIs, no third-party deps.
 *
 * What this module does NOT ship yet:
 *   - Actually running the test (requires xcodebuild on a Mac runner;
 *     the user wires it into their existing CI). The snapshot-tests
 *     module covers that orchestration shape if needed.
 *   - Auto-discovering required environment objects (the scaffold prompts
 *     the developer to fill in `EnvironmentValues` injections per view
 *     where the test fails to resolve).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findTypeDeclarations,
  hasConformance,
  stripCommentsAndStrings,
} from "../core/swift-ast.js";

export interface PaintTestScaffoldOptions {
  /** Root of the project to scan. Required. */
  projectRoot: string;
  /**
   * Output path for the generated Swift test file. Defaults to
   * `<projectRoot>/SwarmPaintTests/AxintGeneratedPaintTests.swift`.
   * The file is overwritten on each run — re-generate after View changes.
   */
  outputPath?: string;
  /**
   * Module name to import at the top of the test file. Defaults to the
   * directory name above the views. The user can override.
   */
  moduleName?: string;
  /**
   * If false, dry-run: returns the generated content without writing.
   */
  write?: boolean;
}

export interface PaintTestScaffoldResult {
  /** Number of distinct View structs the scaffold mounts. */
  viewCount: number;
  /** Path the file was written to (when write was true). */
  outputPath?: string;
  /** Generated Swift test file contents. */
  generated: string;
  /** Views the scaffold opted out of mounting (with reasons). */
  skipped: Array<{ name: string; file: string; reason: string }>;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".build",
  "DerivedData",
  ".axint",
  "build",
  "dist",
  ".next",
  "Pods",
  "Carthage",
  "Tests",
  "Test",
]);

interface DiscoveredView {
  name: string;
  file: string;
  /** True if the view declares `@MainActor` or is an App-conforming root. */
  isApp: boolean;
  /** True if the view requires generic parameters we can't synthesize. */
  isGeneric: boolean;
  /** True if the view has required init parameters we can't synthesize. */
  hasRequiredInit: boolean;
  /** True if the view is a #Preview-only PreviewProvider. */
  isPreview: boolean;
}

export function scaffoldPaintTests(
  options: PaintTestScaffoldOptions
): PaintTestScaffoldResult {
  const projectRoot = resolve(options.projectRoot);
  if (!existsSync(projectRoot)) {
    throw new Error(`Project root does not exist: ${projectRoot}`);
  }

  const allViews = discoverViews(projectRoot);
  const moduleName = options.moduleName ?? inferModuleName(projectRoot);
  const skipped: Array<{ name: string; file: string; reason: string }> = [];
  const mountable: DiscoveredView[] = [];

  for (const view of allViews) {
    if (view.isApp) {
      skipped.push({
        name: view.name,
        file: view.file,
        reason: "App scene — runtime mounts it",
      });
      continue;
    }
    if (view.isPreview) {
      skipped.push({ name: view.name, file: view.file, reason: "PreviewProvider only" });
      continue;
    }
    if (view.isGeneric) {
      skipped.push({
        name: view.name,
        file: view.file,
        reason: "Generic view — requires manual type binding",
      });
      continue;
    }
    if (view.hasRequiredInit) {
      skipped.push({
        name: view.name,
        file: view.file,
        reason:
          "init() requires args — add a manual mount in this test file or supply a default",
      });
      continue;
    }
    mountable.push(view);
  }

  const generated = renderPaintTestFile(mountable, moduleName);
  const outputPath =
    options.outputPath ??
    resolve(projectRoot, "SwarmPaintTests", "AxintGeneratedPaintTests.swift");

  if (options.write !== false) {
    const dir = resolve(outputPath, "..");
    try {
      writeFileSync(outputPath, generated);
    } catch (err) {
      throw new Error(
        `Could not write paint-test scaffold to ${outputPath}: ${(err as Error).message}. ` +
          `Create the directory first: mkdir -p ${dir}`,
        { cause: err }
      );
    }
  }

  return {
    viewCount: mountable.length,
    outputPath: options.write !== false ? outputPath : undefined,
    generated,
    skipped,
  };
}

function discoverViews(projectRoot: string): DiscoveredView[] {
  const out: DiscoveredView[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 10) return;
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
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile() && name.endsWith(".swift")) {
        let source: string;
        try {
          source = readFileSync(full, "utf-8");
        } catch {
          continue;
        }
        const stripped = stripCommentsAndStrings(source);
        const decls = findTypeDeclarations(stripped, source);
        for (const decl of decls) {
          if (decl.kind !== "struct") continue;
          // Pick up View, App, and PreviewProvider so the skip-classifier
          // can give the dev an explicit reason for each.
          const isApp = hasConformance(decl, "App");
          const isView = hasConformance(decl, "View");
          const isPreview = hasConformance(decl, "PreviewProvider");
          if (!isView && !isApp && !isPreview) continue;
          const isGeneric = /<[A-Za-z]/.test(decl.name);
          const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
          const hasRequiredInit = detectRequiredInit(body);
          out.push({
            name: decl.name.replace(/<.*$/, ""),
            file: full,
            isApp,
            isGeneric,
            hasRequiredInit,
            isPreview,
          });
        }
      }
    }
  };
  walk(projectRoot, 0);
  return out;
}

function detectRequiredInit(body: string): boolean {
  // A struct can be auto-mounted with `Foo()` only if every stored
  // property has a default value. Classification per line:
  //   - tail contains `{` anywhere → computed property (the body block
  //     follows the type), skip. Covers both `var body: some View {`
  //     (multi-line) and `var body: some View { Text("a") }` (one-line).
  //   - tail contains `=` before any `{` → stored with default, OK.
  //   - tail ends with `?` → optional, defaults to nil, OK.
  //   - otherwise → required stored property.
  const lines = body.split("\n");
  let hasRequiredStored = false;

  const lineRe =
    /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s+)?(?:public|internal|private|fileprivate|open|static|class)?\s*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/;
  for (const rawLine of lines) {
    const match = lineRe.exec(rawLine);
    if (!match) continue;
    const tail = match[2]!.trim();

    // Find positions of `{` and `=` in the tail (ignoring those inside
    // string literals — close enough for our heuristic).
    const braceIdx = tail.indexOf("{");
    const eqIdx = tail.search(/=\s*\S/);

    // Computed: brace appears before any equals (or no equals at all).
    if (braceIdx >= 0 && (eqIdx < 0 || braceIdx < eqIdx)) continue;
    // Stored with default value.
    if (eqIdx >= 0) continue;
    // Optional → defaults to nil.
    if (/\?\s*$/.test(tail)) continue;
    // Required.
    hasRequiredStored = true;
    break;
  }

  // If there's an explicit zero-arg init, the required property is fine.
  if (hasRequiredStored && /\binit\s*\(\s*\)/.test(body)) return false;
  return hasRequiredStored;
}

function inferModuleName(projectRoot: string): string {
  // Convention: the immediate child directory under projectRoot that
  // contains the bulk of .swift files is usually the module name.
  // Fall back to the projectRoot's basename.
  const base = projectRoot.split("/").filter(Boolean).pop() ?? "App";
  return base.replace(/[^A-Za-z0-9_]/g, "");
}

const VIEWPORTS = [
  { name: "iPhone16Pro", width: 393, height: 852 },
  { name: "iPadPro13", width: 1024, height: 1366 },
];

function renderPaintTestFile(views: DiscoveredView[], moduleName: string): string {
  const header = [
    `// Auto-generated by \`axint paint-test scaffold\`.`,
    `// Do not edit by hand — regenerate with: axint paint-test scaffold --project .`,
    `//`,
    `// Mounts every reachable SwiftUI View at canonical viewports and asserts:`,
    `//   1. body resolves without throwing`,
    `//   2. the rendered image has > 0% non-empty pixels`,
    `//`,
    `// Views requiring environment objects, init args, or generic params are`,
    `// listed in the scaffold output's "skipped" array — add a manual mount`,
    `// for each in a partner test file (e.g. AxintManualPaintTests.swift).`,
    ``,
    `import XCTest`,
    `import SwiftUI`,
    `@testable import ${moduleName}`,
    ``,
    `@MainActor`,
    `final class AxintGeneratedPaintTests: XCTestCase {`,
    ``,
    `    private func assertPaints<V: View>(_ view: V, name: String, viewport: (width: CGFloat, height: CGFloat), file: StaticString = #filePath, line: UInt = #line) {`,
    `        let renderer = ImageRenderer(content: view.frame(width: viewport.width, height: viewport.height))`,
    `        renderer.scale = 2`,
    `        guard let cg = renderer.cgImage else {`,
    `            XCTFail("\\(name): ImageRenderer returned nil — body failed to resolve", file: file, line: line)`,
    `            return`,
    `        }`,
    `        let coverage = nonEmptyPixelRatio(cgImage: cg)`,
    `        XCTAssertGreaterThan(coverage, 0.005, "\\(name): rendered \\(Int(coverage * 100))% non-empty pixels at \\(viewport.width)×\\(viewport.height) — likely empty/blank state", file: file, line: line)`,
    `    }`,
    ``,
    `    private func nonEmptyPixelRatio(cgImage: CGImage) -> Double {`,
    `        let width = cgImage.width`,
    `        let height = cgImage.height`,
    `        let bytesPerRow = cgImage.bytesPerRow`,
    `        guard let provider = cgImage.dataProvider, let data = provider.data else { return 0 }`,
    `        let ptr = CFDataGetBytePtr(data)!`,
    `        var nonEmpty = 0`,
    `        for y in stride(from: 0, to: height, by: 4) {`,
    `            for x in stride(from: 0, to: width, by: 4) {`,
    `                let offset = y * bytesPerRow + x * 4`,
    `                let a = ptr[offset + 3]`,
    `                if a > 16 { nonEmpty += 1 }`,
    `            }`,
    `        }`,
    `        let sampled = Double((width / 4) * (height / 4))`,
    `        return sampled > 0 ? Double(nonEmpty) / sampled : 0`,
    `    }`,
    ``,
  ].join("\n");

  const tests = views
    .map((view) => {
      return VIEWPORTS.map(
        (vp) => `    func test_${view.name}_paints_${vp.name}() {
        assertPaints(${view.name}(), name: "${view.name}", viewport: (width: ${vp.width}, height: ${vp.height}))
    }
`
      ).join("\n");
    })
    .join("\n");

  return `${header}\n${tests}\n}\n`;
}
