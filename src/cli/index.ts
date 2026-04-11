/**
 * Axint CLI
 *
 * The command-line interface for the Axint compiler.
 *
 *   axint init [dir]              Scaffold a new Axint project
 *   axint compile <file>          Compile TS intent → Swift App Intent
 *   axint validate <file>         Validate a compiled intent
 *   axint eject <file>            Eject intent to standalone Swift (no vendor lock-in)
 *   axint templates               List bundled intent templates
 *   axint login                   Authenticate with the Axint Registry
 *   axint publish                 Publish an intent to the Registry
 *   axint add <package>           Install a template from the Registry
 *   axint mcp                     Start the MCP server (stdio)
 *   axint --version               Show version
 */

import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFile, compileFromIR, irFromJSON } from "../core/compiler.js";
import { ejectIntent } from "../core/eject.js";
import { scaffoldProject } from "./scaffold.js";
import { listTemplates, getTemplate } from "../templates/index.js";

// Read version from package.json so it stays in sync
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));
const VERSION = pkg.version as string;

const program = new Command();

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
          console.log(
            `    npx axint compile intents/${result.entryFile} --out ios/Intents/`
          );
        } else {
          console.log(`    npm install`);
          console.log(
            `    npx axint compile intents/${result.entryFile} --out ios/Intents/`
          );
        }
        console.log();
        console.log(`  \x1b[2mDocs:   https://axint.ai/docs\x1b[0m`);
        console.log(
          `  \x1b[2mMCP:    npx axint-mcp (add to Claude Code, Cursor, Windsurf)\x1b[0m`
        );
        console.log();
      } catch (err: unknown) {
        console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    }
  );

// ─── compile ─────────────────────────────────────────────────────────

program
  .command("compile")
  .description("Compile a TypeScript intent definition into Swift")
  .argument("<file>", "Path to the TypeScript intent definition")
  .option("-o, --out <dir>", "Output directory for generated Swift", ".")
  .option("--no-validate", "Skip validation of generated Swift")
  .option("--stdout", "Print generated Swift to stdout instead of writing a file")
  .option("--json", "Output result as JSON (machine-readable)")
  .option(
    "--emit-info-plist",
    "Emit a <Name>.plist.fragment.xml with NSAppIntentsDomains next to the Swift file"
  )
  .option(
    "--emit-entitlements",
    "Emit a <Name>.entitlements.fragment.xml next to the Swift file"
  )
  .option(
    "--sandbox",
    "Run stage 4 validation: swift build in an SPM sandbox (macOS only)"
  )
  .option(
    "--format",
    "Pipe generated Swift through swift-format with the Axint house style (macOS/Linux if swift-format is on $PATH)"
  )
  .option(
    "--strict-format",
    "Fail the build if swift-format is missing or errors (implies --format)"
  )
  .option(
    "--from-ir",
    "Treat <file> as IR JSON (from Python SDK or any language) instead of TypeScript. Use - to read from stdin."
  )
  .action(
    async (
      file: string,
      options: {
        out: string;
        validate: boolean;
        stdout: boolean;
        json: boolean;
        emitInfoPlist: boolean;
        emitEntitlements: boolean;
        sandbox: boolean;
        format: boolean;
        strictFormat: boolean;
        fromIr: boolean;
      }
    ) => {
      const filePath = resolve(file);

      try {
        let result;

        if (options.fromIr) {
          // Cross-language bridge: read IR JSON and skip the TS parser
          let irRaw: string;
          if (file === "-") {
            // Read from stdin
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk as Buffer);
            }
            irRaw = Buffer.concat(chunks).toString("utf-8");
          } else {
            irRaw = readFileSync(filePath, "utf-8");
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(irRaw);
          } catch {
            console.error(`\x1b[31merror:\x1b[0m Invalid JSON in ${file}`);
            process.exit(1);
          }

          // Accept both a single IR object and an array (Python SDK emits arrays)
          const irData = Array.isArray(parsed)
            ? (parsed[0] as Record<string, unknown>)
            : (parsed as Record<string, unknown>);
          if (!irData || typeof irData !== "object") {
            console.error(
              `\x1b[31merror:\x1b[0m Expected an IR object or array in ${file}`
            );
            process.exit(1);
          }

          const ir = irFromJSON(irData);
          result = compileFromIR(ir, {
            outDir: options.out,
            validate: options.validate,
            emitInfoPlist: options.emitInfoPlist,
            emitEntitlements: options.emitEntitlements,
          });
        } else {
          result = compileFile(filePath, {
            outDir: options.out,
            validate: options.validate,
            emitInfoPlist: options.emitInfoPlist,
            emitEntitlements: options.emitEntitlements,
          });
        }

        // JSON mode — output everything as structured JSON and exit
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: result.success,
                swift: result.output?.swiftCode ?? null,
                outputPath: result.output?.outputPath ?? null,
                infoPlistFragment: result.output?.infoPlistFragment ?? null,
                entitlementsFragment: result.output?.entitlementsFragment ?? null,
                diagnostics: result.diagnostics.map((d) => ({
                  code: d.code,
                  severity: d.severity,
                  message: d.message,
                  file: d.file,
                  line: d.line,
                  suggestion: d.suggestion,
                })),
              },
              null,
              2
            )
          );
          if (!result.success) process.exit(1);
          return;
        }

        // Print diagnostics
        for (const d of result.diagnostics) {
          const prefix =
            d.severity === "error"
              ? "\x1b[31merror\x1b[0m"
              : d.severity === "warning"
                ? "\x1b[33mwarning\x1b[0m"
                : "\x1b[36minfo\x1b[0m";

          console.error(`  ${prefix}[${d.code}]: ${d.message}`);
          if (d.file) console.error(`    --> ${d.file}${d.line ? `:${d.line}` : ""}`);
          if (d.suggestion) console.error(`    = help: ${d.suggestion}`);
          console.error();
        }

        if (!result.success || !result.output) {
          console.error(
            `\x1b[31mCompilation failed with ${result.diagnostics.filter((d) => d.severity === "error").length} error(s)\x1b[0m`
          );
          process.exit(1);
        }

        // Optional swift-format pass — mutate the swiftCode in place before writing
        if (options.format || options.strictFormat) {
          try {
            const { formatSwift } = await import("../core/format.js");
            const fmt = await formatSwift(result.output.swiftCode, {
              strict: options.strictFormat,
            });
            if (fmt.ran) {
              result.output.swiftCode = fmt.formatted;
            } else if (!options.json) {
              console.error(
                `\x1b[33mwarning:\x1b[0m swift-format skipped — ${fmt.reason}`
              );
            }
          } catch (fmtErr: unknown) {
            if (options.strictFormat) {
              console.error(`\x1b[31merror:\x1b[0m ${(fmtErr as Error).message}`);
              process.exit(1);
            }
            console.error(
              `\x1b[33mwarning:\x1b[0m swift-format skipped — ${(fmtErr as Error).message}`
            );
          }
        }

        if (options.stdout) {
          console.log(result.output.swiftCode);
        } else {
          const outPath = resolve(result.output.outputPath);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, result.output.swiftCode, "utf-8");
          console.log(`\x1b[32m✓\x1b[0m Compiled ${result.output.ir.name} → ${outPath}`);

          // Emit optional fragments next to the Swift file
          if (options.emitInfoPlist && result.output.infoPlistFragment) {
            const plistPath = outPath.replace(/\.swift$/, ".plist.fragment.xml");
            writeFileSync(plistPath, result.output.infoPlistFragment, "utf-8");
            console.log(`\x1b[32m✓\x1b[0m Info.plist fragment → ${plistPath}`);
          }

          if (options.emitEntitlements && result.output.entitlementsFragment) {
            const entPath = outPath.replace(/\.swift$/, ".entitlements.fragment.xml");
            writeFileSync(entPath, result.output.entitlementsFragment, "utf-8");
            console.log(`\x1b[32m✓\x1b[0m Entitlements fragment → ${entPath}`);
          }
        }

        // Stage 4 validation: SPM sandbox compile
        if (options.sandbox && !options.stdout) {
          try {
            const { sandboxCompile } = await import("../core/sandbox.js");
            console.log();
            console.log(`\x1b[36m→\x1b[0m Stage 4: SPM sandbox compile...`);
            const sandboxResult = await sandboxCompile(result.output.swiftCode, {
              intentName: result.output.ir.name,
            });
            if (sandboxResult.ok) {
              console.log(
                `\x1b[32m✓\x1b[0m Swift builds cleanly (${sandboxResult.durationMs}ms in ${sandboxResult.sandboxPath})`
              );
            } else {
              console.error(
                `\x1b[31m✗\x1b[0m Sandbox compile failed:\n${sandboxResult.stderr}`
              );
              process.exit(1);
            }
          } catch (sbErr: unknown) {
            console.error(
              `\x1b[33mwarning:\x1b[0m sandbox compile skipped — ${(sbErr as Error).message}`
            );
          }
        }

        const warnings = result.diagnostics.filter(
          (d) => d.severity === "warning"
        ).length;
        if (warnings > 0) {
          console.log(`  ${warnings} warning(s)`);
        }
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "format" in err &&
          typeof (err as Record<string, unknown>).format === "function"
        ) {
          console.error((err as { format: () => string }).format());
        } else {
          console.error(`\x1b[31merror:\x1b[0m ${err}`);
        }
        process.exit(1);
      }
    }
  );

// ─── validate ────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate a TypeScript intent definition without generating output")
  .argument("<file>", "Path to the TypeScript intent definition")
  .option(
    "--sandbox",
    "Run stage 4 validation: swift build in an SPM sandbox (macOS only)"
  )
  .action(async (file: string, options: { sandbox: boolean }) => {
    const filePath = resolve(file);

    try {
      const result = compileFile(filePath, { validate: true });

      for (const d of result.diagnostics) {
        const prefix =
          d.severity === "error"
            ? "\x1b[31merror\x1b[0m"
            : d.severity === "warning"
              ? "\x1b[33mwarning\x1b[0m"
              : "\x1b[36minfo\x1b[0m";
        console.error(`  ${prefix}[${d.code}]: ${d.message}`);
        if (d.suggestion) console.error(`    = help: ${d.suggestion}`);
      }

      if (!result.success) {
        process.exit(1);
      }

      if (options.sandbox && result.output) {
        const { sandboxCompile } = await import("../core/sandbox.js");
        console.log(`\x1b[36m→\x1b[0m Stage 4: SPM sandbox compile...`);
        const sandboxResult = await sandboxCompile(result.output.swiftCode, {
          intentName: result.output.ir.name,
        });
        if (!sandboxResult.ok) {
          console.error(`\x1b[31m✗\x1b[0m ${sandboxResult.stderr}`);
          process.exit(1);
        }
        console.log(
          `\x1b[32m✓\x1b[0m Valid intent definition (sandbox-verified, ${sandboxResult.durationMs}ms)`
        );
      } else {
        console.log(`\x1b[32m✓\x1b[0m Valid intent definition`);
      }
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "format" in err &&
        typeof (err as Record<string, unknown>).format === "function"
      ) {
        console.error((err as { format: () => string }).format());
      } else {
        console.error(`\x1b[31merror:\x1b[0m ${err}`);
      }
      process.exit(1);
    }
  });

// ─── eject ──────────────────────────────────────────────────────────

program
  .command("eject")
  .description("Eject an intent to standalone Swift with no Axint dependency")
  .argument("<file>", "Path to the TypeScript intent definition")
  .option("-o, --out <dir>", "Output directory for ejected files", ".")
  .option("--include-tests", "Generate a basic XCTest file alongside the Swift")
  .option(
    "--format",
    "Pipe generated Swift through swift-format with the Axint house style (macOS/Linux if swift-format is on $PATH)"
  )
  .action(
    async (
      file: string,
      options: {
        out: string;
        includeTests: boolean;
        format: boolean;
      }
    ) => {
      const filePath = resolve(file);

      try {
        // Read source
        let source: string;
        try {
          source = readFileSync(filePath, "utf-8");
        } catch (_err) {
          console.error(`\x1b[31merror:\x1b[0m Cannot read file: ${filePath}`);
          process.exit(1);
        }

        // Eject
        const result = ejectIntent(source, basename(filePath), {
          outDir: options.out,
          includeTests: options.includeTests,
          format: options.format,
        });

        // Write all files
        const filesWritten: string[] = [];

        // Swift file
        mkdirSync(dirname(result.swiftFile.path), { recursive: true });
        writeFileSync(result.swiftFile.path, result.swiftFile.content, "utf-8");
        filesWritten.push("Swift");

        // Optional Info.plist fragment
        if (result.infoPlist) {
          writeFileSync(result.infoPlist.path, result.infoPlist.content, "utf-8");
          filesWritten.push("Info.plist fragment");
        }

        // Optional entitlements fragment
        if (result.entitlements) {
          writeFileSync(result.entitlements.path, result.entitlements.content, "utf-8");
          filesWritten.push("entitlements fragment");
        }

        // Optional test file
        if (result.testFile) {
          writeFileSync(result.testFile.path, result.testFile.content, "utf-8");
          filesWritten.push("XCTest file");
        }

        // Success message
        console.log();
        console.log(
          `\x1b[32m✓\x1b[0m Ejected → ${filesWritten.length} file(s) (${filesWritten.join(", ")})`
        );
        console.log();
        console.log(`  \x1b[1mOutput directory:\x1b[0m ${resolve(options.out)}`);
        console.log();
        console.log(`  These files are now standalone and have no Axint dependency.`);
        console.log(
          `  You can commit them to version control and use them in your project.`
        );
        console.log();
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "format" in err &&
          typeof (err as Record<string, unknown>).format === "function"
        ) {
          console.error((err as { format: () => string }).format());
        } else {
          console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        }
        process.exit(1);
      }
    }
  );

// ─── templates ───────────────────────────────────────────────────────

program
  .command("templates")
  .description("List bundled intent templates")
  .argument("[name]", "Template name to print (omit to list all)")
  .option("--json", "Output as JSON")
  .action((name: string | undefined, options: { json: boolean }) => {
    if (!name) {
      const list = listTemplates();
      if (options.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      console.log(`  \x1b[1mBundled templates\x1b[0m (${list.length})`);
      console.log();
      for (const t of list) {
        console.log(
          `    \x1b[38;5;208m◆\x1b[0m ${t.name}  \x1b[2m— ${t.description}\x1b[0m`
        );
      }
      console.log();
      console.log(
        `  \x1b[2mUse:  axint templates <name>  or  axint init -t <name>\x1b[0m`
      );
      return;
    }

    const tpl = getTemplate(name);
    if (!tpl) {
      console.error(`\x1b[31merror:\x1b[0m template "${name}" not found`);
      process.exit(1);
    }
    if (options.json) {
      console.log(JSON.stringify(tpl, null, 2));
      return;
    }
    console.log(tpl.source);
  });

// ─── login ──────────────────────────────────────────────────────────
//
// Device-code flow for CLI auth against registry.axint.ai.
// Opens the browser to complete GitHub OAuth, polls for the token,
// stores it in ~/.axint/credentials.json.

program
  .command("login")
  .description("Authenticate with the Axint Registry via GitHub")
  .action(async () => {
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawn } = await import("node:child_process");

    const configDir = join(homedir(), ".axint");
    const credPath = join(configDir, "credentials.json");
    const registryUrl = process.env.AXINT_REGISTRY_URL ?? "https://registry.axint.ai";

    console.log();
    console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · login`);
    console.log();

    try {
      // Request a device code from the registry
      const res = await fetch(`${registryUrl}/api/v1/auth/device-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "axint-cli" }),
      });

      if (!res.ok) {
        console.error(
          `\x1b[31merror:\x1b[0m Failed to start login flow (HTTP ${res.status})`
        );
        process.exit(1);
      }

      const { device_code, user_code, verification_uri, interval } =
        (await res.json()) as {
          device_code: string;
          user_code: string;
          verification_uri: string;
          interval: number;
        };

      console.log(`  Open this URL in your browser:`);
      console.log();
      console.log(`    \x1b[1;4m${verification_uri}\x1b[0m`);
      console.log();
      console.log(`  And enter this code: \x1b[1;38;5;208m${user_code}\x1b[0m`);
      console.log();
      console.log(`  \x1b[2mWaiting for authorization…\x1b[0m`);

      // Best-effort browser open — spawn with array args to avoid shell injection
      try {
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        spawn(openCmd, [verification_uri], { stdio: "ignore", detached: true }).unref();
      } catch {
        // non-blocking — user can open the URL manually
      }

      // Poll for the token
      const pollInterval = (interval ?? 5) * 1000;
      let token: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const pollRes = await fetch(`${registryUrl}/api/v1/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code, grant_type: "device_code" }),
        });

        if (pollRes.ok) {
          const data = (await pollRes.json()) as { access_token: string };
          token = data.access_token;
          break;
        }

        const err = (await pollRes.json()) as { error?: string };
        if (err.error === "authorization_pending") continue;
        if (err.error === "slow_down") {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        if (err.error === "expired_token") {
          console.error(
            `\x1b[31merror:\x1b[0m Login timed out. Run \`axint login\` again.`
          );
          process.exit(1);
        }
        console.error(`\x1b[31merror:\x1b[0m ${err.error ?? "Unknown error"}`);
        process.exit(1);
      }

      if (!token) {
        console.error(`\x1b[31merror:\x1b[0m Login timed out after 5 minutes.`);
        process.exit(1);
      }

      // Save credentials
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        credPath,
        JSON.stringify({ access_token: token, registry: registryUrl }, null, 2),
        "utf-8"
      );

      console.log(
        `  \x1b[32m✓\x1b[0m Logged in! Credentials saved to \x1b[2m${credPath}\x1b[0m`
      );
      console.log();
    } catch (err: unknown) {
      console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
      process.exit(1);
    }
  });

// ─── publish ────────────────────────────────────────────────────────
//
// Reads axint.json from the current directory, compiles the intent,
// and publishes it to registry.axint.ai.

program
  .command("publish")
  .description("Publish an intent to the Axint Registry")
  .option("--dry-run", "Validate and show what would be published without uploading")
  .option("--tag <tags...>", "Override tags")
  .action(async (options: { dryRun?: boolean; tag?: string[] }) => {
    const cwd = process.cwd();
    const configPath = resolve(cwd, "axint.json");

    console.log();
    console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · publish`);
    console.log();

    // 1. Read axint.json
    if (!existsSync(configPath)) {
      console.error(`  \x1b[31merror:\x1b[0m No axint.json found in ${cwd}`);
      console.error(`  \x1b[2mRun \`axint init\` to create one.\x1b[0m`);
      process.exit(1);
    }

    let config: {
      name: string;
      namespace: string;
      slug: string;
      version: string;
      description?: string;
      primary_language?: string;
      surface_areas?: string[];
      tags?: string[];
      license?: string;
      homepage?: string;
      repository?: string;
      entry?: string;
      readme?: string;
      siri_phrases?: string[];
      permissions?: string[];
    };

    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.error(`  \x1b[31merror:\x1b[0m Failed to parse axint.json`);
      process.exit(1);
    }

    const entryFile = config.entry ?? "intent.ts";
    const entryPath = resolve(cwd, entryFile);

    if (!existsSync(entryPath)) {
      console.error(`  \x1b[31merror:\x1b[0m Entry file not found: ${entryFile}`);
      process.exit(1);
    }

    console.log(`  \x1b[2m⏺\x1b[0m Compiling ${entryFile}…`);

    // 2. Compile
    let result: Awaited<ReturnType<typeof compileFile>>;
    try {
      result = await compileFile(entryPath, {});
    } catch (err: unknown) {
      console.error(`  \x1b[31m✗\x1b[0m Compilation failed: ${(err as Error).message}`);
      process.exit(1);
    }

    if (!result.success || !result.output) {
      console.error(`  \x1b[31m✗\x1b[0m Compilation failed`);
      for (const d of result.diagnostics) {
        console.error(`    [${d.code}] ${d.message}`);
      }
      process.exit(1);
    }

    console.log(
      `  \x1b[32m✓\x1b[0m Compiled → ${result.output.swiftCode.split("\n").length} lines of Swift`
    );

    // 3. Read optional files
    let readme: string | undefined;
    const readmePath = resolve(cwd, config.readme ?? "README.md");
    if (existsSync(readmePath)) {
      readme = readFileSync(readmePath, "utf-8");
    }

    let pySource: string | undefined;
    const pyPath = resolve(cwd, entryFile.replace(/\.ts$/, ".py"));
    if (existsSync(pyPath)) {
      pySource = readFileSync(pyPath, "utf-8");
    }

    const tags = options.tag ?? config.tags ?? [];
    const namespace = config.namespace.startsWith("@")
      ? config.namespace
      : `@${config.namespace}`;

    const payload = {
      namespace,
      slug: config.slug,
      name: config.name,
      version: config.version,
      description: config.description,
      readme,
      primary_language: config.primary_language ?? (pySource ? "both" : "typescript"),
      surface_areas: config.surface_areas ?? [],
      tags,
      license: config.license ?? "Apache-2.0",
      homepage: config.homepage,
      repository: config.repository,
      ts_source: readFileSync(entryPath, "utf-8"),
      py_source: pySource,
      swift_output: result.output.swiftCode,
      plist_fragment: result.output.infoPlistFragment ?? null,
      ir: result.output.ir ?? {},
      compiler_version: VERSION,
    };

    if (options.dryRun) {
      console.log(`  \x1b[32m✓\x1b[0m Validation passed`);
      console.log();
      console.log(
        `  Would publish: \x1b[1m${namespace}/${config.slug}@${config.version}\x1b[0m`
      );
      console.log(
        `  Bundle size:   ${Buffer.from(JSON.stringify(payload)).byteLength} bytes`
      );
      console.log(`  Tags:          ${tags.join(", ") || "(none)"}`);
      console.log();
      return;
    }

    // 4. Load credentials
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const credPath = join(homedir(), ".axint", "credentials.json");

    if (!existsSync(credPath)) {
      console.error(`  \x1b[31merror:\x1b[0m Not logged in. Run \`axint login\` first.`);
      process.exit(1);
    }

    let creds: { access_token: string; registry: string };
    try {
      creds = JSON.parse(readFileSync(credPath, "utf-8"));
    } catch {
      console.error(
        `  \x1b[31merror:\x1b[0m Corrupt credentials file. Run \`axint login\` again.`
      );
      process.exit(1);
    }

    const registryUrl = creds.registry ?? "https://registry.axint.ai";

    console.log(`  \x1b[2m⏺\x1b[0m Publishing to ${registryUrl}…`);

    // 5. Publish
    try {
      const res = await fetch(`${registryUrl}/api/v1/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.access_token}`,
          "X-Axint-Version": VERSION,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ detail: res.statusText }))) as {
          detail?: string;
          title?: string;
        };
        console.error(
          `  \x1b[31m✗\x1b[0m ${err.title ?? "Publish failed"}: ${err.detail ?? res.statusText}`
        );
        process.exit(1);
      }

      const data = (await res.json()) as { url: string };

      console.log(`  \x1b[32m✓\x1b[0m Published!`);
      console.log();
      console.log(`    ${data.url}`);
      console.log();
      console.log(`  \x1b[2mInstall: axint add ${namespace}/${config.slug}\x1b[0m`);
      console.log();
    } catch (err: unknown) {
      console.error(`  \x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
      process.exit(1);
    }
  });

// ─── add ────────────────────────────────────────────────────────────
//
// Install a template from the Axint Registry.
// Usage: axint add @namespace/slug[@version] [--to dir]

program
  .command("add")
  .description("Install a template from the Axint Registry")
  .argument(
    "<package>",
    "Template to install (e.g., @axintai/create-event or @axintai/create-event@1.0.0)"
  )
  .option("--to <dir>", "Target directory", "intents")
  .action(async (pkg: string, options: { to: string }) => {
    console.log();
    console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · add`);
    console.log();

    // Parse @namespace/slug@version
    const match = pkg.match(/^(@[a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:@(.+))?$/);
    if (!match) {
      console.error(
        `  \x1b[31merror:\x1b[0m Invalid package format. Expected: @namespace/slug or @namespace/slug@version`
      );
      process.exit(1);
    }

    const [, namespace, slug, version] = match;
    const registryUrl = process.env.AXINT_REGISTRY_URL ?? "https://registry.axint.ai";

    console.log(
      `  \x1b[2m⏺\x1b[0m Fetching ${namespace}/${slug}${version ? `@${version}` : ""}…`
    );

    try {
      const params = new URLSearchParams({ namespace, slug });
      if (version) params.set("version", version);

      const res = await fetch(`${registryUrl}/api/v1/install?${params}`, {
        headers: { "X-Axint-Version": VERSION },
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ detail: res.statusText }))) as {
          detail?: string;
        };
        console.error(
          `  \x1b[31m✗\x1b[0m ${err.detail ?? `Template not found (HTTP ${res.status})`}`
        );
        process.exit(1);
      }

      const data = (await res.json()) as {
        template: { name: string; full_name: string; primary_language: string };
        version: {
          version: string;
          ts_source?: string;
          py_source?: string;
          swift_output: string;
        };
        bundle_sha256: string;
      };

      const targetDir = resolve(options.to, slug);
      mkdirSync(targetDir, { recursive: true });

      // Write source files
      const ver = data.version;
      const filesWritten: string[] = [];

      if (ver.ts_source) {
        writeFileSync(resolve(targetDir, "intent.ts"), ver.ts_source, "utf-8");
        filesWritten.push("intent.ts");
      }
      if (ver.py_source) {
        writeFileSync(resolve(targetDir, "intent.py"), ver.py_source, "utf-8");
        filesWritten.push("intent.py");
      }
      writeFileSync(resolve(targetDir, "intent.swift"), ver.swift_output, "utf-8");
      filesWritten.push("intent.swift");

      console.log(
        `  \x1b[32m✓\x1b[0m Installed ${data.template.full_name}@${ver.version}`
      );
      console.log(`    → ${targetDir}/`);
      filesWritten.forEach((f) => console.log(`      ${f}`));
      console.log();
      console.log(`  \x1b[1mNext:\x1b[0m`);
      console.log(`    axint compile ${options.to}/${slug}/intent.ts --out ios/Intents/`);
      console.log();
    } catch (err: unknown) {
      console.error(`  \x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
      process.exit(1);
    }
  });

// ─── mcp ─────────────────────────────────────────────────────────────
//
// Starts the Axint MCP server over stdio so any MCP-capable client
// (Claude Code, Claude Desktop, Cursor, Windsurf, Zed, etc.) can call
// `axint.compile`, `axint.validate`, `axint.scaffold`, and the template
// tools directly. The server implementation lives in src/mcp/server.ts
// and is also exposed as the standalone `axint-mcp` bin; this
// subcommand just routes through the same entry point so users can run
// `npx -y @axintai/compiler mcp` without a second package install.

program
  .command("mcp")
  .description(
    "Start the Axint MCP server (stdio) for Claude Code, Cursor, Windsurf, Zed, or any MCP client"
  )
  .action(async () => {
    const { startMCPServer } = await import("../mcp/server.js");
    await startMCPServer();
  });

// Helper used by scaffold to avoid a circular import
export function __axintExistsSync(p: string) {
  return existsSync(p);
}

program.parse();
