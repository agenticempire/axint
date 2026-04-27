import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { buildAxintDocsContext } from "./docs-context.js";
import { buildAxintOperatingMemory } from "./operating-memory.js";
import { buildAxintRehydrationGuide } from "./rehydration.js";

export type ProjectAgent = "claude" | "codex" | "all";
export type ProjectMcpMode = "local" | "remote";
export type ProjectStartPackFormat = "markdown" | "json";

export interface ProjectStartPackInput {
  targetDir?: string;
  projectName?: string;
  agent?: ProjectAgent;
  mode?: ProjectMcpMode;
  version?: string;
}

export interface ProjectStartPackFile {
  path: string;
  content: string;
  purpose: string;
}

export interface ProjectStartPackResult {
  projectName: string;
  targetDir: string;
  version: string;
  mode: ProjectMcpMode;
  agent: ProjectAgent;
  files: ProjectStartPackFile[];
  startPrompt: string;
}

export interface WriteProjectStartPackOptions extends ProjectStartPackInput {
  force?: boolean;
  dryRun?: boolean;
}

export interface WriteProjectStartPackResult extends ProjectStartPackResult {
  written: string[];
  skipped: string[];
}

const AXINT_PACKAGE = "@axint/compiler";
const AXINT_MCP_BIN = "axint-mcp";
const REMOTE_MCP_URL = "https://mcp.axint.ai/mcp";
const DOCS = [
  "https://docs.axint.ai/guides/live-now/",
  "https://docs.axint.ai/mcp/xcode/",
  "https://docs.axint.ai/guides/xcode-happy-path/",
  "https://docs.axint.ai/guides/cloud-check-loop/",
  "https://docs.axint.ai/guides/fix-packets/",
  "https://docs.axint.ai/reference/cli/",
];

export function buildProjectStartPack(
  input: ProjectStartPackInput = {}
): ProjectStartPackResult {
  const targetDir = resolve(input.targetDir ?? process.cwd());
  const projectName = input.projectName ?? basename(targetDir) ?? "AppleApp";
  const version = input.version ?? "unknown";
  const mode = input.mode ?? "local";
  const agent = input.agent ?? "all";
  const mcpConfig = buildMcpConfig(mode);
  const startPrompt = buildStartPrompt({ projectName, version });
  const files: ProjectStartPackFile[] = [
    {
      path: ".mcp.json",
      purpose:
        "Project-local MCP wiring for Xcode, Claude, Codex, and other MCP clients.",
      content: `${JSON.stringify(mcpConfig, null, 2)}\n`,
    },
    {
      path: "AGENTS.md",
      purpose: "Agent workflow contract for Codex-style coding agents.",
      content: buildAgentInstructions({ projectName, version, agent }),
    },
    {
      path: "CLAUDE.md",
      purpose: "Claude/Xcode start instructions that force the Axint loop early.",
      content: buildAgentInstructions({ projectName, version, agent: "claude" }),
    },
    {
      path: ".axint/AXINT_MEMORY.md",
      purpose:
        "Compact Axint operating memory for new chats and context-compaction recovery.",
      content: buildAxintOperatingMemory({
        projectName,
        expectedVersion: version,
      }),
    },
    {
      path: ".axint/AXINT_REHYDRATE.md",
      purpose:
        "Short rehydration contract that agents must read after new chats, compaction, or drift.",
      content: buildAxintRehydrationGuide({
        projectName,
        expectedVersion: version,
      }),
    },
    {
      path: ".axint/AXINT_DOCS_CONTEXT.md",
      purpose:
        "Project-local Axint docs context so agents can reload the workflow after compaction without rereading the web.",
      content: buildAxintDocsContext({
        projectName,
        expectedVersion: version,
      }),
    },
    {
      path: ".axint/project.json",
      purpose: "Machine-readable Axint project contract and required workflow gates.",
      content: `${JSON.stringify(
        {
          schema: "https://axint.ai/schemas/project-start-pack.v1.json",
          projectName,
          axintVersion: version,
          mode,
          docs: DOCS,
          requiredLoop: [
            "axint.session.start",
            "axint.xcode.guard",
            "axint.status",
            "axint.workflow.check",
            "axint.suggest",
            "axint.feature or axint.scaffold",
            "axint.xcode.write for guarded file writes when available",
            "axint.swift.validate",
            "axint.cloud.check",
            "axint.run",
            "Xcode build/test evidence",
          ],
          session: {
            required: true,
            file: ".axint/session/current.json",
            startTool: "axint.session.start",
            workflowCheckRequiresToken: true,
          },
          contextRecovery: {
            triggers: [
              "new agent chat",
              "context compaction",
              "after 10 minutes without an Axint tool call",
              "before any multi-file Swift edit",
              "before claiming a bug is fixed",
            ],
            requiredActions: [
              "call axint.session.start",
              "call axint.xcode.guard with stage=context-recovery",
              "read .axint/AXINT_REHYDRATE.md",
              "read .axint/AXINT_MEMORY.md",
              "read .axint/AXINT_DOCS_CONTEXT.md or call axint.context.docs",
              "read AGENTS.md, CLAUDE.md, or .axint/project.json",
              "call axint.status",
              "call axint.workflow.check with stage context-recovery, sessionToken=<token>, readRehydrationContext=true, readDocsContext=true, readAgentInstructions=true, and ranStatus=true",
              "state the next Axint tool that will be used, or call axint.run for the full validation/build loop",
            ],
          },
          rules: {
            noStaticOnlyBugClaims: true,
            restartMcpAfterUpdate: true,
            cloudCheckNeedsRuntimeEvidenceForViews: true,
            preferAxintRunForBuildTestRuntimeProof: true,
            recoverAxintAfterContextCompaction: true,
            doNotWorkLongerThanTenMinutesWithoutAxintCheckpoint: true,
            preferXcodeGuardBeforeLongTasks: true,
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: ".axint/README.md",
      purpose: "Human-readable local Axint operating manual for this project.",
      content: buildLocalAxintReadme({ projectName, version, startPrompt }),
    },
  ];

  return { projectName, targetDir, version, mode, agent, files, startPrompt };
}

export function writeProjectStartPack(
  options: WriteProjectStartPackOptions = {}
): WriteProjectStartPackResult {
  const pack = buildProjectStartPack(options);
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of pack.files) {
    const fullPath = resolve(pack.targetDir, file.path);
    if (existsSync(fullPath) && !options.force) {
      skipped.push(file.path);
      continue;
    }
    if (!options.dryRun) {
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
    }
    written.push(file.path);
  }

  return { ...pack, written, skipped };
}

export function renderProjectStartPack(
  pack: ProjectStartPackResult | WriteProjectStartPackResult,
  format: ProjectStartPackFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(pack, null, 2);

  const lines = [
    "# Axint Project Start Pack",
    "",
    `- Project: ${pack.projectName}`,
    `- Target: ${pack.targetDir}`,
    `- Axint: ${pack.version}`,
    `- MCP mode: ${pack.mode}`,
    `- Agent target: ${pack.agent}`,
    "",
    "## Files",
    ...pack.files.map((file) => `- ${file.path}: ${file.purpose}`),
  ];

  if ("written" in pack) {
    lines.push(
      "",
      "## Write Result",
      pack.written.length > 0
        ? `- Written: ${pack.written.join(", ")}`
        : "- Written: none",
      pack.skipped.length > 0
        ? `- Skipped existing files: ${pack.skipped.join(", ")}`
        : "- Skipped existing files: none"
    );
  } else {
    lines.push("", "## File Contents");
    for (const file of pack.files) {
      lines.push("", `### ${file.path}`, "```", file.content.trimEnd(), "```");
    }
  }

  lines.push("", "## Start Prompt", "```text", pack.startPrompt, "```");
  return lines.join("\n");
}

function buildMcpConfig(mode: ProjectMcpMode): unknown {
  if (mode === "remote") {
    return {
      mcpServers: {
        axint: {
          url: REMOTE_MCP_URL,
        },
      },
    };
  }

  const npxPath = detectNpxPath() ?? "npx";
  return {
    mcpServers: {
      axint: {
        type: "stdio",
        command: npxPath,
        args: ["-y", "-p", AXINT_PACKAGE, AXINT_MCP_BIN],
        env: {
          PATH: buildDurablePath(npxPath),
        },
      },
    },
  };
}

function buildStartPrompt(input: { projectName: string; version: string }): string {
  return [
    `We are working on ${input.projectName}. Use Axint before editing Apple-native code.`,
    "",
    "First, read the current Axint docs in full enough to follow the workflow:",
    ...DOCS.map((url, index) => `${index + 1}. ${url}`),
    "",
    "Then do this exact startup sequence:",
    "1. Call axint.session.start for this project. Keep the returned sessionToken visible.",
    "2. Call axint.xcode.guard with stage=context-recovery so this chat writes .axint/guard/latest.* proof before any long task.",
    "3. Read .axint/AXINT_REHYDRATE.md, .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, or .axint/project.json if present.",
    "4. If those files are missing, call axint.context.memory and axint.context.docs, then use those as the compact Axint operating memory and docs context.",
    "5. List MCP servers/tools and confirm axint is available.",
    "6. Call axint.status and report the running MCP server version.",
    "7. Call axint.workflow.check with stage context-recovery, sessionToken=<token>, readRehydrationContext=true, readAgentInstructions=true, readDocsContext=true, and ranStatus=true.",
    `8. Expected Axint package version from this project pack: ${input.version}.`,
    "9. If the running MCP version is stale, stop and tell me to update Axint, rerun axint xcode setup --agent claude --guarded, and restart this Xcode agent chat.",
    "10. Call axint.xcode.guard before long tasks, before broad Swift edits, and after any context recovery.",
    "11. Call axint.workflow.check with sessionToken at planning, before-write, pre-build, and pre-commit checkpoints.",
    "12. Before planning new Apple-native surfaces, call axint.suggest.",
    "13. For generated surfaces, use axint.feature, axint.scaffold, axint.compile, or axint.schema.compile before hand-writing from scratch.",
    "14. Prefer axint.run before each build so the session, workflow gate, Swift validation, Cloud Check, xcodebuild, tests, and runtime evidence stay tied together.",
    "15. When writing new Swift files from MCP, prefer axint.xcode.write so validation, Cloud Check, and guard proof happen with the write.",
    "16. If you cannot use axint.run, manually run axint.swift.validate on changed Swift and axint.cloud.check with source plus Xcode/test/runtime evidence when available.",
    "17. Never claim there is no bug from Axint alone. Cloud Check is static unless build, UI test, or runtime evidence is supplied.",
    "18. If Axint passes but Xcode/tests/runtime fails, report the failure as an Axint feedback signal before continuing.",
    "",
    "Context recovery rule: if this chat was compacted, restarted, or you are unsure whether Axint was used recently, stop and rerun steps 1-6 before continuing.",
    "Long-task rule: do not work more than 10 minutes or make broad multi-file Swift changes without an Axint checkpoint.",
  ].join("\n");
}

function buildAgentInstructions(input: {
  projectName: string;
  version: string;
  agent: ProjectAgent;
}): string {
  const agentLine =
    input.agent === "all"
      ? "These rules apply to Claude, Codex, Cursor, and any MCP agent."
      : `These rules apply to ${input.agent}.`;
  return `# Axint Agent Workflow

Project: ${input.projectName}
Expected Axint version: ${input.version}

${agentLine}

## Start Every New Chat

Paste or follow this prompt:

\`\`\`text
${buildStartPrompt({ projectName: input.projectName, version: input.version })}
\`\`\`

## Context Recovery

If the chat was restarted, compacted, summarized, or has drifted into ordinary Xcode coding, run this before continuing:

1. Call \`axint.session.start\` and keep the returned \`sessionToken\`.
2. Call \`axint.xcode.guard\` with \`stage: "context-recovery"\` so the project records \`.axint/guard/latest.*\` proof for this chat.
3. Read \`.axint/AXINT_REHYDRATE.md\`, \`.axint/AXINT_MEMORY.md\`, \`.axint/AXINT_DOCS_CONTEXT.md\`, \`AGENTS.md\`, \`CLAUDE.md\`, or \`.axint/project.json\`.
4. If either Axint context file is missing, call \`axint.context.memory\` and \`axint.context.docs\`.
5. Call \`axint.status\` and compare it with the expected version above.
6. Call \`axint.workflow.check\` with \`stage: "context-recovery"\`, \`sessionToken\`, \`readRehydrationContext: true\`, \`readAgentInstructions: true\`, \`readDocsContext: true\`, and \`ranStatus: true\`.
7. State the next Axint tool to use before editing code. For proof passes, prefer \`axint.run\`.

Do not rely on model memory alone. Rehydrate the workflow from the files.

## Required Loop

1. Call \`axint.session.start\` and persist the returned token in the workflow check calls.
2. Call \`axint.xcode.guard\` after session start, before long tasks, and after context recovery.
3. Read the Axint docs listed in the start prompt.
4. Call \`axint.status\`.
5. Call \`axint.workflow.check\` with \`sessionToken\` at session start, after context recovery, before planning, before writing, before building, and before committing.
6. If \`axint.workflow.check\` returns \`ready\`, call the report's \`Next Axint Action\` before ordinary Xcode work.
7. Use \`axint.suggest\` for feature planning.
8. Use \`axint.feature\`, \`axint.scaffold\`, \`axint.compile\`, or \`axint.schema.compile\` for Apple-native surfaces.
9. Prefer \`axint.xcode.write\` for new Swift files so Axint validation, Cloud Check, and guard proof happen as part of the write.
10. Run \`axint.swift.validate\` on modified Swift.
11. Run \`axint.cloud.check\` with Xcode build, test, runtime, or behavior evidence when available.
11. Prefer \`axint.run\` when moving toward build/test/runtime proof so Axint owns the loop instead of relying on memory.
12. Build in Xcode or via \`xcodebuild\`. Static Axint checks are not a replacement for runtime proof.

## Hard Rule

Do not tell the user a bug is gone because static validation passed. Say what Axint checked, what it did not check, and which Xcode/test/runtime evidence proves the behavior.

## Drift Guard

If you are about to spend a long uninterrupted block on implementation, first name the Axint checkpoint you just ran or the one you will run next. If no Axint checkpoint has run in the last task, stop and run one.

In Xcode, the safest checkpoint is \`axint.xcode.guard\`. It writes \`.axint/guard/latest.json\` and \`.axint/guard/latest.md\`, which lets the user audit whether Axint was actually used during a long task.
`;
}

function buildLocalAxintReadme(input: {
  projectName: string;
  version: string;
  startPrompt: string;
}): string {
  return `# .axint

This folder stores Axint project metadata for ${input.projectName}.

- Expected Axint version: ${input.version}
- Rehydration contract: \`.axint/AXINT_REHYDRATE.md\`
- Compact agent memory: \`.axint/AXINT_MEMORY.md\`
- Project-local docs context: \`.axint/AXINT_DOCS_CONTEXT.md\`
- Project workflow: \`.axint/project.json\`
- Axint Run artifacts: \`.axint/run/latest.json\` and \`.axint/run/latest.md\`
- Xcode Guard artifacts: \`.axint/guard/latest.json\` and \`.axint/guard/latest.md\`
- Active session token: \`.axint/session/current.json\`
- MCP config: \`.mcp.json\`
- Agent instructions: \`AGENTS.md\` and \`CLAUDE.md\`

## New Xcode Agent Chat

\`\`\`text
${input.startPrompt}
\`\`\`

## If The Agent Forgets Axint

Ask it to run the Axint context recovery loop:

\`\`\`text
Call axint.session.start for this project and keep the returned sessionToken. Read .axint/AXINT_REHYDRATE.md, .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, and .axint/project.json. If either Axint context file is missing, call axint.context.memory and axint.context.docs. Then call axint.status, call axint.workflow.check with stage context-recovery, sessionToken=<token>, readRehydrationContext=true, readAgentInstructions=true, readDocsContext=true, ranStatus=true. For build/test/runtime proof, call axint.run so Axint owns the full loop.
Call axint.xcode.guard with stage=context-recovery first, then call axint.session.start if the guard asks for it. Read .axint/AXINT_REHYDRATE.md, .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, and .axint/project.json. Then call axint.status and axint.workflow.check. For build/test/runtime proof, call axint.run so Axint owns the full loop.
\`\`\`

## CLI Session Start

\`\`\`bash
axint session start --dir /path/to/${input.projectName} --name ${input.projectName}
\`\`\`

## Full Build Loop

\`\`\`bash
axint run --dir /path/to/${input.projectName} --scheme ${input.projectName} --runtime
\`\`\`
	`;
}

function detectNpxPath(): string | null {
  const candidates = [
    shellOutput("command -v npx 2>/dev/null"),
    "/opt/homebrew/bin/npx",
    "/usr/local/bin/npx",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function buildDurablePath(command: string): string {
  const commandDir = dirname(command);
  const entries = [
    commandDir === "." ? undefined : commandDir,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(entries)).join(":");
}

function shellOutput(command: string): string | null {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

export function readProjectStartPack(targetDir = process.cwd()): unknown | null {
  const path = resolve(targetDir, ".axint", "project.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
}
