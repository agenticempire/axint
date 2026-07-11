import type { Command } from "commander";
import { proveAxintProject, renderAxintProveReport } from "../proof/prove.js";
import type { AxintRunFormat, AxintRunPlatform } from "../run/project-runner.js";

export function registerProve(program: Command, version: string) {
  program
    .command("prove")
    .description(
      "Discover the Apple project, build, test, reconcile findings, and write a signed local proof receipt"
    )
    .option("--dir <dir>", "Apple project directory", ".")
    .option("--project-name <name>", "Project label. Normally inferred.")
    .option("--scheme <scheme>", "Xcode scheme. Normally inferred.")
    .option("--workspace <path>", "Path to .xcworkspace. Normally inferred.")
    .option("--project <path>", "Path to .xcodeproj. Normally inferred.")
    .option("--destination <destination>", "xcodebuild destination")
    .option("--configuration <configuration>", "Xcode build configuration")
    .option("--derived-data <path>", "xcodebuild DerivedData path")
    .option("--test-plan <name>", "xcodebuild test plan")
    .option("--only-testing <selector...>", "Focused Xcode test selector(s)")
    .option(
      "--platform <platform>",
      "Target platform: macOS, iOS, watchOS, visionOS, all",
      parsePlatform
    )
    .option("--changed <file...>", "Changed Swift files to prioritize")
    .option("--skip-build", "Skip Xcode build evidence")
    .option("--skip-tests", "Skip Xcode test evidence")
    .option("--runtime", "Capture a macOS runtime launch probe")
    .option("--timeout <seconds>", "Build/test timeout", parsePositiveInt)
    .option(
      "--fix",
      "Apply deterministic Swift rewrites only, then rerun the complete proof"
    )
    .option("--output-dir <dir>", "Proof artifact directory", ".axint/proof")
    .option("--dry-run", "Plan build and test commands without executing them")
    .option("--strict", "Exit nonzero for needs-review as well as failed proof")
    .option("--json", "Shortcut for --format json")
    .option("--prompt", "Shortcut for --format prompt")
    .option(
      "--format <format>",
      "Output format: markdown, json, or prompt",
      parseFormat,
      "markdown" as AxintRunFormat
    )
    .action(
      async (options: {
        dir: string;
        projectName?: string;
        scheme?: string;
        workspace?: string;
        project?: string;
        destination?: string;
        configuration?: string;
        derivedData?: string;
        testPlan?: string;
        onlyTesting?: string[];
        platform?: AxintRunPlatform;
        changed?: string[];
        skipBuild?: boolean;
        skipTests?: boolean;
        runtime?: boolean;
        timeout?: number;
        fix?: boolean;
        outputDir: string;
        dryRun?: boolean;
        strict?: boolean;
        json?: boolean;
        prompt?: boolean;
        format: AxintRunFormat;
      }) => {
        const report = await proveAxintProject({
          cwd: options.dir,
          version,
          projectName: options.projectName,
          scheme: options.scheme,
          workspace: options.workspace,
          project: options.project,
          destination: options.destination,
          configuration: options.configuration,
          derivedDataPath: options.derivedData,
          testPlan: options.testPlan,
          onlyTesting: options.onlyTesting,
          platform: options.platform,
          modifiedFiles: options.changed,
          skipBuild: options.skipBuild,
          skipTests: options.skipTests,
          runtime: options.runtime,
          timeoutSeconds: options.timeout,
          fix: options.fix,
          outputDir: options.outputDir,
          dryRun: options.dryRun,
        });
        const format = options.prompt ? "prompt" : options.json ? "json" : options.format;
        console.log(renderAxintProveReport(report, format));
        if (report.status === "fail" || (options.strict && report.status !== "pass")) {
          process.exitCode = 1;
        }
      }
    );
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid positive integer: ${value}`);
  }
  return parsed;
}

function parsePlatform(value: string): AxintRunPlatform {
  const normalized = value.toLowerCase();
  if (normalized === "macos") return "macOS";
  if (normalized === "ios") return "iOS";
  if (normalized === "watchos") return "watchOS";
  if (normalized === "visionos") return "visionOS";
  if (normalized === "all") return "all";
  throw new Error(`invalid platform: ${value}`);
}

function parseFormat(value: string): AxintRunFormat {
  if (value === "markdown" || value === "json" || value === "prompt") return value;
  throw new Error(`invalid format: ${value}`);
}
