import { InvalidArgumentError, type Command } from "commander";
import { readFileSync } from "node:fs";
import { loadAxintCredentials, resolveCredentialsPath } from "../core/credentials.js";
import { registryBaseUrl } from "../core/env.js";
import {
  renderCloudCheckReport,
  runCloudCheck,
  type CloudCheckFormat,
  type CloudCheckInput,
} from "../cloud/check.js";
import { writeCloudFeedbackSignal } from "../cloud/feedback-store.js";
import { runAxintLogin } from "./login.js";

type CloudUsagePayload = {
  signedIn?: boolean;
  pro?: {
    plan: string;
    included: number;
    used: number;
    remaining: number;
    resetAt: string | null;
  };
};

type CloudPreviewRuntime = "fast" | "smooth" | "demo";
type CloudPreviewTarget = "ios" | "ipad" | "macos";

type CloudPreviewJob = {
  id: string;
  appName: string;
  repoUrl: string;
  branch: string;
  scheme: string;
  simulator: string;
  targetPlatform: CloudPreviewTarget;
  runtimeMode: CloudPreviewRuntime;
  status: string;
  statusLabel: string;
  viewerPath: string;
  runnerCommand?: string;
};

type CloudPreviewPayload = {
  job?: CloudPreviewJob;
  error?: string;
  message?: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function registerCloud(program: Command) {
  const cloud = program
    .command("cloud")
    .description(
      "Axint Cloud account, Pro check allowance, and hosted repair-loop commands"
    );

  cloud
    .command("check")
    .description("Run an agent-callable Cloud Check against a source file")
    .argument("[file]", "Swift or Axint TypeScript source file to check")
    .option("--source <file>", "Swift or Axint TypeScript source file to check")
    .option(
      "--format <format>",
      "Output format (markdown, json, prompt, feedback)",
      (value) => parseCloudCheckFormat(value),
      "markdown" as CloudCheckFormat
    )
    .option("--json", "Shortcut for --format json")
    .option("--prompt", "Shortcut for --format prompt")
    .option("--feedback", "Print only the privacy-preserving compiler feedback signal")
    .option(
      "--platform <platform>",
      "Target platform hint: iOS, macOS, watchOS, visionOS, all",
      parseCloudPlatform
    )
    .option("--build-log <text>", "Inline short Xcode build error/proof snippet")
    .option("--build-log-file <file>", "Read Xcode build log evidence from a file")
    .option("--test-failure <text>", "Inline short unit/UI test failure excerpt")
    .option(
      "--test-failure-file <file>",
      "Read unit/UI test failure evidence from a file"
    )
    .option(
      "--runtime-failure <text>",
      "Inline runtime, preview, freeze, hang, launch-timeout, or crash failure output"
    )
    .option("--runtime-failure-file <file>", "Read runtime failure evidence from a file")
    .option("--expected <text>", "Expected behavior when checking a semantic bug")
    .option("--actual <text>", "Actual behavior when checking a semantic bug")
    .option(
      "--context <file>",
      "Read a local .axint/context pack written by `axint project index`"
    )
    .option(
      "--write-feedback [dir]",
      "Write the redacted learning signal to .axint/feedback or the provided directory"
    )
    .option(
      "--diff-only",
      "Only report diagnostics on lines this branch actually changed (suppresses ambient pre-existing warnings)"
    )
    .option(
      "--diff-base <ref>",
      "Base ref for --diff-only (defaults to working tree against HEAD)"
    )
    .option(
      "--diff-cwd <dir>",
      "Repo root for --diff-only (defaults to source's git root)"
    )
    .option(
      "--no-snapshot-affinity",
      "Suppress the snapshot-baseline reminder that lists matching __Snapshots__/*.png paths"
    )
    .action(
      (
        file: string | undefined,
        options: {
          source?: string;
          format: CloudCheckFormat;
          json?: boolean;
          prompt?: boolean;
          feedback?: boolean;
          platform?: CloudCheckInput["platform"];
          buildLog?: string;
          buildLogFile?: string;
          testFailure?: string;
          testFailureFile?: string;
          runtimeFailure?: string;
          runtimeFailureFile?: string;
          expected?: string;
          actual?: string;
          context?: string;
          writeFeedback?: boolean | string;
          diffOnly?: boolean;
          diffBase?: string;
          diffCwd?: string;
          snapshotAffinity?: boolean;
        }
      ) => {
        try {
          const sourcePath = options.source ?? file;
          if (!sourcePath) {
            throw new Error("Cloud Check requires a file path or --source <file>.");
          }
          const format = options.feedback
            ? "feedback"
            : options.prompt
              ? "prompt"
              : options.json
                ? "json"
                : options.format;
          const report = runCloudCheck({
            sourcePath,
            platform: options.platform,
            xcodeBuildLog: evidenceValue(options.buildLog, options.buildLogFile),
            testFailure: evidenceValue(options.testFailure, options.testFailureFile),
            runtimeFailure: evidenceValue(
              options.runtimeFailure,
              options.runtimeFailureFile
            ),
            expectedBehavior: options.expected,
            actualBehavior: options.actual,
            projectContextPath: options.context,
            diffOnly: options.diffOnly,
            diffBaseRef: options.diffBase,
            diffCwd: options.diffCwd,
            snapshotAffinity: options.snapshotAffinity,
          });
          if (options.writeFeedback && report.learningSignal) {
            const stored = writeCloudFeedbackSignal(report.learningSignal, {
              dir:
                typeof options.writeFeedback === "string"
                  ? options.writeFeedback
                  : undefined,
            });
            console.error(`Axint feedback signal written: ${stored.path}`);
          }
          console.log(renderCloudCheckReport(report, format));
        } catch (err: unknown) {
          console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
          process.exit(1);
        }
      }
    );

  cloud
    .command("preview")
    .description("Create a browser preview room for a Mac-backed Apple app build")
    .requiredOption("--repo <url>", "GitHub repository URL to build")
    .option("--branch <branch>", "Git branch to build", "main")
    .option("--scheme <scheme>", "Xcode scheme to build (defaults to App)", "App")
    .option("--app-name <name>", "Human label for the preview room")
    .option(
      "--target <target>",
      "Preview target (ios, ipad, macos)",
      (value) => parsePreviewTarget(value),
      "ios" as CloudPreviewTarget
    )
    .option("--device <name>", "Simulator device name")
    .option(
      "--runtime <mode>",
      "Runtime mode (fast, smooth, demo)",
      (value) => parsePreviewRuntime(value),
      "fast" as CloudPreviewRuntime
    )
    .option(
      "--base-url <url>",
      "Axint Cloud base URL",
      process.env.AXINT_CLOUD_BASE_URL ?? "https://axint.ai"
    )
    .option("--json", "Print machine-readable JSON")
    .action(
      async (options: {
        repo: string;
        branch: string;
        scheme: string;
        appName?: string;
        target: CloudPreviewTarget;
        device?: string;
        runtime: CloudPreviewRuntime;
        baseUrl: string;
        json?: boolean;
      }) => {
        try {
          const baseUrl = normalizeBaseUrl(options.baseUrl);
          const payload = {
            appName: options.appName ?? inferAppName(options.repo),
            repoUrl: options.repo,
            branch: options.branch,
            scheme: options.scheme,
            targetPlatform: options.target,
            simulator:
              options.device ??
              (options.target === "macos"
                ? "Local Mac"
                : options.target === "ipad"
                  ? "iPad Pro 13-inch (M5)"
                  : "iPhone 17 Pro"),
            runtimeMode: options.runtime,
            mode: "github",
          };

          const response = await fetch(`${baseUrl}/api/cloud/preview/jobs`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: baseUrl,
            },
            body: JSON.stringify(payload),
          });
          const result = (await response.json()) as CloudPreviewPayload;
          if (!response.ok || !result.job) {
            throw new Error(
              result.message ??
                result.error ??
                `Cloud Preview failed with HTTP ${response.status}`
            );
          }

          if (options.json) {
            console.log(
              JSON.stringify(
                { ...result, roomUrl: `${baseUrl}${result.job.viewerPath}` },
                null,
                2
              )
            );
            return;
          }

          renderPreviewCreated(result.job, baseUrl);
        } catch (err: unknown) {
          console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
          process.exit(1);
        }
      }
    );

  cloud
    .command("login")
    .description("Sign in with the same GitHub-backed flow used by `axint login`")
    .action(runAxintLogin);

  cloud
    .command("status")
    .description("Show signed-in Cloud status and included Pro repair checks")
    .action(async () => {
      const creds = loadAxintCredentials();
      console.log();
      console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint Cloud\x1b[0m · status`);
      console.log();

      if (!creds) {
        console.log("  Not signed in.");
        console.log(`  Run \x1b[1maxint login\x1b[0m to unlock signed-in Pro checks.`);
        console.log(`  \x1b[2mCredentials: ${resolveCredentialsPath()}\x1b[0m`);
        console.log();
        return;
      }

      const registryUrl = creds.registry ?? registryBaseUrl();
      const response = await fetch(`${registryUrl}/api/v1/cloud/usage`, {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      });

      if (response.status === 401) {
        console.log("  Your saved token is expired or no longer valid.");
        console.log("  Run \x1b[1maxint login\x1b[0m again.");
        console.log();
        process.exit(1);
      }

      if (!response.ok) {
        console.log(`  Could not load Cloud usage (HTTP ${response.status}).`);
        console.log();
        process.exit(1);
      }

      const payload = (await response.json()) as CloudUsagePayload;
      const pro = payload.pro;
      if (!pro) {
        console.log("  Signed in, but Cloud usage is not available yet.");
        console.log();
        return;
      }

      console.log(`  Registry:       \x1b[2m${registryUrl}\x1b[0m`);
      console.log(`  Plan:           ${pro.plan}`);
      console.log(`  Pro checks:     ${pro.remaining}/${pro.included} remaining`);
      console.log(`  Used this term: ${pro.used}`);
      console.log(`  Resets:         ${formatDate(pro.resetAt)}`);
      console.log();
      console.log(
        pro.remaining > 0
          ? "  Signed-in Cloud runs can attach the Pro repair prompt while credits remain."
          : "  Free Cloud Check still works. Pro repair prompts need an upgrade path or the next reset."
      );
      console.log();
    });
}

function evidenceValue(inline?: string, file?: string): string | undefined {
  if (inline?.trim()) return inline;
  if (!file) return undefined;
  return readFileSync(file, "utf-8");
}

function parseCloudPlatform(value: string): CloudCheckInput["platform"] {
  if (
    value === "iOS" ||
    value === "macOS" ||
    value === "watchOS" ||
    value === "visionOS" ||
    value === "all"
  ) {
    return value;
  }
  throw new Error(`invalid Cloud Check platform: ${value}`);
}

function parseCloudCheckFormat(value: string): CloudCheckFormat {
  if (
    value === "markdown" ||
    value === "json" ||
    value === "prompt" ||
    value === "feedback"
  ) {
    return value;
  }
  throw new Error(`invalid Cloud Check format: ${value}`);
}

function parsePreviewRuntime(value: string): CloudPreviewRuntime {
  if (value === "fast" || value === "smooth" || value === "demo") {
    return value;
  }
  throw new InvalidArgumentError(`invalid Cloud Preview runtime: ${value}`);
}

function parsePreviewTarget(value: string): CloudPreviewTarget {
  const normalized = value.toLowerCase();
  if (normalized === "ios" || normalized === "iphone") return "ios";
  if (normalized === "ipad" || normalized === "ipados") return "ipad";
  if (normalized === "macos" || normalized === "mac" || normalized === "osx")
    return "macos";
  throw new InvalidArgumentError(`invalid Cloud Preview target: ${value}`);
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

function inferAppName(repoUrl: string): string {
  const slug = repoUrl
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean)
    .pop();
  if (!slug) return "My Apple App";
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderPreviewCreated(job: CloudPreviewJob, baseUrl: string) {
  const roomUrl = `${baseUrl}${job.viewerPath}`;
  console.log();
  console.log(
    `  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint Cloud Preview\x1b[0m · room created`
  );
  console.log();
  console.log(`  Room:     \x1b[4m${roomUrl}\x1b[0m`);
  console.log(`  App:      ${job.appName}`);
  console.log(`  Repo:     ${job.repoUrl}`);
  console.log(`  Branch:   ${job.branch}`);
  console.log(`  Scheme:   ${job.scheme}`);
  console.log(`  Target:   ${job.targetPlatform}`);
  console.log(
    `  ${job.targetPlatform === "macos" ? "Runner" : "Device"}:   ${job.simulator}`
  );
  console.log(`  Runtime:  ${job.runtimeMode}`);
  console.log(`  Status:   ${job.statusLabel}`);
  console.log();

  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    console.log(
      "  Localhost detected. The local Mac runner starts automatically when the room is created."
    );
  } else if (job.runnerCommand) {
    console.log("  Mac runner fallback:");
    console.log();
    console.log(indentBlock(job.runnerCommand, "    "));
  } else {
    console.log("  Open the room and attach hosted Mac capacity to start Xcode proof.");
  }
  console.log();
}

function indentBlock(value: string, prefix: string) {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
