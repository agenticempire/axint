/**
 * Axint CLI
 *
 * The command-line interface for the Axint compiler.
 *
 *   axint init [dir]              Scaffold a new Axint project
 *   axint compile <file>          Compile TS intent → Swift App Intent
 *   axint validate <file>         Validate a compiled intent
 *   axint validate-swift <path...> Validate existing Swift sources against Axint's build-time rules
 *   axint eject <file>            Eject intent to standalone Swift (no vendor lock-in)
 *   axint format <file>           Format a .axint source file in canonical style
 *   axint templates               List bundled intent templates
 *   axint login                   Authenticate with the Axint Registry and unlock fuller repair reports
 *   axint cloud check --source    Run an agent-callable Cloud Check on a file
 *   axint cloud status            Show Cloud sign-in and Pro repair-check allowance
 *   axint tokens ingest --source  Convert design tokens into SwiftUI token enums
 *   axint schema compile <file>   Compile compact JSON schemas into Swift
 *   axint feature <description>   Generate a multi-file feature package
 *   axint repair <issue>          Plan a project-aware Apple repair loop
 *   axint feedback create         Create privacy-safe repair feedback packets
 *   axint publish                 Publish an intent to the Registry
 *   axint add <package>           Install a template from the Registry
 *   axint search [query]          Search the Axint Registry for intent templates
 *   axint watch <file|dir>         Watch intent files and recompile on change
 *   axint status                  Show local package/runtime status and MCP reload steps
 *   axint upgrade                 Check/apply Axint upgrades without losing agent context
 *   axint doctor                  Audit version truth, MCP wiring, and project start files
 *   axint project init            Write Axint project-start files for agent workflows
 *   axint project index           Index the local Apple project into .axint/context
 *   axint session start           Start an enforced Axint agent session and refresh context
 *   axint workflow check          Run workflow gates from CLI when MCP is unavailable
 *   axint run                     Run Axint's enforced Apple build/test/runtime loop
 *   axint run status              Show the latest or selected run job state
 *   axint run cancel              Cancel the latest or selected active run job
 *   axint runner once             Execute one BYO-Mac runner Axint job
 *   axint mcp                     Start the MCP server (stdio)
 *   axint mcp status              Show local MCP launch command and reload steps
 *   axint xcode install           Install the full Axint Xcode workflow in one pass
 *   axint xcode setup             Configure Axint for Xcode agentic coding
 *   axint xcode guard             Check/write the Axint Xcode drift guard
 *   axint xcode verify            Verify the MCP connection is working
 *   axint xcode fix <path>        Auto-fix mechanical Swift validator errors
 *   axint xcode doctor            Audit environment for Apple-platform agentic coding
 *   axint xcode check             Check a Swift file directly or print the latest Xcode Axint Check summary
 *   axint xcode packet            Print the latest Xcode Fix Packet or AI prompt
 *   axint xcode extension install Install the notarized Axint Source Editor Extension
 *   axint xcode extension status  Report whether the extension is installed
 *   axint --version               Show version
 */

import { Command, InvalidArgumentError } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { XcodeCheckOutput } from "./xcode-check.js";
import type { XcodePacketKind, XcodePacketOutput } from "./xcode-packet.js";
import { scaffoldProject } from "./scaffold.js";
import { registerCompile } from "./compile.js";
import { registerValidate } from "./validate.js";
import { registerValidateSwift } from "./validate-swift.js";
import { registerEject } from "./eject.js";
import { registerFormat } from "./format.js";
import { registerTemplates } from "./templates.js";
import { registerLogin } from "./login.js";
import { registerCloud } from "./cloud.js";
import { registerTokens } from "./tokens.js";
import { registerSchema } from "./schema.js";
import { registerFeature } from "./feature.js";
import { registerRepair } from "./repair.js";
import { registerFeedback } from "./feedback.js";
import { registerPublish } from "./publish.js";
import { registerAdd } from "./add.js";
import { registerSearch } from "./search.js";
import { registerWatch } from "./watch.js";
import { registerStatus, renderCliStatus } from "./status.js";
import { registerUpgrade } from "./upgrade.js";
import { registerDoctor } from "./doctor.js";
import { registerProject } from "./project.js";
import { registerSession } from "./session.js";
import { registerWorkflow } from "./workflow.js";
import { registerRun } from "./run.js";
import { registerXcodeGuard } from "./xcode-guard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));
const VERSION = pkg.version as string;

const program = new Command();
const XCODE_PACKET_KINDS = ["any", "compile", "validate"] as const;
const XCODE_CHECK_FORMATS = ["markdown", "json", "prompt", "path"] as const;
const XCODE_PACKET_FORMATS = ["markdown", "prompt", "json", "path"] as const;

function parseChoice<T extends string>(
  label: string,
  value: string,
  choices: readonly T[]
): T {
  const normalized = value.trim().toLowerCase();
  if ((choices as readonly string[]).includes(normalized)) {
    return normalized as T;
  }

  throw new InvalidArgumentError(
    `invalid ${label}: ${value} (expected one of ${choices.join(", ")})`
  );
}

program
  .name("axint")
  .description(
    "The open-source compiler that transforms AI agent definitions into native Apple App Intents."
  )
  .version(VERSION);

// ─── init ────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Scaffold a new Axint project (zero-config, ready to compile)")
  .argument("[dir]", "Project directory (defaults to current dir)", ".")
  .option(
    "-t, --template <name>",
    "Starter template (send-message, create-event, book-ride, ...)",
    "create-event"
  )
  .option("--no-install", "Skip running `npm install`")
  .option("--name <name>", "Project name (defaults to the directory name)")
  .action(
    async (
      dir: string,
      options: { template: string; install: boolean; name?: string }
    ) => {
      const targetDir = resolve(dir);
      const projectName = options.name ?? basename(targetDir);

      try {
        const result = await scaffoldProject({
          targetDir,
          projectName,
          template: options.template,
          version: VERSION,
          install: options.install,
        });

        console.log();
        console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · project ready`);
        console.log();
        console.log(
          `    \x1b[2m${result.files.length} files written to ${targetDir}\x1b[0m`
        );
        console.log();
        console.log(`  \x1b[1mNext:\x1b[0m`);
        if (dir !== ".") console.log(`    cd ${dir}`);
        if (options.install) {
          console.log(`    npm run compile`);
        } else {
          console.log(`    npm install`);
          console.log(`    npm run compile`);
        }
        console.log();
        console.log(
          `  \x1b[2mDocs:   https://github.com/agenticempire/axint#readme\x1b[0m`
        );
        console.log(
          `  \x1b[2mMCP:    .vscode/mcp.json is ready for Cursor, Claude Code, and Windsurf\x1b[0m`
        );
        console.log();
      } catch (err: unknown) {
        console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    }
  );

// ─── subcommands ──────────────────────────────────────────────────────

registerCompile(program);
registerValidate(program);
registerValidateSwift(program);
registerEject(program);
registerFormat(program);
registerTemplates(program);
registerLogin(program);
registerCloud(program);
registerTokens(program);
registerSchema(program);
registerFeature(program);
registerRepair(program);
registerFeedback(program);
registerPublish(program, VERSION);
registerAdd(program, VERSION);
registerSearch(program, VERSION);
registerWatch(program);
registerStatus(program, VERSION);
registerUpgrade(program, VERSION);
registerDoctor(program, VERSION);
registerProject(program, VERSION);
registerSession(program, VERSION);
registerWorkflow(program);
registerRun(program, VERSION);

// ─── mcp ─────────────────────────────────────────────────────────────

const mcp = program
  .command("mcp")
  .description(
    "Start the Axint MCP server (stdio) for Claude Code, Cursor, Windsurf, Zed, or any MCP client"
  )
  .action(async () => {
    const { startMCPServer } = await import("../mcp/server.js");
    await startMCPServer();
  });

mcp
  .command("status")
  .description("Show local Axint MCP launch details and reload steps")
  .option("--format <format>", "Output format: markdown, json, or prompt", "markdown")
  .action((options: { format?: "markdown" | "json" | "prompt" }) => {
    console.log(renderCliStatus(VERSION, options.format ?? "markdown"));
  });

// ─── xcode ──────────────────────────────────────────────────────────

const xcode = program
  .command("xcode")
  .description("Xcode integration setup and management");

xcode
  .command("install")
  .description(
    "Install the full Axint Xcode workflow: MCP setup, guarded project files, context index, and verification"
  )
  .option("--agent <agent>", "Which agent to configure (claude, codex, all)", "claude")
  .option("--remote", "Use the hosted remote MCP endpoint instead of local stdio")
  .option(
    "--local-build",
    "Use this checkout's built dist/mcp/register.js instead of the npm package"
  )
  .option("--project <dir>", "Project directory for guarded setup", ".")
  .option("--name <name>", "Project name for guarded setup")
  .option("--no-verify", "Skip the final MCP verification pass")
  .action(
    async (options: {
      agent: string;
      remote: boolean;
      localBuild?: boolean;
      project?: string;
      name?: string;
      verify?: boolean;
    }) => {
      const { installXcodeWorkflow } = await import("./xcode-setup.js");
      await installXcodeWorkflow(options);
    }
  );

xcode
  .command("setup")
  .description("Configure Axint as an MCP server for Xcode's agentic coding workflow")
  .option("--agent <agent>", "Which agent to configure (claude, codex, all)", "all")
  .option("--remote", "Use the hosted remote MCP endpoint instead of local stdio")
  .option(
    "--guarded",
    "Also write project Axint memory and an Xcode guard proof file for this project"
  )
  .option(
    "--local-build",
    "Use this checkout's built dist/mcp/register.js instead of the npm package"
  )
  .option("--project <dir>", "Project directory for guarded setup", ".")
  .option("--name <name>", "Project name for guarded setup")
  .action(
    async (options: {
      agent: string;
      remote: boolean;
      guarded?: boolean;
      localBuild?: boolean;
      project?: string;
      name?: string;
    }) => {
      const { setupXcode } = await import("./xcode-setup.js");
      await setupXcode(options);
    }
  );

registerXcodeGuard(xcode);

xcode
  .command("verify")
  .description("Verify Axint MCP connection is working in Xcode")
  .action(async () => {
    const { verifyXcode } = await import("./xcode-setup.js");
    await verifyXcode();
  });

xcode
  .command("fix")
  .description("Auto-fix mechanical Swift validator errors (dry-run by default)")
  .argument("<path>", "Swift file or directory to fix")
  .option("--apply", "Write changes to disk (omit for a dry-run preview)")
  .action(async (pathArg: string, options: { apply?: boolean }) => {
    const { runXcodeFix } = await import("./xcode-fix.js");
    await runXcodeFix(pathArg, { apply: options.apply ?? false });
  });

xcode
  .command("doctor")
  .description("Audit your environment for Apple-platform agentic coding")
  .action(async () => {
    const { runXcodeDoctor } = await import("./xcode-doctor.js");
    await runXcodeDoctor();
  });

xcode
  .command("check")
  .description(
    "Check a current Swift file directly, or read the latest emitted Xcode Axint Check summary"
  )
  .argument(
    "[file]",
    "Swift file to check directly. Omit to read the latest emitted Xcode packet summary."
  )
  .option(
    "--root <dir>",
    "DerivedData root, plugin work directory, or exact latest.json packet path"
  )
  .option("--source <file>", "Swift file to check directly")
  .option("--project <dir>", "Project root for direct file checks")
  .option(
    "--platform <platform>",
    "Target platform for direct file checks (iOS, macOS, watchOS, visionOS, all)"
  )
  .option("--build-log <text>", "Inline Xcode build log evidence for direct file checks")
  .option("--test-failure <text>", "Inline failing test evidence for direct file checks")
  .option(
    "--runtime-failure <text>",
    "Inline runtime or interaction failure evidence for direct file checks"
  )
  .option("--expected <text>", "Expected behavior for direct file checks")
  .option("--actual <text>", "Actual behavior for direct file checks")
  .option(
    "--changed <files...>",
    "Changed files to pin into the refreshed project context"
  )
  .option(
    "--no-refresh-context",
    "Skip refreshing .axint/context before direct file checks"
  )
  .option(
    "--kind <kind>",
    "Check type to read (any, compile, validate)",
    (value) => parseChoice("kind", value, XCODE_PACKET_KINDS),
    "any"
  )
  .option(
    "--format <format>",
    "Output format (markdown, json, prompt, path)",
    (value) => parseChoice("format", value, XCODE_CHECK_FORMATS),
    "markdown"
  )
  .action(
    async (
      file: string | undefined,
      options: {
        root?: string;
        source?: string;
        project?: string;
        platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
        buildLog?: string;
        testFailure?: string;
        runtimeFailure?: string;
        expected?: string;
        actual?: string;
        changed?: string[];
        refreshContext?: boolean;
        kind: XcodePacketKind;
        format: XcodeCheckOutput;
      }
    ) => {
      const { runXcodeCheck } = await import("./xcode-check.js");
      await runXcodeCheck({
        root: options.root,
        sourcePath: options.source ?? file,
        project: options.project,
        platform: options.platform,
        xcodeBuildLog: options.buildLog,
        testFailure: options.testFailure,
        runtimeFailure: options.runtimeFailure,
        expectedBehavior: options.expected,
        actualBehavior: options.actual,
        changedFiles: options.changed,
        refreshContext: options.refreshContext,
        kind: options.kind,
        format: options.format,
      });
    }
  );

xcode
  .command("packet")
  .description("Read the latest Xcode Fix Packet emitted by Axint build plugins")
  .option(
    "--root <dir>",
    "DerivedData root, plugin work directory, or exact latest.json packet path"
  )
  .option(
    "--kind <kind>",
    "Packet type to read (any, compile, validate)",
    (value) => parseChoice("kind", value, XCODE_PACKET_KINDS),
    "any"
  )
  .option(
    "--format <format>",
    "Output format (markdown, prompt, json, path)",
    (value) => parseChoice("format", value, XCODE_PACKET_FORMATS),
    "markdown"
  )
  .action(
    async (options: {
      root?: string;
      kind: XcodePacketKind;
      format: XcodePacketOutput;
    }) => {
      const { runXcodePacket } = await import("./xcode-packet.js");
      await runXcodePacket(options);
    }
  );

const xcodeExtension = xcode
  .command("extension")
  .description("Manage the Axint Xcode Source Editor Extension");

xcodeExtension
  .command("install")
  .description("Download and install the latest notarized Axint extension")
  .option("--force", "Replace an existing install with the latest release")
  .option("--dir <dir>", "Install directory (defaults to ~/Applications)")
  .action(async (options: { force?: boolean; dir?: string }) => {
    const { installXcodeExtension } = await import("./xcode-extension.js");
    await installXcodeExtension(options);
  });

xcodeExtension
  .command("status")
  .description("Report whether the Axint extension is installed and its version")
  .action(async () => {
    const { xcodeExtensionStatus } = await import("./xcode-extension.js");
    await xcodeExtensionStatus();
  });

// Helper used by scaffold to avoid a circular import
export function __axintExistsSync(p: string) {
  return existsSync(p);
}

program.parse();
