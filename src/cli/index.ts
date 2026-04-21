/**
 * Axint CLI
 *
 * The command-line interface for the Axint compiler.
 *
 *   axint init [dir]              Scaffold a new Axint project
 *   axint compile <file>          Compile TS intent → Swift App Intent
 *   axint validate <file>         Validate a compiled intent
 *   axint validate-swift <path>   Validate existing Swift sources against Axint's build-time rules
 *   axint eject <file>            Eject intent to standalone Swift (no vendor lock-in)
 *   axint templates               List bundled intent templates
 *   axint login                   Authenticate with the Axint Registry and unlock fuller repair reports
 *   axint publish                 Publish an intent to the Registry
 *   axint add <package>           Install a template from the Registry
 *   axint search [query]          Search the Axint Registry for intent templates
 *   axint watch <file|dir>         Watch intent files and recompile on change
 *   axint mcp                     Start the MCP server (stdio)
 *   axint xcode setup             Configure Axint for Xcode agentic coding
 *   axint xcode verify            Verify the MCP connection is working
 *   axint xcode fix <path>        Auto-fix mechanical Swift validator errors
 *   axint xcode doctor            Audit environment for Apple-platform agentic coding
 *   axint xcode check             Print the latest Xcode Axint Check summary, prompt, or artifact path
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
import { registerTemplates } from "./templates.js";
import { registerLogin } from "./login.js";
import { registerPublish } from "./publish.js";
import { registerAdd } from "./add.js";
import { registerSearch } from "./search.js";
import { registerWatch } from "./watch.js";

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
registerTemplates(program);
registerLogin(program);
registerPublish(program, VERSION);
registerAdd(program, VERSION);
registerSearch(program, VERSION);
registerWatch(program);

// ─── mcp ─────────────────────────────────────────────────────────────

program
  .command("mcp")
  .description(
    "Start the Axint MCP server (stdio) for Claude Code, Cursor, Windsurf, Zed, or any MCP client"
  )
  .action(async () => {
    const { startMCPServer } = await import("../mcp/server.js");
    await startMCPServer();
  });

// ─── xcode ──────────────────────────────────────────────────────────

const xcode = program
  .command("xcode")
  .description("Xcode integration setup and management");

xcode
  .command("setup")
  .description("Configure Axint as an MCP server for Xcode's agentic coding workflow")
  .option("--agent <agent>", "Which agent to configure (claude, codex, all)", "all")
  .option("--remote", "Use the hosted remote MCP endpoint instead of local stdio")
  .action(async (options: { agent: string; remote: boolean }) => {
    const { setupXcode } = await import("./xcode-setup.js");
    await setupXcode(options);
  });

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
  .description("Read the latest Xcode Axint Check summary emitted by Axint build plugins")
  .option(
    "--root <dir>",
    "DerivedData root, plugin work directory, or exact latest.json packet path"
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
    async (options: {
      root?: string;
      kind: XcodePacketKind;
      format: XcodeCheckOutput;
    }) => {
      const { runXcodeCheck } = await import("./xcode-check.js");
      await runXcodeCheck(options);
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
