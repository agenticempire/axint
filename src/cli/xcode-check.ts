import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, relative, join } from "node:path";
import {
  renderCloudCheckReport,
  runCloudCheck,
  type CloudCheckInput,
} from "../cloud/check.js";
import {
  buildCheckSummary,
  renderCheckSummaryMarkdown,
  resolveCheckSummaryPaths,
  type CheckSummary,
} from "../repair/check-summary.js";
import type { FixPacket } from "../repair/fix-packet.js";
import {
  writeProjectContextIndex,
  type ProjectContextIndex,
} from "../project/context-index.js";
import {
  defaultDerivedDataRoot,
  findLatestXcodePacket,
  type XcodePacketKind,
} from "./xcode-packet.js";

export type XcodeCheckOutput = "markdown" | "json" | "prompt" | "path";

interface XcodeCheckOptions {
  root?: string;
  project?: string;
  sourcePath?: string;
  kind: XcodePacketKind;
  format: XcodeCheckOutput;
  platform?: CloudCheckInput["platform"];
  xcodeBuildLog?: string;
  testFailure?: string;
  runtimeFailure?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  changedFiles?: string[];
  refreshContext?: boolean;
}

function readExistingSummary(packetPath: string): CheckSummary | null {
  const jsonPath = packetPath.replace(/latest\.json$/, "latest.check.json");
  if (!existsSync(jsonPath)) return null;
  try {
    return JSON.parse(readFileSync(jsonPath, "utf-8")) as CheckSummary;
  } catch {
    return null;
  }
}

function renderCheckOutput(
  packetPath: string,
  packet: FixPacket,
  format: XcodeCheckOutput
): string {
  const summary = readExistingSummary(packetPath) ?? buildCheckSummary(packet);
  switch (format) {
    case "path":
      return readExistingSummary(packetPath)
        ? packetPath.replace(/latest\.json$/, "latest.check.json")
        : resolveCheckSummaryPaths(packet).jsonPath;
    case "json":
      return JSON.stringify(summary, null, 2);
    case "prompt":
      return summary.ai.prompt;
    case "markdown":
    default:
      return renderCheckSummaryMarkdown(summary);
  }
}

export async function runXcodeCheck(options: XcodeCheckOptions): Promise<void> {
  if (isDirectFileCheck(options)) {
    runDirectFileCheck(options);
    return;
  }

  const root = resolve(options.root ?? defaultDerivedDataRoot());
  const candidate = findLatestXcodePacket(root, options.kind);

  if (!candidate) {
    console.error(
      `error: no ${options.kind === "any" ? "" : `${options.kind} `}Axint Check found under ${root}`
    );
    console.error(
      "hint: build in Xcode first, or point --root at a DerivedData or plugin work directory."
    );
    process.exit(1);
  }

  process.stdout.write(
    `${renderCheckOutput(candidate.path, candidate.packet, options.format)}\n`
  );
}

function runDirectFileCheck(options: XcodeCheckOptions): void {
  try {
    if (!options.sourcePath) {
      console.error(
        "error: direct Xcode file checks need a Swift file path. Pass `axint xcode check <file>`."
      );
      process.exit(1);
    }

    if (options.format === "path") {
      console.error(
        "error: --format path is only available when reading emitted Xcode packet summaries."
      );
      process.exit(1);
    }

    const sourcePath = resolve(options.sourcePath);
    if (!existsSync(sourcePath)) {
      console.error(`error: source file not found: ${sourcePath}`);
      process.exit(1);
    }

    const projectRoot = options.project
      ? resolve(options.project)
      : findProjectRootFromSource(sourcePath);
    const context =
      options.refreshContext === false
        ? undefined
        : writeProjectContextIndex({
            targetDir: projectRoot,
            changedFiles: normalizeChangedFiles(
              projectRoot,
              sourcePath,
              options.changedFiles
            ),
          });

    const report = runCloudCheck({
      sourcePath,
      platform: options.platform,
      xcodeBuildLog: options.xcodeBuildLog,
      testFailure: options.testFailure,
      runtimeFailure: options.runtimeFailure,
      expectedBehavior: options.expectedBehavior,
      actualBehavior: options.actualBehavior,
      projectContext: context?.index,
      projectContextPath: context?.jsonPath,
    });

    process.stdout.write(
      `${renderCloudCheckReport(report, options.format as "markdown" | "json" | "prompt")}\n`
    );
    if (report.status === "fail") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    process.exit(1);
  }
}

function isDirectFileCheck(options: XcodeCheckOptions): boolean {
  return Boolean(
    options.sourcePath ||
    options.project ||
    options.platform ||
    options.xcodeBuildLog ||
    options.testFailure ||
    options.runtimeFailure ||
    options.expectedBehavior ||
    options.actualBehavior ||
    options.changedFiles?.length
  );
}

function findProjectRootFromSource(sourcePath: string): string {
  let current = dirname(resolve(sourcePath));

  while (true) {
    if (hasProjectMarkers(current)) return current;
    const parent = dirname(current);
    if (parent === current) return dirname(resolve(sourcePath));
    current = parent;
  }
}

function hasProjectMarkers(dir: string): boolean {
  if (existsSync(join(dir, ".axint"))) return true;

  try {
    const entries = readdirSync(dir);
    return entries.some(
      (entry) => entry.endsWith(".xcodeproj") || entry.endsWith(".xcworkspace")
    );
  } catch {
    return false;
  }
}

function normalizeChangedFiles(
  projectRoot: string,
  sourcePath: string,
  changedFiles?: string[]
): string[] {
  if (changedFiles && changedFiles.length > 0) {
    return changedFiles.map((file) =>
      normalizeRelative(projectRoot, resolve(projectRoot, file))
    );
  }
  return [normalizeRelative(projectRoot, sourcePath)];
}

function normalizeRelative(root: string, target: string): string {
  return relative(root, target).replace(/\\/g, "/");
}

export function refreshXcodeProjectContext(input: {
  projectRoot: string;
  sourcePath?: string;
  changedFiles?: string[];
}): { index: ProjectContextIndex; jsonPath: string; markdownPath: string } {
  const context = writeProjectContextIndex({
    targetDir: input.projectRoot,
    changedFiles:
      input.changedFiles && input.changedFiles.length > 0
        ? input.changedFiles
        : input.sourcePath
          ? [normalizeRelative(input.projectRoot, resolve(input.sourcePath))]
          : undefined,
  });
  return {
    index: context.index,
    jsonPath: context.jsonPath,
    markdownPath: context.markdownPath,
  };
}
