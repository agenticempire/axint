/**
 * Project scaffolder — `axint init`
 *
 * Zero-config project creation. Drops a working Axint project on disk:
 *
 *   my-app/
 *   ├── package.json          — pinned to the current Axint version
 *   ├── tsconfig.json         — strict, ES2022, module NodeNext
 *   ├── .gitignore
 *   ├── README.md             — next-steps guide
 *   ├── intents/
 *   │   └── <template>.ts     — starter intent from the template library
 *   ├── ios/
 *   │   └── Intents/          — compile output target (created on first run)
 *   └── .vscode/
 *       └── mcp.json          — ready-to-use MCP server config for Cursor/Copilot
 *
 * The scaffolder is deliberately dependency-free at runtime — everything is
 * written with `fs/promises`. It is safe to call against an existing directory
 * as long as that directory is empty (or only contains a .git folder).
 */

import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import { getTemplate } from "../templates/index.js";
import { AXINT_CONFIG_SCHEMA_URL, type AxintConfig } from "../core/axint-config.js";

export interface ScaffoldOptions {
  targetDir: string;
  projectName: string;
  template: string;
  version: string;
  install: boolean;
  experience?: "compiler" | "launchpad";
}

export interface ScaffoldResult {
  files: string[];
  entryFile: string;
  experience: "compiler" | "launchpad";
  proofFile?: string;
  shareFile?: string;
}

export async function scaffoldProject(opts: ScaffoldOptions): Promise<ScaffoldResult> {
  const {
    targetDir,
    projectName,
    template,
    version,
    install,
    experience = "compiler",
  } = opts;

  // 1. Resolve template
  const tpl = getTemplate(template);
  if (!tpl) {
    throw new Error(
      `Unknown template "${template}". Run \`axint templates\` to see available templates.`
    );
  }

  // 2. Safety check — refuse to overwrite a populated directory
  if (existsSync(targetDir)) {
    const entries = await readdir(targetDir).catch(() => []);
    const populated = entries.filter((e) => !e.startsWith(".git") && e !== ".DS_Store");
    if (populated.length > 0) {
      throw new Error(
        `Directory "${targetDir}" is not empty. Pick an empty folder or use \`axint init my-new-app\`.`
      );
    }
  } else {
    await mkdir(targetDir, { recursive: true });
  }

  const files: string[] = [];
  const write = async (rel: string, content: string) => {
    const abs = join(targetDir, rel);
    await mkdir(join(abs, "..").replace(/[/\\][^/\\]+$/, ""), { recursive: true }).catch(
      () => undefined
    );
    // Ensure parent dir exists using a more reliable approach
    const parent = abs.substring(
      0,
      abs.lastIndexOf("/") === -1 ? abs.lastIndexOf("\\") : abs.lastIndexOf("/")
    );
    if (parent && parent !== abs) {
      await mkdir(parent, { recursive: true }).catch(() => undefined);
    }
    await writeFile(abs, content, "utf-8");
    files.push(relative(targetDir, abs));
  };

  const intentTemplates =
    experience === "launchpad"
      ? unique([template, "create-reminder", "check-weather"])
      : [template];
  const compileCommands = intentTemplates.map(
    (intent) => `axint compile intents/${intent}.ts --out ios/Intents/`
  );
  const compilePlistCommands = intentTemplates.map(
    (intent) =>
      `axint compile intents/${intent}.ts --out ios/Intents/ --emit-info-plist --emit-entitlements`
  );
  const validateCommands = intentTemplates.map(
    (intent) => `axint validate intents/${intent}.ts`
  );

  const packageScripts: Record<string, string> = {
    compile: compileCommands.join(" && "),
    "compile:plist": compilePlistCommands.join(" && "),
    validate: validateCommands.join(" && "),
    sandbox: `axint validate intents/${template}.ts --sandbox`,
    proof: `npm run compile:plist && npm run validate`,
    "cloud:check": `axint cloud check intents/${template}.ts --format markdown`,
  };

  if (experience === "launchpad") {
    packageScripts["render:demo"] = "node scripts/render-demo.mjs";
    packageScripts.proof =
      "npm run compile:plist && npm run validate && npm run render:demo";
    packageScripts.demo = "npm run proof";
  }

  // 3. package.json
  await write(
    "package.json",
    JSON.stringify(
      {
        name: projectName,
        version: "0.0.1",
        private: true,
        type: "module",
        scripts: packageScripts,
        dependencies: {
          "@axint/compiler": `^${version}`,
        },
      },
      null,
      2
    ) + "\n"
  );

  // 4. tsconfig.json
  await write(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          isolatedModules: true,
          verbatimModuleSyntax: false,
          resolveJsonModule: true,
        },
        include: ["intents/**/*.ts"],
      },
      null,
      2
    ) + "\n"
  );

  // 5. .gitignore
  await write(
    ".gitignore",
    ["node_modules", "dist", ".DS_Store", ".axint-sandbox", "*.log", ""].join("\n")
  );

  // 6. The starter intent itself — pulled straight from the template library.
  //    Templates already use `@axint/compiler` which resolves against the
  //    scaffolded dependency.
  for (const intentTemplate of intentTemplates) {
    const intentTpl = getTemplate(intentTemplate);
    if (!intentTpl) {
      throw new Error(
        `Unknown template "${intentTemplate}". Run \`axint templates\` to see available templates.`
      );
    }
    await write(`intents/${intentTemplate}.ts`, intentTpl.source);
  }

  // 6a. axint.json — the canonical on-disk config. Must match the schema in
  //     src/core/axint-config.ts. Namespace is a placeholder the user edits
  //     before their first publish; everything else is ready to ship.
  const axintConfig: AxintConfig = {
    $schema: AXINT_CONFIG_SCHEMA_URL,
    namespace: "@your-handle",
    slug: slugify(projectName),
    version: "0.0.1",
    name: projectName,
    description: tpl.title,
    primary_language: "typescript",
    entry: `intents/${template}.ts`,
    license: "Apache-2.0",
    readme: "README.md",
    tags: [],
    surface_areas: [],
  };
  await write("axint.json", JSON.stringify(axintConfig, null, 2) + "\n");

  // 7. .vscode/mcp.json — ready to launch the Axint MCP server from Cursor/Claude Code
  await write(
    ".vscode/mcp.json",
    JSON.stringify(
      {
        mcpServers: {
          axint: {
            command: "npx",
            args: ["-y", "-p", "@axint/compiler", "axint-mcp"],
          },
        },
      },
      null,
      2
    ) + "\n"
  );

  // 8. Project README
  await write(
    "README.md",
    experience === "launchpad"
      ? launchpadReadme(projectName, template, tpl.title, version)
      : scaffoldReadme(projectName, template, tpl.title, version)
  );

  // 9. ios/Intents — create target dir so `compile` has somewhere to land
  await mkdir(join(targetDir, "ios", "Intents"), { recursive: true });
  await write("ios/Intents/.gitkeep", "");

  if (experience === "launchpad") {
    await write(".axint/START_HERE.md", startHere(projectName, template, tpl.title));
    await write(
      ".axint/agent-prompts/codex.md",
      agentPrompt("Codex", projectName, template)
    );
    await write(
      ".axint/agent-prompts/claude.md",
      agentPrompt("Claude Code", projectName, template)
    );
    await write(
      ".axint/agent-prompts/cursor.md",
      agentPrompt("Cursor", projectName, template)
    );
    await write(".axint/run/latest.md", firstRunProof(projectName, template, version));
    await write("docs/DEMO_SCRIPT.md", demoScript(projectName, template));
    await write("ios/App/DayAgentApp.swift", dayAgentAppSwift(projectName));
    await write("ios/App/DayAgentModels.swift", dayAgentModelsSwift());
    await write("ios/App/DayDashboardView.swift", dayDashboardViewSwift(projectName));
    await write("ios/App/README.md", dayAgentAppReadme(projectName));
    await write(
      "ios/Preview/CalendarCommandCenter.swift",
      calendarCommandCenterSwift(projectName)
    );
    await write("scripts/render-demo.mjs", renderDemoScript(projectName, version));
    await write("share/built-with-axint.html", shareCardHtml(projectName, version));
  }

  // 10. Optional npm install
  if (install) {
    await runNpmInstall(targetDir);
  }

  return {
    files,
    entryFile: `${template}.ts`,
    experience,
    proofFile: experience === "launchpad" ? ".axint/run/latest.md" : undefined,
    shareFile: experience === "launchpad" ? "share/built-with-axint.html" : undefined,
  };
}

function scaffoldReadme(
  name: string,
  template: string,
  title: string,
  version: string
): string {
  return `# ${name}

An [Axint](https://axint.ai) project — write App Intents in TypeScript, ship them to Siri.

Generated from the **${title}** template, pinned to \`@axint/compiler@^${version}\`.

## Compile it

\`\`\`bash
npm install
npm run compile
\`\`\`

Output lands in \`ios/Intents/\`. Drag that folder into your Xcode target and you're done.

## Validate it

\`\`\`bash
npm run validate              # fast IR + Swift lint
npm run sandbox               # stage 4: swift build in an SPM sandbox (macOS only)
\`\`\`

## Use with AI coding tools

The \`.vscode/mcp.json\` file is pre-wired for Cursor, Claude Code, and Windsurf.
Any agent that supports MCP can now call \`axint.compile\`, \`axint.validate\`,
\`axint.feature\`, and \`axint.templates.get\` against this project.

## Publish it

\`axint.json\` is already in place with sensible defaults. Before your first
publish, edit the \`namespace\` field (default \`@your-handle\`) to your own
registry namespace. Then:

\`\`\`bash
axint publish --dry-run    # compiles, validates, shows what would ship
axint publish              # ships it to registry.axint.ai
\`\`\`

## Next

- Edit \`intents/${template}.ts\` — this is your App Intent source of truth.
- Add more intents in the \`intents/\` folder.
- Run \`axint templates\` to see every bundled starter.
- Read the docs at https://docs.axint.ai

---

_Generated by \`axint init\`_
`;
}

function launchpadReadme(
  name: string,
  template: string,
  title: string,
  version: string
): string {
  return `# ${name}

This is a premium Axint launchpad: an Apple-native feature contract, agent-ready
instructions, local proof artifacts, and a shareable demo page in one project.

Generated from **${title}** and pinned to \`@axint/compiler@^${version}\`.

## The moment

Ask your AI agent to finish this Apple-native feature without guessing:

\`\`\`text
Read .axint/START_HERE.md, then use Axint to compile, validate, and repair this
project until the App Intent is ready for Xcode.
\`\`\`

## Run the proof loop

\`\`\`bash
npm install
npm run proof
\`\`\`

That compiles the intent, emits Swift + plist + entitlement artifacts into
\`ios/Intents/\`, then validates the source contract.

For hosted review:

\`\`\`bash
npm run cloud:check
\`\`\`

## Show the demo

Open \`share/built-with-axint.html\` after the first proof pass. It gives you a
clean local proof card for screenshots, demos, and investor/developer updates.

## Give this to your agent

- Codex: \`.axint/agent-prompts/codex.md\`
- Claude Code: \`.axint/agent-prompts/claude.md\`
- Cursor: \`.axint/agent-prompts/cursor.md\`

## Files that matter

- \`intents/${template}.ts\` is the Apple-native source contract.
- \`ios/Preview/CalendarCommandCenter.swift\` is a polished SwiftUI companion view.
- \`.axint/run/latest.md\` is the first-run proof contract.
- \`docs/DEMO_SCRIPT.md\` is the 60-second demo flow.

## Publish later

\`axint.json\` is already in place. When this becomes a reusable registry package,
set \`namespace\` to your handle and run:

\`\`\`bash
axint publish --dry-run
\`\`\`

---

Generated by \`create-axint-app\`.
`;
}

function startHere(name: string, template: string, title: string): string {
  return `# Start Here: ${name}

You are inside an Axint launchpad. Your job is to turn one AI-authored Apple
feature into validated Apple-native output without guessing.

The loop is simple: compile, validate, and repair until the Apple-native proof
is concrete enough for a human to trust.

## Product promise

This project should prove the Axint loop:

1. Read the source contract at \`intents/${template}.ts\`.
2. Compile it into Swift App Intent artifacts.
3. Validate the contract and fix anything Axint reports.
4. Keep proof in \`.axint/run/latest.md\`.
5. Do not claim this is ready for Xcode until the proof loop passes.

## Starter

- Template: ${title}
- Source: \`intents/${template}.ts\`
- Output: \`ios/Intents/\`
- Share card: \`share/built-with-axint.html\`

## Commands

\`\`\`bash
npm install
npm run proof
npm run cloud:check
\`\`\`

## Agent instruction

If a command fails, do not improvise. Read the Axint output, patch the smallest
source contract or Swift companion change, and rerun the proof command.
`;
}

function agentPrompt(agent: string, name: string, template: string): string {
  return `# Axint Prompt for ${agent}

Read \`.axint/START_HERE.md\` first.

You are helping finish \`${name}\`, an Axint-generated Apple-native launchpad.
Use Axint as the proof loop, not as decoration.

## Goal

Make the App Intent contract in \`intents/${template}.ts\` compile and validate.
Then explain the generated Swift artifacts and the smallest Xcode integration
step a human should take next.

## Required loop

1. Inspect \`intents/${template}.ts\`, \`axint.json\`, and this prompt.
2. Run \`npm run proof\`.
3. If it fails, patch the smallest relevant file.
4. Rerun until proof passes or Axint gives a concrete blocker.
5. Update \`.axint/run/latest.md\` with the final status and exact command output summary.

## Guardrails

- Do not claim the feature ships without Axint proof.
- Do not rewrite the project into a generic app scaffold.
- Keep Apple-specific details explicit: App Intents, Info.plist, entitlements, Swift output, Xcode next step.
- Keep source private unless the user asks to publish it.
`;
}

function firstRunProof(name: string, template: string, version: string): string {
  return `# Axint First-Run Proof

Project: ${name}
Template: ${template}
Compiler: @axint/compiler@${version}
Status: ready_for_first_run

## Run

\`\`\`bash
npm install
npm run proof
\`\`\`

## Expected evidence

- TypeScript intent source exists at \`intents/${template}.ts\`.
- Swift App Intent artifacts are emitted into \`ios/Intents/\`.
- Validation completes without critical diagnostics.
- If validation fails, the agent uses the Axint report as the repair contract.

## Human-ready summary

This file starts as a proof contract, not a fake pass. After the first run, paste
the final verdict here so the project has a durable local record of what Axint
proved and what still needs Xcode verification.
`;
}

function demoScript(name: string, template: string): string {
  return `# 60-Second Demo Script

## 0-10 seconds

Run:

\`\`\`bash
create-axint-app ${name}
cd ${name}
\`\`\`

Say: "This creates an Apple-native feature launchpad for AI agents, not a blank
project."

## 10-25 seconds

Open \`.axint/agent-prompts/codex.md\` or \`.axint/agent-prompts/claude.md\`.

Say: "Axint gives the agent the contract, commands, and proof loop before it
touches code."

## 25-45 seconds

Run:

\`\`\`bash
npm install
npm run proof
\`\`\`

Say: "The agent does not guess. It compiles, validates, and repairs against
Apple-native rules."

## 45-60 seconds

Open \`share/built-with-axint.html\`.

Say: "The result is a shareable proof card and real Swift artifacts for Xcode."

Source contract: \`intents/${template}.ts\`
`;
}

function dayAgentAppSwift(name: string): string {
  const appName = escapeSwiftIdentifier(titleCase(name).replace(/\s+/g, ""));
  return `import SwiftUI

@main
struct ${appName}App: App {
    var body: some Scene {
        WindowGroup {
            DayDashboardView()
        }
    }
}
`;
}

function dayAgentModelsSwift(): string {
  return `import Foundation

struct DayAgentAction: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
    let status: DayAgentStatus
}

enum DayAgentStatus: String {
    case ready = "Ready"
    case proof = "Proof"
    case repair = "Repair"
}
`;
}

function dayDashboardViewSwift(name: string): string {
  const title = escapeSwiftString(titleCase(name));
  return `import SwiftUI

struct DayDashboardView: View {
    private let actions = [
        DayAgentAction(
            title: "Create calendar event",
            detail: "Compiled from intents/create-event.ts into AppIntent Swift.",
            systemImage: "calendar.badge.plus",
            status: .ready
        ),
        DayAgentAction(
            title: "Create reminder",
            detail: "Second intent proves the starter is a multi-action agent surface.",
            systemImage: "checklist",
            status: .proof
        ),
        DayAgentAction(
            title: "Check weather",
            detail: "Third intent gives the agent enough context to coordinate a day.",
            systemImage: "cloud.sun.fill",
            status: .repair
        ),
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("${title}")
                            .font(.largeTitle.bold())
                        Text("A small Apple-native command center generated with Axint contracts, compiled Swift artifacts, and a repeatable proof loop.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }

                Section("Agent actions") {
                    ForEach(actions) { action in
                        HStack(spacing: 14) {
                            Image(systemName: action.systemImage)
                                .frame(width: 28)
                                .foregroundStyle(.orange)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(action.title)
                                    .font(.headline)
                                Text(action.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(action.status.rawValue)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(.orange.opacity(0.14), in: Capsule())
                        }
                    }
                }
            }
            .navigationTitle("Day Agent")
        }
    }
}

#Preview {
    DayDashboardView()
}
`;
}

function dayAgentAppReadme(name: string): string {
  return `# ${titleCase(name)} App Shell

This folder is a lightweight SwiftUI companion surface for the generated App
Intent contracts in \`intents/\`.

- \`DayAgentApp.swift\` provides the SwiftUI app entry point.
- \`DayAgentModels.swift\` contains small demo models.
- \`DayDashboardView.swift\` shows the three generated intent contracts as one
  Apple-native command center.

Run \`npm run proof\` from the project root before opening these files in Xcode.
`;
}

function calendarCommandCenterSwift(name: string): string {
  const title = escapeSwiftString(titleCase(name));
  return `import SwiftUI

struct CalendarCommandCenter: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.08, green: 0.08, blue: 0.10),
                    Color(red: 0.18, green: 0.10, blue: 0.08)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 24) {
                Label("Built with Axint", systemImage: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .textCase(.uppercase)

                VStack(alignment: .leading, spacing: 10) {
                    Text("${title}")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Text("An AI-authored App Intent with a compile, validate, and repair loop attached.")
                        .font(.title3)
                        .foregroundStyle(.white.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 12) {
                    ProofRow(title: "Intent contract", detail: "TypeScript source ready")
                    ProofRow(title: "Swift artifacts", detail: "Generated into ios/Intents")
                    ProofRow(title: "Repair loop", detail: "Axint proof before Xcode")
                }

                Spacer()
            }
            .padding(28)
        }
    }
}

private struct ProofRow: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.white)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.62))
            }
            Spacer()
        }
        .padding(16)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
    }
}

#Preview {
    CalendarCommandCenter()
}
`;
}

function renderDemoScript(name: string, version: string): string {
  const title = titleCase(name);
  return `import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PROJECT_NAME = ${JSON.stringify(title)};
const VERSION = ${JSON.stringify(version)};

function read(relPath, fallback = "Not generated yet. Run npm run proof first.") {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return fallback;
  return readFileSync(abs, "utf-8").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function proofSummary() {
  const raw = read(".axint/fix/latest.check.json", "{}");
  try {
    const parsed = JSON.parse(raw);
    return {
      verdict: parsed.outcome?.verdict ?? "unknown",
      headline: parsed.outcome?.headline ?? "No proof headline found",
      detail: parsed.outcome?.detail ?? "Run npm run proof to refresh the Axint proof.",
      errors: parsed.outcome?.errors ?? 0,
      warnings: parsed.outcome?.warnings ?? 0,
      swiftLines: parsed.source?.sourceLines ?? "?",
      compiler: parsed.compilerVersion ?? VERSION,
      generatedSwift:
        parsed.ai?.prompt?.match(/Generated Swift output: ([^\\\\n]+)/)?.[1] ??
        "ios/Intents/CreateEventIntent.swift",
    };
  } catch {
    return {
      verdict: "unknown",
      headline: "Proof JSON not readable yet",
      detail: "Run npm run proof to generate .axint/fix/latest.check.json.",
      errors: 0,
      warnings: 0,
      swiftLines: "?",
      compiler: VERSION,
      generatedSwift: "ios/Intents/CreateEventIntent.swift",
    };
  }
}

const proof = proofSummary();
const source = read("intents/create-event.ts");
const reminderSource = read("intents/create-reminder.ts");
const weatherSource = read("intents/check-weather.ts");
const swift = read("ios/Intents/CreateEventIntent.swift");
const reminderSwift = read("ios/Intents/CreateReminderIntent.swift");
const weatherSwift = read("ios/Intents/CheckWeatherIntent.swift");
const appShell = read("ios/App/DayDashboardView.swift");
const plist = read("ios/Intents/CreateEventIntent.plist.fragment.xml");
const entitlements = read("ios/Intents/CreateEventIntent.entitlements.fragment.xml");
const check = read(".axint/fix/latest.check.md");
const agentPrompt = read(".axint/agent-prompts/codex.md");

const panels = [
  ["App shell", "ios/App/DayDashboardView.swift", appShell],
  ["Calendar contract", "intents/create-event.ts", source],
  ["Reminder contract", "intents/create-reminder.ts", reminderSource],
  ["Weather contract", "intents/check-weather.ts", weatherSource],
  ["Calendar Swift", "ios/Intents/CreateEventIntent.swift", swift],
  ["Reminder Swift", "ios/Intents/CreateReminderIntent.swift", reminderSwift],
  ["Weather Swift", "ios/Intents/CheckWeatherIntent.swift", weatherSwift],
  ["Info.plist", "ios/Intents/CreateEventIntent.plist.fragment.xml", plist],
  ["Entitlements", "ios/Intents/CreateEventIntent.entitlements.fragment.xml", entitlements],
  ["Axint proof", ".axint/fix/latest.check.md", check],
  ["Agent prompt", ".axint/agent-prompts/codex.md", agentPrompt],
];

const html = \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Create Axint App Demo - \${escapeHtml(PROJECT_NAME)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070707;
      --ink: #fff8ee;
      --muted: rgba(255, 248, 238, 0.64);
      --line: rgba(255, 248, 238, 0.18);
      --soft: rgba(255, 248, 238, 0.06);
      --hot: #ff533d;
      --gold: #ffb15c;
      --green: #7af0a2;
      --blue: #7cc4ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 15% 8%, rgba(255, 83, 61, 0.22), transparent 29%),
        radial-gradient(circle at 78% 22%, rgba(124, 196, 255, 0.12), transparent 28%),
        linear-gradient(135deg, #080808, #130d0c 50%, #090909);
      color: var(--ink);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
    }
    main {
      width: min(1440px, calc(100vw - 48px));
      margin: 0 auto;
      padding: 52px 0 80px;
    }
    .eyebrow {
      width: max-content;
      border: 1px solid rgba(255, 83, 61, 0.5);
      color: var(--hot);
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 430px;
      gap: 28px;
      align-items: start;
      margin-top: 24px;
    }
    .panel {
      border: 1px solid var(--line);
      background: rgba(9, 9, 9, 0.76);
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
    }
    .hero-copy {
      padding: 44px;
      min-height: 560px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    h1 {
      margin: 0;
      max-width: 820px;
      font-size: clamp(58px, 8vw, 112px);
      line-height: 0.88;
      letter-spacing: -0.08em;
    }
    .lead {
      max-width: 720px;
      color: var(--muted);
      font-size: 21px;
      line-height: 1.5;
      margin: 28px 0 0;
    }
    .proof-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 36px;
    }
    .metric {
      border: 1px solid var(--line);
      padding: 18px;
      background: var(--soft);
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .metric strong {
      display: block;
      margin-top: 8px;
      font-size: 28px;
      letter-spacing: -0.04em;
    }
    .phone {
      padding: 18px;
      display: grid;
      place-items: center;
      min-height: 0;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent),
        rgba(255, 255, 255, 0.025);
    }
    .device {
      width: min(330px, 100%);
      aspect-ratio: 390 / 844;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 44px;
      background: linear-gradient(180deg, #171717, #070707);
      padding: 18px;
      box-shadow: inset 0 0 0 8px #050505, 0 24px 80px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .device-screen {
      min-height: 0;
      overflow: auto;
      scrollbar-width: none;
      padding: 0 2px 18px;
    }
    .device-screen::-webkit-scrollbar {
      display: none;
    }
    .island {
      width: 92px;
      height: 24px;
      border-radius: 999px;
      background: #000;
      margin: 0 auto 18px;
      flex: 0 0 auto;
    }
    .siri {
      border: 1px solid rgba(124, 196, 255, 0.28);
      background: radial-gradient(circle at 20% 20%, rgba(124, 196, 255, 0.18), transparent 35%), #101319;
      padding: 15px;
      border-radius: 22px;
      margin-bottom: 12px;
    }
    .siri small, .app-card small {
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .siri p {
      margin: 10px 0 0;
      font-size: 15px;
      line-height: 1.35;
    }
    .app-card {
      border: 1px solid rgba(255, 248, 238, 0.14);
      background: rgba(255, 255, 255, 0.06);
      border-radius: 24px;
      padding: 16px;
    }
    .app-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .status-chip {
      border: 1px solid rgba(122, 240, 162, 0.26);
      border-radius: 999px;
      color: var(--green);
      padding: 5px 8px;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .mini-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin: 12px 0 14px;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.25);
    }
    .mini-tab {
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--muted);
      padding: 8px 6px;
      font: inherit;
      font-size: 11px;
      font-weight: 850;
      cursor: pointer;
      transition: color 260ms cubic-bezier(0.32, 0.72, 0, 1), background 260ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .mini-tab.active {
      color: var(--ink);
      background: rgba(255, 255, 255, 0.1);
    }
    .phone-pane {
      display: none;
    }
    .phone-pane.active {
      display: block;
      animation: rise 420ms cubic-bezier(0.32, 0.72, 0, 1) both;
    }
    .event-title {
      margin: 12px 0 16px;
      font-size: 26px;
      line-height: 0.95;
      letter-spacing: -0.06em;
    }
    .field {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 10px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      font-size: 13px;
    }
    .field span { color: var(--muted); }
    .input-grid {
      display: grid;
      gap: 9px;
      margin-top: 14px;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    input, select {
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      background: rgba(0, 0, 0, 0.28);
      color: var(--ink);
      padding: 12px;
      font: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 260ms cubic-bezier(0.32, 0.72, 0, 1), transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    input:focus, select:focus {
      border-color: rgba(122, 240, 162, 0.7);
      transform: translateY(-1px);
    }
    .cta {
      margin-top: 18px;
      width: 100%;
      border: 0;
      border-radius: 16px;
      color: #170806;
      background: linear-gradient(135deg, var(--green), var(--blue));
      padding: 13px;
      font-weight: 900;
      cursor: pointer;
      transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1), filter 260ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .cta:hover { filter: brightness(1.08); transform: translateY(-1px); }
    .cta:active { transform: translateY(1px) scale(0.99); }
    .event-list {
      display: grid;
      gap: 9px;
      margin-top: 12px;
    }
    .mini-dashboard {
      display: grid;
      gap: 10px;
    }
    .hero-card {
      border-radius: 21px;
      padding: 14px;
      color: #15100b;
      background:
        radial-gradient(circle at 85% 10%, rgba(255, 255, 255, 0.8), transparent 30%),
        linear-gradient(135deg, #7af0a2, #7cc4ff);
    }
    .hero-card span {
      display: block;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.72;
    }
    .hero-card strong {
      display: block;
      margin-top: 8px;
      font-size: 23px;
      line-height: 1;
      letter-spacing: -0.06em;
    }
    .stack-card {
      display: grid;
      grid-template-columns: 34px 1fr auto;
      gap: 10px;
      align-items: center;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      padding: 11px;
      background: rgba(255, 255, 255, 0.05);
    }
    .stack-icon {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: rgba(255, 83, 61, 0.18);
      color: var(--hot);
      font-weight: 900;
    }
    .stack-card strong {
      display: block;
      font-size: 13px;
    }
    .stack-card span {
      display: block;
      color: var(--muted);
      margin-top: 3px;
      font-size: 11px;
    }
    .mini-count {
      color: var(--green);
      font-size: 11px;
      font-weight: 900;
    }
    .weather-card {
      border-radius: 22px;
      padding: 16px;
      min-height: 210px;
      background:
        radial-gradient(circle at 20% 20%, rgba(255, 177, 92, 0.36), transparent 34%),
        radial-gradient(circle at 70% 20%, rgba(124, 196, 255, 0.24), transparent 35%),
        linear-gradient(180deg, #20242b, #111318);
    }
    .weather-temp {
      margin-top: 20px;
      font-size: 58px;
      line-height: 0.9;
      letter-spacing: -0.08em;
    }
    .weather-meta {
      display: grid;
      gap: 8px;
      margin-top: 18px;
    }
    .weather-meta div {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.14);
      padding-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .event-pill {
      border: 1px solid rgba(122, 240, 162, 0.22);
      border-radius: 18px;
      background: rgba(122, 240, 162, 0.08);
      padding: 11px;
      animation: rise 500ms cubic-bezier(0.32, 0.72, 0, 1) both;
    }
    .event-pill strong {
      display: block;
      font-size: 14px;
    }
    .event-pill span {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
    }
    .empty-state {
      color: var(--muted);
      border: 1px dashed rgba(255, 255, 255, 0.16);
      border-radius: 18px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.45;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .section {
      margin-top: 28px;
      display: grid;
      grid-template-columns: 360px minmax(0, 1fr);
      gap: 28px;
    }
    .what {
      padding: 28px;
    }
    h2 {
      margin: 0;
      font-size: 34px;
      letter-spacing: -0.05em;
    }
    .built-list {
      display: grid;
      gap: 12px;
      margin-top: 22px;
    }
    .built-item {
      border: 1px solid var(--line);
      padding: 16px;
      background: rgba(255, 255, 255, 0.035);
    }
    .built-item strong { display: block; }
    .built-item span { display: block; color: var(--muted); margin-top: 5px; font-size: 13px; line-height: 1.4; }
    .tabs {
      min-width: 0;
    }
    .tabbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 18px;
      border-bottom: 1px solid var(--line);
    }
    .tabbar button {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.04);
      color: var(--muted);
      padding: 10px 12px;
      font: inherit;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .tabbar button.active {
      color: var(--ink);
      border-color: rgba(255, 83, 61, 0.65);
      background: rgba(255, 83, 61, 0.14);
    }
    .code-title {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-family: "SF Mono", ui-monospace, monospace;
      font-size: 12px;
    }
    pre {
      margin: 0;
      min-height: 520px;
      max-height: 680px;
      overflow: auto;
      padding: 22px;
      color: #efe7df;
      font-family: "SF Mono", ui-monospace, monospace;
      font-size: 13px;
      line-height: 1.65;
      background: rgba(0, 0, 0, 0.28);
    }
    .command {
      margin-top: 24px;
      border: 1px solid var(--line);
      padding: 16px 18px;
      font-family: "SF Mono", ui-monospace, monospace;
      color: var(--ink);
      background: rgba(255, 255, 255, 0.04);
    }
    @media (max-width: 980px) {
      main { width: min(100vw - 24px, 720px); padding-top: 24px; }
      .hero, .section { grid-template-columns: 1fr; }
      .hero-copy { padding: 28px; min-height: auto; }
      .proof-grid { grid-template-columns: 1fr 1fr; }
      .phone { min-height: auto; }
    }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Create Axint App - actual generated output</div>
    <section class="hero">
      <div class="panel hero-copy">
        <div>
          <h1>\${escapeHtml(PROJECT_NAME)} built a real Apple mini app.</h1>
          <p class="lead">This is not a static proof card. The project generated three App Intent contracts, a SwiftUI Day Agent shell, plist and entitlement fragments, agent instructions, and an Axint proof packet your AI can repair from.</p>
          <div class="proof-grid">
            <div class="metric"><span>Verdict</span><strong>\${escapeHtml(proof.verdict)}</strong></div>
            <div class="metric"><span>Errors</span><strong>\${proof.errors}</strong></div>
            <div class="metric"><span>Warnings</span><strong>\${proof.warnings}</strong></div>
            <div class="metric"><span>Compiler</span><strong>\${escapeHtml(proof.compiler)}</strong></div>
          </div>
          <div class="command">$ npm run proof</div>
        </div>
      </div>
      <div class="panel phone">
        <div class="device">
          <div class="island"></div>
          <div class="device-screen">
            <div class="siri">
              <small>Siri / Shortcuts command</small>
              <p>"Plan my morning: create a design review, remind me to send the brief, and check Cupertino weather."</p>
            </div>
            <div class="app-card">
              <div class="app-head">
                <div>
                  <small>Generated mini app</small>
                  <div class="event-title">Day Agent</div>
                </div>
                <div class="status-chip">Axint pass</div>
              </div>
              <div class="field"><span>App shell</span><b>SwiftUI</b></div>
              <div class="field"><span>Capabilities</span><b>3 intents</b></div>
              <div class="field"><span>Apple proof</span><b>\${escapeHtml(proof.headline)}</b></div>
              <div class="mini-tabs">
                <button class="mini-tab active" data-phone-tab="today">Today</button>
                <button class="mini-tab" data-phone-tab="calendar">Calendar</button>
                <button class="mini-tab" data-phone-tab="weather">Weather</button>
              </div>
              <div class="phone-pane active" id="pane-today">
                <div class="mini-dashboard">
                  <div class="hero-card">
                    <span>Agent-ready day plan</span>
                    <strong>Three Apple surfaces from one command.</strong>
                  </div>
                  <div class="stack-card">
                    <div class="stack-icon">C</div>
                    <div><strong>CreateEventIntent</strong><span>Design Review at 10:00 AM</span></div>
                    <div class="mini-count">ready</div>
                  </div>
                  <div class="stack-card">
                    <div class="stack-icon">R</div>
                    <div><strong>CreateReminderIntent</strong><span>Send brief before 9:30 AM</span></div>
                    <div class="mini-count">ready</div>
                  </div>
                  <div class="stack-card">
                    <div class="stack-icon">W</div>
                    <div><strong>CheckWeatherIntent</strong><span>Cupertino, Fahrenheit</span></div>
                    <div class="mini-count">ready</div>
                  </div>
                </div>
              </div>
              <div class="phone-pane" id="pane-calendar">
                <div class="input-grid">
                  <label>Event title <input id="event-title" value="Design Review"></label>
                  <label>When <input id="event-date" type="datetime-local"></label>
                  <label>Duration <select id="event-duration"><option>15 minutes</option><option selected>30 minutes</option><option>45 minutes</option><option>1 hour</option></select></label>
                </div>
                <button class="cta" id="create-event">Create event through Axint intent</button>
                <div class="event-list" id="event-list">
                  <div class="event-pill"><strong>Design Review</strong><span>Wed, May 6, 10:00 AM - 30 minutes - created by CreateEventIntent</span></div>
                </div>
              </div>
              <div class="phone-pane" id="pane-weather">
                <div class="weather-card">
                  <small>Weather capability</small>
                  <div class="weather-temp">72°</div>
                  <div>Sunny in Cupertino</div>
                  <div class="weather-meta">
                    <div><span>Intent</span><b>CheckWeatherIntent</b></div>
                    <div><span>Unit</span><b>Fahrenheit</b></div>
                    <div><span>Widget-ready</span><b>Yes</b></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <aside class="panel what">
        <h2>What got built?</h2>
        <div class="built-list">
          <div class="built-item"><strong>1. App Intent source contract</strong><span>The editable AI-friendly definition in TypeScript.</span></div>
          <div class="built-item"><strong>2. Swift App Intent</strong><span>Apple-native Swift output for Siri and Shortcuts.</span></div>
          <div class="built-item"><strong>3. Apple metadata</strong><span>Info.plist usage copy and Siri entitlement fragments.</span></div>
          <div class="built-item"><strong>4. Agent repair prompt</strong><span>Codex/Claude/Cursor get the exact proof loop instead of guessing.</span></div>
          <div class="built-item"><strong>5. Axint proof packet</strong><span>The durable verdict with diagnostics and next action.</span></div>
        </div>
      </aside>

      <section class="panel tabs">
        <div class="tabbar">
          \${panels
            .map((panel, index) => \`<button data-tab="\${index}" class="\${index === 0 ? "active" : ""}">\${escapeHtml(panel[0])}</button>\`)
            .join("")}
        </div>
        <div class="code-title">
          <span id="panel-title">\${escapeHtml(panels[0][0])}</span>
          <span id="panel-path">\${escapeHtml(panels[0][1])}</span>
        </div>
        <pre id="panel-code">\${escapeHtml(panels[0][2])}</pre>
      </section>
    </section>
  </main>

  <script>
    const panels = \${JSON.stringify(panels)};
    const buttons = [...document.querySelectorAll("[data-tab]")];
    const title = document.getElementById("panel-title");
    const path = document.getElementById("panel-path");
    const code = document.getElementById("panel-code");
    const eventTitle = document.getElementById("event-title");
    const eventDate = document.getElementById("event-date");
    const eventDuration = document.getElementById("event-duration");
    const eventList = document.getElementById("event-list");
    const createEvent = document.getElementById("create-event");
    const phoneTabs = [...document.querySelectorAll("[data-phone-tab]")];
    const phonePanes = {
      today: document.getElementById("pane-today"),
      calendar: document.getElementById("pane-calendar"),
      weather: document.getElementById("pane-weather"),
    };
    const escapeHtml = (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    defaultDate.setHours(10, 0, 0, 0);
    eventDate.value = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        const panel = panels[Number(button.dataset.tab)];
        title.textContent = panel[0];
        path.textContent = panel[1];
        code.innerHTML = escapeHtml(panel[2]);
      });
    });
    phoneTabs.forEach((button) => {
      button.addEventListener("click", () => {
        phoneTabs.forEach((tab) => tab.classList.remove("active"));
        button.classList.add("active");
        Object.values(phonePanes).forEach((pane) => pane?.classList.remove("active"));
        phonePanes[button.dataset.phoneTab]?.classList.add("active");
      });
    });
    createEvent.addEventListener("click", () => {
      const titleValue = eventTitle.value.trim() || "Untitled event";
      const dateValue = eventDate.value ? new Date(eventDate.value) : new Date();
      const friendlyDate = dateValue.toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const item = document.createElement("div");
      item.className = "event-pill";
      item.innerHTML =
        "<strong>" +
        escapeHtml(titleValue) +
        "</strong><span>" +
        escapeHtml(friendlyDate) +
        " - " +
        escapeHtml(eventDuration.value) +
        " - created by CreateEventIntent</span>";
      if (eventList.querySelector(".empty-state")) eventList.innerHTML = "";
      eventList.prepend(item);
    });
  </script>
</body>
</html>
\`;

mkdirSync(join(ROOT, "share"), { recursive: true });
writeFileSync(join(ROOT, "share", "built-with-axint.html"), html, "utf-8");
console.log("Rendered actual Axint demo -> share/built-with-axint.html");
`;
}

function shareCardHtml(name: string, version: string): string {
  const title = escapeHtml(titleCase(name));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Built with Axint - ${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --ink: #fff7ef;
      --muted: rgba(255, 247, 239, 0.62);
      --line: rgba(255, 247, 239, 0.18);
      --hot: #ff533d;
      --gold: #ffb15c;
      --bg: #080808;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 24% 18%, rgba(255, 83, 61, 0.22), transparent 30%),
        radial-gradient(circle at 74% 68%, rgba(150, 88, 255, 0.16), transparent 34%),
        linear-gradient(135deg, #080808, #15100f 52%, #090909);
      color: var(--ink);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
      padding: 36px;
    }
    .card {
      width: min(1120px, 100%);
      border: 1px solid var(--line);
      background: rgba(10, 10, 10, 0.78);
      box-shadow: 0 32px 110px rgba(0, 0, 0, 0.52);
      overflow: hidden;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      min-height: 560px;
    }
    .copy, .proof {
      padding: 56px;
    }
    .copy {
      border-right: 1px solid var(--line);
    }
    .eyebrow {
      width: max-content;
      border: 1px solid rgba(255, 83, 61, 0.45);
      color: var(--hot);
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 42px;
    }
    h1 {
      margin: 0;
      font-size: clamp(54px, 8vw, 98px);
      line-height: 0.88;
      letter-spacing: -0.075em;
    }
    p {
      max-width: 610px;
      color: var(--muted);
      font-size: 20px;
      line-height: 1.55;
      margin: 28px 0 0;
    }
    .command {
      margin-top: 42px;
      border: 1px solid var(--line);
      padding: 18px 20px;
      color: var(--ink);
      font-family: "SF Mono", ui-monospace, monospace;
      font-size: 15px;
      background: rgba(255, 255, 255, 0.04);
    }
    .proof {
      display: grid;
      align-content: center;
      gap: 16px;
      background:
        linear-gradient(180deg, rgba(255, 83, 61, 0.08), transparent),
        rgba(255, 255, 255, 0.025);
    }
    .row {
      display: grid;
      grid-template-columns: 34px 1fr auto;
      gap: 14px;
      align-items: center;
      border: 1px solid var(--line);
      padding: 18px;
      background: rgba(0, 0, 0, 0.24);
    }
    .dot {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      color: #0b160f;
      background: #74f19c;
      border-radius: 999px;
      font-weight: 900;
    }
    .row strong { display: block; font-size: 17px; }
    .row span { color: var(--muted); font-size: 13px; }
    .badge {
      color: var(--gold);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-top: 1px solid var(--line);
      padding: 22px 56px;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 860px) {
      body { padding: 16px; }
      .hero { grid-template-columns: 1fr; }
      .copy { border-right: 0; border-bottom: 1px solid var(--line); }
      .copy, .proof { padding: 34px; }
      .footer { padding: 22px 34px; flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="card">
    <section class="hero">
      <div class="copy">
        <div class="eyebrow">Apple-native agent proof</div>
        <h1>${title}<br>ships with Axint.</h1>
        <p>Your AI wrote the Apple feature contract. Axint compiled it, validated it, and left the repair loop your agent can follow instead of guessing through Swift and Xcode.</p>
        <div class="command">$ npm run proof</div>
      </div>
      <div class="proof">
        <div class="row">
          <div class="dot">1</div>
          <div><strong>Intent contract</strong><span>TypeScript source is the durable Apple-native spec.</span></div>
          <div class="badge">Ready</div>
        </div>
        <div class="row">
          <div class="dot">2</div>
          <div><strong>Swift artifacts</strong><span>App Intent, plist, and entitlement output are generated.</span></div>
          <div class="badge">Proof</div>
        </div>
        <div class="row">
          <div class="dot">3</div>
          <div><strong>Agent repair loop</strong><span>Failures become a concrete Axint repair contract.</span></div>
          <div class="badge">Loop</div>
        </div>
      </div>
    </section>
    <footer class="footer">
      <span>Generated by create-axint-app</span>
      <span>@axint/compiler ${version} - https://axint.ai</span>
    </footer>
  </main>
</body>
</html>
`;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeSwiftString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeSwiftIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "");
  if (!cleaned) return "AxintLaunchpad";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `Axint${cleaned}`;
}

// Project names like "My-Cool App_v2" → "my-cool-app-v2". Registry slugs
// must match [a-z0-9][a-z0-9-]{0,48}, so we strip anything that isn't
// lowercase alphanumeric or a dash, collapse repeats, and trim boundaries.
function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = cleaned.slice(0, 49);
  return slug.length > 0 ? slug : "my-intent";
}

function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install"], { cwd, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
