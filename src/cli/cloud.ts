import type { Command } from "commander";
import { loadAxintCredentials, resolveCredentialsPath } from "../core/credentials.js";
import { registryBaseUrl } from "../core/env.js";
import {
  renderCloudCheckReport,
  runCloudCheck,
  type CloudCheckFormat,
} from "../cloud/check.js";
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
    .action(
      (
        file: string | undefined,
        options: {
          source?: string;
          format: CloudCheckFormat;
          json?: boolean;
          prompt?: boolean;
          feedback?: boolean;
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
          const report = runCloudCheck({ sourcePath });
          console.log(renderCloudCheckReport(report, format));
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
