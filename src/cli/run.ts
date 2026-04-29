import type { Command } from "commander";
import {
  renderAxintRunReport,
  runAxintProject,
  type AxintRunFormat,
  type AxintRunPlatform,
} from "../run/project-runner.js";
import {
  cancelRunJob,
  getRunJobStatus,
  renderRunCancelResult,
  renderRunJobStatus,
  type AxintRunJobOutputFormat,
} from "../run/job-store.js";

export function registerRun(program: Command, version: string) {
  const run = program
    .command("run")
    .description(
      "Run the enforced Axint Apple build loop: session, workflow gate, validate, Cloud Check, xcodebuild, and optional runtime proof"
    );

  run
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
    .option(
      "--include-source",
      "Include full Swift source and command output in JSON output"
    )
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
        includeSource?: boolean;
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
        console.log(
          renderAxintRunReport(report, format, {
            includeSource: options.includeSource,
          })
        );
        if (report.status === "fail") process.exit(1);
      }
    );

  run
    .command("status")
    .description("Show the latest or selected Axint run job, including active child PIDs")
    .option("--dir <dir>", "Project directory", ".")
    .option("--id <id>", "Run id. Defaults to latest active run.")
    .option("--json", "Shortcut for --format json")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseJobFormat,
      "markdown" as AxintRunJobOutputFormat
    )
    .action(
      (options: {
        dir: string;
        id?: string;
        json?: boolean;
        format: AxintRunJobOutputFormat;
      }) => {
        const jobOptions = resolveRunJobCliOptions(options);
        const result = getRunJobStatus({
          cwd: jobOptions.dir,
          id: jobOptions.id,
        });
        console.log(renderRunJobStatus(result, jobOptions.format));
      }
    );

  run
    .command("cancel")
    .description(
      "Cancel the latest or selected Axint run by killing active child process groups"
    )
    .option("--dir <dir>", "Project directory", ".")
    .option("--id <id>", "Run id. Defaults to latest active run.")
    .option("--json", "Shortcut for --format json")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseJobFormat,
      "markdown" as AxintRunJobOutputFormat
    )
    .action(
      (options: {
        dir: string;
        id?: string;
        json?: boolean;
        format: AxintRunJobOutputFormat;
      }) => {
        const jobOptions = resolveRunJobCliOptions(options);
        const result = cancelRunJob({
          cwd: jobOptions.dir,
          id: jobOptions.id,
        });
        console.log(renderRunCancelResult(result, jobOptions.format));
        if (result.status === "error" || result.status === "not_found") {
          process.exit(1);
        }
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
      "--include-source",
      "Include full Swift source and command output in JSON output"
    )
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
        includeSource?: boolean;
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
        console.log(
          renderAxintRunReport(report, options.format, {
            includeSource: options.includeSource,
          })
        );
        if (report.status === "fail") process.exit(1);
      }
    );
}

function parseFormat(value: string): AxintRunFormat {
  if (value === "markdown" || value === "json" || value === "prompt") return value;
  throw new Error(`invalid run format: ${value}`);
}

function parseJobFormat(value: string): AxintRunJobOutputFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid run job format: ${value}`);
}

function resolveRunJobCliOptions(options: {
  dir: string;
  id?: string;
  json?: boolean;
  format: AxintRunJobOutputFormat;
}): {
  dir: string;
  id?: string;
  format: AxintRunJobOutputFormat;
} {
  // Commander gives parent `axint run` option defaults precedence when a
  // subcommand reuses names like --dir, --json, or --format. Read the raw argv
  // as a narrow fallback so `axint run status --dir /app --json` behaves as
  // users and agents expect.
  const rawFormat = readRawOption("format");
  return {
    dir: readRawOption("dir") ?? options.dir,
    id: readRawOption("id") ?? options.id,
    format:
      readRawFlag("json") || options.json
        ? "json"
        : rawFormat
          ? parseJobFormat(rawFormat)
          : options.format,
  };
}

function readRawOption(name: string): string | undefined {
  const option = `--${name}`;
  const equalsPrefix = `${option}=`;
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === option) {
      const next = args[index + 1];
      return next && !next.startsWith("-") ? next : undefined;
    }
    if (arg.startsWith(equalsPrefix)) {
      return arg.slice(equalsPrefix.length);
    }
  }

  return undefined;
}

function readRawFlag(name: string): boolean {
  const option = `--${name}`;
  return process.argv.slice(2).some((arg) => arg === option || arg === `${option}=true`);
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
