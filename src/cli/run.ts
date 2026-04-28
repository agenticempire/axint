import type { Command } from "commander";
import {
  renderAxintRunReport,
  runAxintProject,
  type AxintRunFormat,
  type AxintRunPlatform,
} from "../run/project-runner.js";

export function registerRun(program: Command, version: string) {
  program
    .command("run")
    .description(
      "Run the enforced Axint Apple build loop: session, workflow gate, validate, Cloud Check, xcodebuild, and optional runtime proof"
    )
    .option("--dir <dir>", "Project directory", ".")
    .option("--scheme <scheme>", "Xcode scheme")
    .option("--workspace <path>", "Path to .xcworkspace")
    .option("--project <path>", "Path to .xcodeproj")
    .option("--destination <destination>", "xcodebuild destination")
    .option("--configuration <configuration>", "Xcode build configuration")
    .option("--derived-data <path>", "xcodebuild -derivedDataPath")
    .option("--test-plan <name>", "xcodebuild -testPlan")
    .option(
      "--only-testing <selector...>",
      "Focused xcodebuild -only-testing selector(s), e.g. SwarmUITests/SwarmUITests/testName"
    )
    .option(
      "--platform <platform>",
      "Target platform: macOS, iOS, watchOS, visionOS, all",
      parsePlatform
    )
    .option("--changed <file...>", "Changed Swift files to validate/check")
    .option("--skip-build", "Skip xcodebuild build")
    .option("--skip-tests", "Skip xcodebuild test")
    .option("--runtime", "Launch the built macOS app and capture runtime evidence")
    .option("--runtime-timeout <seconds>", "Runtime launch timeout", parsePositiveInt)
    .option("--timeout <seconds>", "Build/test timeout", parsePositiveInt)
    .option("--expected <text>", "Expected runtime or UI behavior")
    .option("--actual <text>", "Actual runtime or UI behavior")
    .option("--runtime-failure <text>", "Runtime, freeze, crash, or hang evidence")
    .option("--dry-run", "Plan the xcodebuild commands without executing them")
    .option("--no-write-report", "Do not write .axint/run/latest artifacts")
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
        runtimeTimeout?: number;
        timeout?: number;
        expected?: string;
        actual?: string;
        runtimeFailure?: string;
        dryRun?: boolean;
        writeReport?: boolean;
        json?: boolean;
        prompt?: boolean;
        format: AxintRunFormat;
      }) => {
        const report = await runAxintProject({
          cwd: options.dir,
          kind: "local",
          expectedVersion: version,
          platform: options.platform,
          scheme: options.scheme,
          workspace: options.workspace,
          project: options.project,
          destination: options.destination,
          configuration: options.configuration,
          derivedDataPath: options.derivedData,
          testPlan: options.testPlan,
          onlyTesting: options.onlyTesting,
          modifiedFiles: options.changed,
          skipBuild: options.skipBuild,
          skipTests: options.skipTests,
          runtime: options.runtime,
          runtimeTimeoutSeconds: options.runtimeTimeout,
          timeoutSeconds: options.timeout,
          expectedBehavior: options.expected,
          actualBehavior: options.actual,
          runtimeFailure: options.runtimeFailure,
          dryRun: options.dryRun,
          writeReport: options.writeReport,
        });
        const format = options.prompt ? "prompt" : options.json ? "json" : options.format;
        console.log(renderAxintRunReport(report, format));
        if (report.status === "fail") process.exit(1);
      }
    );

  const runner = program
    .command("runner")
    .description("Run Axint jobs on a local or BYO Mac runner");

  runner
    .command("once")
    .description(
      "Execute one Axint Run job in the current project. This is the open-source BYO Mac runner primitive."
    )
    .option("--dir <dir>", "Project directory", ".")
    .option("--scheme <scheme>", "Xcode scheme")
    .option("--destination <destination>", "xcodebuild destination")
    .option(
      "--only-testing <selector...>",
      "Focused xcodebuild -only-testing selector(s)"
    )
    .option("--skip-tests", "Skip xcodebuild test")
    .option("--runtime", "Launch the built macOS app and capture runtime evidence")
    .option("--dry-run", "Plan commands without executing them")
    .option(
      "--format <format>",
      "Output format: markdown, json, or prompt",
      parseFormat,
      "markdown" as AxintRunFormat
    )
    .action(
      async (options: {
        dir: string;
        scheme?: string;
        destination?: string;
        onlyTesting?: string[];
        skipTests?: boolean;
        runtime?: boolean;
        dryRun?: boolean;
        format: AxintRunFormat;
      }) => {
        const report = await runAxintProject({
          cwd: options.dir,
          kind: "byo-runner",
          expectedVersion: version,
          scheme: options.scheme,
          destination: options.destination,
          onlyTesting: options.onlyTesting,
          skipTests: options.skipTests,
          runtime: options.runtime,
          dryRun: options.dryRun,
        });
        console.log(renderAxintRunReport(report, options.format));
        if (report.status === "fail") process.exit(1);
      }
    );
}

function parseFormat(value: string): AxintRunFormat {
  if (value === "markdown" || value === "json" || value === "prompt") return value;
  throw new Error(`invalid run format: ${value}`);
}

function parsePlatform(value: string): AxintRunPlatform {
  if (
    value === "macOS" ||
    value === "iOS" ||
    value === "watchOS" ||
    value === "visionOS" ||
    value === "all"
  ) {
    return value;
  }
  throw new Error(`invalid platform: ${value}`);
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new Error(`invalid positive number: ${value}`);
}
