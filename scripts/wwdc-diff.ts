#!/usr/bin/env tsx
/**
 * WWDC API Adapter Pipeline
 *
 * Nightly CI script that:
 *   1. Fetches the latest Apple App Intents framework headers from the Xcode SDK
 *   2. Diffs them against the previous known snapshot
 *   3. Detects new types, protocols, properties, and enum cases
 *   4. Generates an adapter report with recommendations for Axint updates
 *   5. Optionally opens a GitHub issue / PR with the changes
 *
 * Goal: Ship a v0.3.x release within 72 hours of WWDC 2026 keynote
 * with every new surface area adapted.
 *
 * Usage:
 *   npx tsx scripts/wwdc-diff.ts                    # Local dry run
 *   npx tsx scripts/wwdc-diff.ts --ci               # CI mode (creates issues)
 *   npx tsx scripts/wwdc-diff.ts --snapshot          # Update the baseline snapshot
 *   npx tsx scripts/wwdc-diff.ts --sdk-path <path>  # Custom SDK path
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { execSync } from "node:child_process";

// ─── Types ──────────────────────────────────────────────────────────

interface HeaderSymbol {
  name: string;
  kind: "struct" | "class" | "protocol" | "enum" | "func" | "property" | "typealias" | "case";
  parent?: string;
  signature?: string;
  file: string;
  line: number;
}

interface DiffResult {
  added: HeaderSymbol[];
  removed: HeaderSymbol[];
  modified: HeaderSymbol[];
  summary: string;
}

interface AdapterRecommendation {
  symbol: HeaderSymbol;
  action: "add-type" | "add-param-type" | "add-template" | "update-generator" | "update-validator";
  description: string;
  priority: "critical" | "high" | "medium" | "low";
}

interface SnapshotData {
  timestamp: string;
  sdkVersion: string;
  xcodeVersion: string;
  symbols: HeaderSymbol[];
}

// ─── Constants ──────────────────────────────────────────────────────

const SNAPSHOT_DIR = resolve(import.meta.dirname ?? ".", "../.wwdc");
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, "snapshot.json");
const REPORT_FILE = join(SNAPSHOT_DIR, "diff-report.json");

/** Frameworks to scan for App Intents surface area */
const TARGET_FRAMEWORKS = [
  "AppIntents",
  "Intents",
  "IntentsUI",
  "SiriKit",
];

/** Known App Intents protocols we track for new conformance requirements */
const TRACKED_PROTOCOLS = [
  "AppIntent",
  "AppEntity",
  "EntityQuery",
  "EntityStringQuery",
  "EntityPropertyQuery",
  "EnumerableEntityQuery",
  "DynamicOptionsProvider",
  "IntentResult",
  "ReturnsValue",
  "ProvidesDialog",
  "ShowsSnippetView",
  "IntentParameter",
  "DisplayRepresentation",
  "TypeDisplayRepresentation",
  "AppShortcutsProvider",
  "EntityIdentifierConvertible",
];

// ─── SDK Discovery ──────────────────────────────────────────────────

function findSDKPath(customPath?: string): string {
  if (customPath) return customPath;

  try {
    const sdkPath = execSync("xcrun --sdk macosx --show-sdk-path", {
      encoding: "utf-8",
    }).trim();
    return sdkPath;
  } catch {
    // Try common paths
    const candidates = [
      "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk",
      "/Applications/Xcode-beta.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk",
    ];

    for (const p of candidates) {
      if (existsSync(p)) return p;
    }

    throw new Error(
      "Cannot find macOS SDK. Install Xcode or pass --sdk-path. " +
        "On CI, ensure Xcode is available via `xcode-select`."
    );
  }
}

function getXcodeVersion(): string {
  try {
    return execSync("xcodebuild -version", { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    return "unknown";
  }
}

function getSDKVersion(sdkPath: string): string {
  try {
    const settings = execSync(`xcrun --sdk macosx --show-sdk-version`, {
      encoding: "utf-8",
    }).trim();
    return settings;
  } catch {
    return basename(sdkPath);
  }
}

// ─── Header Parser ──────────────────────────────────────────────────

function findSwiftInterfaceFiles(sdkPath: string): string[] {
  const files: string[] = [];

  for (const framework of TARGET_FRAMEWORKS) {
    const candidates = [
      join(sdkPath, "System/Library/Frameworks", `${framework}.framework`, "Modules", `${framework}.swiftmodule`),
      join(sdkPath, "System/Library/Frameworks", `${framework}.framework`, "Headers"),
    ];

    for (const dir of candidates) {
      if (!existsSync(dir)) continue;

      const walk = (d: string) => {
        for (const entry of readdirSync(d)) {
          const full = join(d, entry);
          const stat = statSync(full);
          if (stat.isDirectory()) {
            walk(full);
          } else if (entry.endsWith(".swiftinterface") || entry.endsWith(".h")) {
            files.push(full);
          }
        }
      };
      walk(dir);
    }
  }

  return files;
}

function parseSwiftInterface(content: string, file: string): HeaderSymbol[] {
  const symbols: HeaderSymbol[] = [];
  const lines = content.split("\n");

  let currentParent: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Track struct/class/protocol/enum blocks
    const structMatch = line.match(/^(?:public\s+)?struct\s+(\w+)/);
    if (structMatch) {
      symbols.push({ name: structMatch[1], kind: "struct", file, line: lineNum });
      currentParent = structMatch[1];
      continue;
    }

    const classMatch = line.match(/^(?:public\s+)?(?:final\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: "class", file, line: lineNum });
      currentParent = classMatch[1];
      continue;
    }

    const protoMatch = line.match(/^(?:public\s+)?protocol\s+(\w+)/);
    if (protoMatch) {
      symbols.push({ name: protoMatch[1], kind: "protocol", file, line: lineNum });
      currentParent = protoMatch[1];
      continue;
    }

    const enumMatch = line.match(/^(?:public\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: "enum", file, line: lineNum });
      currentParent = enumMatch[1];
      continue;
    }

    const typealiasMatch = line.match(/^(?:public\s+)?typealias\s+(\w+)/);
    if (typealiasMatch) {
      symbols.push({
        name: typealiasMatch[1],
        kind: "typealias",
        parent: currentParent,
        signature: line,
        file,
        line: lineNum,
      });
      continue;
    }

    const funcMatch = line.match(/^(?:public\s+)?(?:static\s+)?func\s+(\w+)/);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        kind: "func",
        parent: currentParent,
        signature: line,
        file,
        line: lineNum,
      });
      continue;
    }

    const propMatch = line.match(
      /^(?:public\s+)?(?:static\s+)?(?:var|let)\s+(\w+)\s*:/
    );
    if (propMatch) {
      symbols.push({
        name: propMatch[1],
        kind: "property",
        parent: currentParent,
        signature: line,
        file,
        line: lineNum,
      });
      continue;
    }

    const caseMatch = line.match(/^case\s+(\w+)/);
    if (caseMatch) {
      symbols.push({
        name: caseMatch[1],
        kind: "case",
        parent: currentParent,
        signature: line,
        file,
        line: lineNum,
      });
      continue;
    }

    // Reset parent on closing brace at indent level 0
    if (line === "}" && !lines[i].startsWith(" ")) {
      currentParent = undefined;
    }
  }

  return symbols;
}

function parseObjCHeader(content: string, file: string): HeaderSymbol[] {
  const symbols: HeaderSymbol[] = [];
  const lines = content.split("\n");

  let currentParent: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    const interfaceMatch = line.match(/@interface\s+(\w+)/);
    if (interfaceMatch) {
      symbols.push({ name: interfaceMatch[1], kind: "class", file, line: lineNum });
      currentParent = interfaceMatch[1];
      continue;
    }

    const protocolMatch = line.match(/@protocol\s+(\w+)/);
    if (protocolMatch) {
      symbols.push({ name: protocolMatch[1], kind: "protocol", file, line: lineNum });
      currentParent = protocolMatch[1];
      continue;
    }

    const enumMatch = line.match(/typedef\s+(?:NS_ENUM|NS_OPTIONS)\s*\(\s*\w+\s*,\s*(\w+)/);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: "enum", file, line: lineNum });
      currentParent = enumMatch[1];
      continue;
    }

    const propMatch = line.match(/@property\s+.*?\)\s*(\w+)\s*(\w+)/);
    if (propMatch) {
      symbols.push({
        name: propMatch[2],
        kind: "property",
        parent: currentParent,
        signature: line,
        file,
        line: lineNum,
      });
      continue;
    }

    if (line.startsWith("@end")) {
      currentParent = undefined;
    }
  }

  return symbols;
}

// ─── Diff Engine ────────────────────────────────────────────────────

function diffSymbols(
  previous: HeaderSymbol[],
  current: HeaderSymbol[]
): DiffResult {
  const prevMap = new Map<string, HeaderSymbol>();
  for (const s of previous) {
    const key = `${s.parent ?? ""}::${s.kind}::${s.name}`;
    prevMap.set(key, s);
  }

  const currMap = new Map<string, HeaderSymbol>();
  for (const s of current) {
    const key = `${s.parent ?? ""}::${s.kind}::${s.name}`;
    currMap.set(key, s);
  }

  const added: HeaderSymbol[] = [];
  const removed: HeaderSymbol[] = [];
  const modified: HeaderSymbol[] = [];

  for (const [key, sym] of currMap) {
    if (!prevMap.has(key)) {
      added.push(sym);
    } else {
      const prev = prevMap.get(key)!;
      if (prev.signature !== sym.signature && sym.signature) {
        modified.push(sym);
      }
    }
  }

  for (const [key, sym] of prevMap) {
    if (!currMap.has(key)) {
      removed.push(sym);
    }
  }

  const summary = [
    `${added.length} new symbols`,
    `${removed.length} removed`,
    `${modified.length} modified`,
  ].join(", ");

  return { added, removed, modified, summary };
}

// ─── Recommendation Engine ──────────────────────────────────────────

function generateRecommendations(diff: DiffResult): AdapterRecommendation[] {
  const recs: AdapterRecommendation[] = [];

  for (const sym of diff.added) {
    // New protocols that extend the App Intents surface
    if (sym.kind === "protocol") {
      const isTracked = TRACKED_PROTOCOLS.some(
        (p) => sym.name.includes(p) || sym.name.endsWith("Intent") || sym.name.endsWith("Entity")
      );
      recs.push({
        symbol: sym,
        action: "update-generator",
        description: `New protocol ${sym.name} — evaluate for code generation support`,
        priority: isTracked ? "critical" : "medium",
      });
    }

    // New struct types that could be parameter types
    if (sym.kind === "struct" && sym.parent === undefined) {
      if (sym.name.includes("Parameter") || sym.name.includes("Entity") || sym.name.includes("Intent")) {
        recs.push({
          symbol: sym,
          action: "add-type",
          description: `New type ${sym.name} — may need IR and Swift type mapping`,
          priority: "high",
        });
      }
    }

    // New enum types that could be param.enum support
    if (sym.kind === "enum") {
      recs.push({
        symbol: sym,
        action: "add-param-type",
        description: `New enum ${sym.name} — evaluate for param type support`,
        priority: "medium",
      });
    }

    // New properties on tracked types
    if (sym.kind === "property" && sym.parent && TRACKED_PROTOCOLS.includes(sym.parent)) {
      recs.push({
        symbol: sym,
        action: "update-generator",
        description: `New property ${sym.parent}.${sym.name} — update generated code`,
        priority: "critical",
      });
    }
  }

  // Removed symbols might require deprecation handling
  for (const sym of diff.removed) {
    if (TRACKED_PROTOCOLS.includes(sym.name)) {
      recs.push({
        symbol: sym,
        action: "update-generator",
        description: `Tracked protocol ${sym.name} was REMOVED — requires migration path`,
        priority: "critical",
      });
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recs;
}

// ─── Output Formatting ──────────────────────────────────────────────

function formatReport(diff: DiffResult, recs: AdapterRecommendation[]): string {
  const lines: string[] = [];

  lines.push("# WWDC API Diff Report");
  lines.push(`\nGenerated: ${new Date().toISOString()}`);
  lines.push(`\n## Summary\n`);
  lines.push(diff.summary);
  lines.push("");

  if (diff.added.length > 0) {
    lines.push("## New Symbols\n");
    for (const sym of diff.added) {
      lines.push(`- **${sym.kind}** \`${sym.parent ? `${sym.parent}.` : ""}${sym.name}\``);
    }
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push("## Removed Symbols\n");
    for (const sym of diff.removed) {
      lines.push(`- ~~${sym.kind} \`${sym.parent ? `${sym.parent}.` : ""}${sym.name}\`~~`);
    }
    lines.push("");
  }

  if (recs.length > 0) {
    lines.push("## Adapter Recommendations\n");
    const criticals = recs.filter((r) => r.priority === "critical");
    const highs = recs.filter((r) => r.priority === "high");
    const others = recs.filter((r) => r.priority !== "critical" && r.priority !== "high");

    if (criticals.length > 0) {
      lines.push("### 🔴 Critical\n");
      for (const r of criticals) {
        lines.push(`- \`${r.action}\`: ${r.description}`);
      }
      lines.push("");
    }

    if (highs.length > 0) {
      lines.push("### 🟠 High\n");
      for (const r of highs) {
        lines.push(`- \`${r.action}\`: ${r.description}`);
      }
      lines.push("");
    }

    if (others.length > 0) {
      lines.push("### 🟡 Medium / Low\n");
      for (const r of others) {
        lines.push(`- \`${r.action}\`: ${r.description}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── GitHub Integration ─────────────────────────────────────────────

function createGitHubIssue(report: string, diff: DiffResult): void {
  const title = `[WWDC Auto] API diff: ${diff.summary}`;
  const labels = "wwdc,automated,api-diff";

  try {
    execSync(
      `gh issue create --title "${title}" --body "${report.replace(/"/g, '\\"').replace(/\n/g, "\\n")}" --label "${labels}"`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    console.log(`  \x1b[32m✓\x1b[0m GitHub issue created`);
  } catch (err) {
    console.error(`  \x1b[33mwarning:\x1b[0m Could not create GitHub issue — ${(err as Error).message}`);
    console.error(`  \x1b[2mEnsure \`gh\` CLI is installed and authenticated\x1b[0m`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isCI = args.includes("--ci");
  const isSnapshot = args.includes("--snapshot");
  const sdkPathIdx = args.indexOf("--sdk-path");
  const customSdkPath = sdkPathIdx >= 0 ? args[sdkPathIdx + 1] : undefined;

  console.log();
  console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · WWDC API Adapter Pipeline`);
  console.log();

  // 1. Find SDK
  let sdkPath: string;
  try {
    sdkPath = findSDKPath(customSdkPath);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${(err as Error).message}`);
    if (!isCI) {
      console.log();
      console.log(`  \x1b[2mRunning in headerless mode — checking snapshot format only\x1b[0m`);
      console.log();
      // In non-macOS environments, just validate the pipeline works
      mkdirSync(SNAPSHOT_DIR, { recursive: true });
      if (!existsSync(SNAPSHOT_FILE)) {
        const emptySnapshot: SnapshotData = {
          timestamp: new Date().toISOString(),
          sdkVersion: "none",
          xcodeVersion: "none",
          symbols: [],
        };
        writeFileSync(SNAPSHOT_FILE, JSON.stringify(emptySnapshot, null, 2));
        console.log(`  \x1b[32m✓\x1b[0m Empty snapshot created at ${SNAPSHOT_FILE}`);
      } else {
        console.log(`  \x1b[32m✓\x1b[0m Snapshot exists at ${SNAPSHOT_FILE}`);
      }
      return;
    }
    process.exit(1);
  }

  const xcodeVersion = getXcodeVersion();
  const sdkVersion = getSDKVersion(sdkPath);

  console.log(`  SDK:    ${sdkPath}`);
  console.log(`  Xcode:  ${xcodeVersion}`);
  console.log(`  SDK:    ${sdkVersion}`);
  console.log();

  // 2. Scan headers
  console.log(`  \x1b[2m⏺\x1b[0m Scanning App Intents headers…`);
  const files = findSwiftInterfaceFiles(sdkPath);
  console.log(`  \x1b[2m  Found ${files.length} interface files\x1b[0m`);

  const currentSymbols: HeaderSymbol[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    if (file.endsWith(".swiftinterface")) {
      currentSymbols.push(...parseSwiftInterface(content, file));
    } else if (file.endsWith(".h")) {
      currentSymbols.push(...parseObjCHeader(content, file));
    }
  }

  console.log(`  \x1b[32m✓\x1b[0m Parsed ${currentSymbols.length} symbols`);
  console.log();

  // 3. Snapshot mode — save and exit
  if (isSnapshot) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const snapshot: SnapshotData = {
      timestamp: new Date().toISOString(),
      sdkVersion,
      xcodeVersion,
      symbols: currentSymbols,
    };
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
    console.log(`  \x1b[32m✓\x1b[0m Snapshot saved (${currentSymbols.length} symbols)`);
    console.log(`  \x1b[2m  ${SNAPSHOT_FILE}\x1b[0m`);
    return;
  }

  // 4. Load previous snapshot
  if (!existsSync(SNAPSHOT_FILE)) {
    console.log(`  \x1b[33mwarning:\x1b[0m No baseline snapshot found`);
    console.log(`  \x1b[2mRun with --snapshot first to create a baseline\x1b[0m`);
    console.log();

    // Create initial snapshot automatically
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const snapshot: SnapshotData = {
      timestamp: new Date().toISOString(),
      sdkVersion,
      xcodeVersion,
      symbols: currentSymbols,
    };
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
    console.log(`  \x1b[32m✓\x1b[0m Initial snapshot created`);
    return;
  }

  const previous: SnapshotData = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8"));
  console.log(`  Baseline: ${previous.xcodeVersion} (${previous.timestamp})`);
  console.log(`  Current:  ${xcodeVersion}`);
  console.log();

  // 5. Diff
  console.log(`  \x1b[2m⏺\x1b[0m Diffing symbols…`);
  const diff = diffSymbols(previous.symbols, currentSymbols);
  console.log(`  \x1b[32m✓\x1b[0m ${diff.summary}`);
  console.log();

  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m No API changes detected. Axint is up to date.`);
    return;
  }

  // 6. Generate recommendations
  const recs = generateRecommendations(diff);
  console.log(`  ${recs.length} adapter recommendations generated`);

  const criticalCount = recs.filter((r) => r.priority === "critical").length;
  if (criticalCount > 0) {
    console.log(`  \x1b[31m  ${criticalCount} CRITICAL — immediate attention required\x1b[0m`);
  }
  console.log();

  // 7. Write report
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const report = formatReport(diff, recs);
  writeFileSync(join(SNAPSHOT_DIR, "diff-report.md"), report);
  writeFileSync(
    REPORT_FILE,
    JSON.stringify({ diff, recommendations: recs, timestamp: new Date().toISOString() }, null, 2)
  );
  console.log(`  \x1b[32m✓\x1b[0m Report saved to .wwdc/diff-report.md`);

  // 8. CI mode: create issue
  if (isCI && (diff.added.length > 0 || diff.removed.length > 0)) {
    createGitHubIssue(report, diff);
  }

  // 9. Update snapshot
  const snapshot: SnapshotData = {
    timestamp: new Date().toISOString(),
    sdkVersion,
    xcodeVersion,
    symbols: currentSymbols,
  };
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`  \x1b[32m✓\x1b[0m Snapshot updated`);
  console.log();
}

main().catch((err) => {
  console.error(`\x1b[31merror:\x1b[0m ${err.message}`);
  process.exit(1);
});
