/**
 * axint xcode setup — Configure Axint for Xcode's agentic coding workflow.
 *
 * Detects Xcode 26.3+, configures Claude Code and/or Codex to use
 * Axint as an additional MCP server, and verifies the connection.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORANGE = "\x1b[38;5;208m";
const GREEN = "\x1b[38;5;82m";
const RED = "\x1b[38;5;196m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const REMOTE_URL = "https://mcp.axint.ai/mcp";
const AXINT_NPM_PACKAGE = "@axint/compiler";
const AXINT_MCP_BIN = "axint-mcp";
const START_PROMPT = [
  "Before editing Apple-native code, read the current Axint docs:",
  "1. https://docs.axint.ai/guides/live-now/",
  "2. https://docs.axint.ai/mcp/xcode/",
  "3. https://docs.axint.ai/guides/xcode-happy-path/",
  "4. https://docs.axint.ai/guides/cloud-check-loop/",
  "5. https://docs.axint.ai/guides/fix-packets/",
  "6. https://docs.axint.ai/reference/cli/",
  "",
  "Then list MCP servers and confirm both xcode-tools and axint are available.",
  "Use Axint before guessing App Intents, widgets, SwiftUI scaffolds, entitlements, Info.plist keys, or repair prompts.",
  "Work in short checkpoints. Do not spend 20+ minutes on a task without running Axint and Xcode validation.",
  "After each generated Apple surface, run axint.cloud.check or axint cloud check <file> --feedback, then build in Xcode.",
  "Do not claim there is no bug from Axint alone. Cloud Check is static; Xcode build, unit tests, UI tests, accessibility flows, and runtime behavior are separate evidence.",
  "If Axint passes but Xcode/tests/runtime fails, report the exact failure as an Axint validator or runtime-coverage gap before continuing.",
].join("\n");
const XCODE_CLAUDE_CONFIG = join(
  "Library",
  "Developer",
  "Xcode",
  "CodingAssistant",
  "ClaudeAgentConfig",
  ".claude.json"
);

interface McpServerConfig {
  type?: "stdio";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

interface ClaudeAgentConfig {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

interface SetupOptions {
  agent: string;
  remote: boolean;
}

export async function setupXcode(options: SetupOptions): Promise<void> {
  console.log();
  console.log(`  ${ORANGE}◆${RESET} ${BOLD}Axint${RESET} · Xcode Setup`);
  console.log();

  // 1. Check Xcode
  const xcodeVersion = detectXcode();
  if (!xcodeVersion) {
    console.log(
      `  ${RED}✗${RESET} Xcode not found. Install Xcode 26.3+ from the App Store.`
    );
    console.log();
    return;
  }
  console.log(`  ${GREEN}✓${RESET} Xcode detected: ${xcodeVersion}`);

  // 2. Check mcpbridge
  const hasMcpBridge = detectMcpBridge();
  if (hasMcpBridge) {
    console.log(`  ${GREEN}✓${RESET} mcpbridge available`);
  } else {
    console.log(
      `  ${DIM}ℹ${RESET} mcpbridge not found — Xcode 26.3+ command line tools may need updating`
    );
  }

  // 3. Check if axint/npx is available
  const axintPath = detectAxint();
  if (axintPath) {
    console.log(`  ${GREEN}✓${RESET} axint compiler: ${axintPath}`);
  } else {
    console.log(
      `  ${DIM}ℹ${RESET} axint not in PATH — will use npx for on-demand install`
    );
  }

  console.log();

  // 4. Configure agents
  const agents = options.agent === "all" ? ["claude", "codex"] : [options.agent];

  for (const agent of agents) {
    if (agent === "claude") {
      await setupClaude(options.remote);
    } else if (agent === "codex") {
      await setupCodex(options.remote);
    }
  }

  if (!options.remote && agents.includes("claude")) {
    setupXcodeClaudeAgent();
  }

  // 5. Print verification instructions
  console.log();
  console.log(`  ${ORANGE}◆${RESET} ${BOLD}Setup complete${RESET}`);
  console.log();
  console.log(`  Try it out — open a project in Xcode and ask the agent:`);
  console.log();
  console.log(
    `    ${DIM}"Use axint.suggest to recommend Apple-native features for this app"${RESET}`
  );
  console.log(
    `    ${DIM}"Use axint.feature to add a Siri action for logging water intake"${RESET}`
  );
  console.log();
  console.log(`  Run ${BOLD}axint xcode verify${RESET} to test the connection.`);
  console.log();
  printAgentStartPrompt();
  console.log();
}

export async function verifyXcode(): Promise<void> {
  console.log();
  console.log(`  ${ORANGE}◆${RESET} ${BOLD}Axint${RESET} · Verify Xcode MCP Connection`);
  console.log();

  // test that the MCP server starts and can list tools
  try {
    const request = JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      id: 1,
      params: {},
    });
    const command = buildLocalMcpServerCommand();
    const result = spawnSync(command.command, command.args, {
      input: `${request}\n`,
      encoding: "utf-8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    if (!output && result.error && result.error.name !== "ETIMEDOUT") {
      throw result.error;
    }

    if (output.includes("axint.feature")) {
      console.log(`  ${GREEN}✓${RESET} MCP server responds`);
      console.log(`  ${GREEN}✓${RESET} axint.feature tool available`);

      const toolCount = (output.match(/"name":\s*"axint\./g) || []).length;
      console.log(`  ${GREEN}✓${RESET} ${toolCount} tools registered`);
      console.log();
      console.log(`  ${GREEN}All checks passed.${RESET} Axint is ready for Xcode.`);
    } else {
      console.log(`  ${RED}✗${RESET} Server responded but axint.feature not found`);
      console.log(`  ${DIM}  Try updating: npm install -g @axint/compiler${RESET}`);
    }
  } catch {
    console.log(`  ${RED}✗${RESET} Could not start MCP server`);
    console.log(`  ${DIM}  Make sure Node.js 22+ and npx are installed${RESET}`);
  }

  console.log();
}

function printAgentStartPrompt(): void {
  console.log(
    `  ${ORANGE}◆${RESET} ${BOLD}Start a new Xcode agent chat with this${RESET}`
  );
  console.log();
  for (const line of START_PROMPT.split("\n")) {
    console.log(line.length > 0 ? `    ${DIM}${line}${RESET}` : "");
  }
  console.log();
  console.log(
    `  ${DIM}MCP prompt equivalent: ask for ${BOLD}axint.project-start${RESET}${DIM}.${RESET}`
  );
}

// ─── Agent configurators ────────────────────────────────────────────

async function setupClaude(remote: boolean): Promise<void> {
  console.log(`  ${BOLD}Configuring Claude Code...${RESET}`);

  if (remote) {
    // remote mode: use the hosted endpoint
    const cmd = `claude mcp add axint --transport http ${REMOTE_URL}`;
    console.log(`  ${DIM}$ ${cmd}${RESET}`);
    try {
      execSync(cmd, { stdio: "inherit", timeout: 10000 });
      console.log(`  ${GREEN}✓${RESET} Claude Code configured (remote: ${REMOTE_URL})`);
    } catch {
      console.log(`  ${DIM}ℹ${RESET} Auto-config failed. Add manually:`);
      printManualClaude(remote);
    }
  } else {
    // local stdio mode
    const cmd = `claude mcp add --transport stdio axint -- npx -y -p ${AXINT_NPM_PACKAGE} ${AXINT_MCP_BIN}`;
    console.log(`  ${DIM}$ ${cmd}${RESET}`);
    try {
      execSync(cmd, { stdio: "inherit", timeout: 10000 });
      console.log(`  ${GREEN}✓${RESET} Claude Code configured (local stdio)`);
    } catch {
      console.log(`  ${DIM}ℹ${RESET} Auto-config failed. Add manually:`);
      printManualClaude(remote);
    }
  }
}

async function setupCodex(remote: boolean): Promise<void> {
  console.log(`  ${BOLD}Configuring Codex CLI...${RESET}`);

  if (remote) {
    const cmd = `codex mcp add axint --transport http ${REMOTE_URL}`;
    console.log(`  ${DIM}$ ${cmd}${RESET}`);
    try {
      execSync(cmd, { stdio: "inherit", timeout: 10000 });
      console.log(`  ${GREEN}✓${RESET} Codex configured (remote: ${REMOTE_URL})`);
    } catch {
      console.log(`  ${DIM}ℹ${RESET} Auto-config failed. Add manually:`);
      printManualCodex(remote);
    }
  } else {
    const cmd = `codex mcp add axint -- npx -y -p ${AXINT_NPM_PACKAGE} ${AXINT_MCP_BIN}`;
    console.log(`  ${DIM}$ ${cmd}${RESET}`);
    try {
      execSync(cmd, { stdio: "inherit", timeout: 10000 });
      console.log(`  ${GREEN}✓${RESET} Codex configured (local stdio)`);
    } catch {
      console.log(`  ${DIM}ℹ${RESET} Auto-config failed. Add manually:`);
      printManualCodex(remote);
    }
  }
}

// ─── Detection helpers ──────────────────────────────────────────────

function detectXcode(): string | null {
  try {
    const output = execSync("xcodebuild -version 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const match = output.match(/Xcode\s+([\d.]+)/);
    return match ? match[1] : output.trim().split("\n")[0];
  } catch {
    return null;
  }
}

function detectMcpBridge(): boolean {
  try {
    execSync("xcrun mcpbridge --help 2>/dev/null", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function detectAxint(): string | null {
  try {
    const output = execSync("which axint 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    });
    return output.trim();
  } catch {
    return null;
  }
}

function setupXcodeClaudeAgent(): void {
  console.log(`  ${BOLD}Configuring Xcode Claude Agent...${RESET}`);

  const configPath = join(homedir(), XCODE_CLAUDE_CONFIG);
  const command = buildLocalMcpServerCommand({
    preferAbsoluteNpx: true,
    requireAbsoluteNode: true,
  });

  if (!command.isDurableForXcode) {
    console.log(
      `  ${DIM}ℹ${RESET} Could not find a durable Axint MCP script. Install globally, then rerun:`
    );
    console.log(`  ${DIM}  npm install -g ${AXINT_NPM_PACKAGE}${RESET}`);
    console.log(`  ${DIM}  axint xcode setup --agent claude${RESET}`);
    return;
  }

  const existing = readClaudeAgentConfig(configPath);
  if (!existing) return;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        ...existing,
        mcpServers: {
          ...(existing.mcpServers ?? {}),
          axint: {
            type: "stdio",
            command: command.command,
            args: command.args,
            env: buildMcpEnv(command.command),
          },
        },
      },
      null,
      2
    )}\n`,
    "utf-8"
  );

  console.log(`  ${GREEN}✓${RESET} Xcode Claude Agent configured`);
  console.log(`  ${DIM}  ${configPath}${RESET}`);
  console.log(
    `  ${DIM}  Uses an absolute npx path because Xcode runs agents with a restricted PATH${RESET}`
  );
}

function readClaudeAgentConfig(configPath: string): ClaudeAgentConfig | null {
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
    if (!isObject(parsed)) return {};
    const mcpServers = parsed.mcpServers;
    return {
      ...parsed,
      mcpServers: isObject(mcpServers)
        ? (mcpServers as Record<string, McpServerConfig>)
        : undefined,
    };
  } catch {
    console.log(
      `  ${RED}✗${RESET} Could not parse Xcode Claude Agent config, so Axint did not overwrite it`
    );
    console.log(`  ${DIM}  ${configPath}${RESET}`);
    return null;
  }
}

function buildLocalMcpServerCommand(options?: {
  preferAbsoluteNpx?: boolean;
  requireAbsoluteNode?: boolean;
}): {
  command: string;
  args: string[];
  isDurableForXcode: boolean;
} {
  const npxPath = detectNpxPath();

  if (options?.preferAbsoluteNpx && npxPath) {
    return {
      command: npxPath,
      args: ["-y", "-p", AXINT_NPM_PACKAGE, AXINT_MCP_BIN],
      isDurableForXcode: true,
    };
  }

  const nodePath = detectNodePath();
  const mcpScript = detectAxintMcpScript();

  if (nodePath && mcpScript) {
    return {
      command: nodePath,
      args: [mcpScript],
      isDurableForXcode: true,
    };
  }

  if (options?.requireAbsoluteNode) {
    return {
      command: "npx",
      args: ["-y", "-p", AXINT_NPM_PACKAGE, AXINT_MCP_BIN],
      isDurableForXcode: false,
    };
  }

  return {
    command: npxPath ?? "npx",
    args: ["-y", "-p", AXINT_NPM_PACKAGE, AXINT_MCP_BIN],
    isDurableForXcode: Boolean(npxPath),
  };
}

function detectNpxPath(): string | null {
  const candidates = [
    shellOutput("command -v npx 2>/dev/null"),
    "/opt/homebrew/bin/npx",
    "/usr/local/bin/npx",
  ].filter((value): value is string => Boolean(value));

  return firstExisting(candidates);
}

function buildMcpEnv(commandPath: string): Record<string, string> | undefined {
  const commandDir = dirname(commandPath);
  const pathEntries = [
    commandDir,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const path = Array.from(new Set(pathEntries)).join(":");
  return { PATH: path };
}

function detectNodePath(): string | null {
  const candidates = [
    shellOutput("command -v node 2>/dev/null"),
    process.execPath,
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
  ].filter((value): value is string => Boolean(value));

  return firstExisting(candidates);
}

function detectAxintMcpScript(): string | null {
  const npmRoot = shellOutput("npm root -g 2>/dev/null");
  const currentFile = fileURLToPath(import.meta.url);
  const distRoot = dirname(dirname(currentFile));

  const candidates = [
    join(distRoot, "mcp", "register.js"),
    join(distRoot, "mcp", "index.js"),
    npmRoot && join(npmRoot, AXINT_NPM_PACKAGE, "dist", "mcp", "register.js"),
    npmRoot && join(npmRoot, AXINT_NPM_PACKAGE, "dist", "mcp", "index.js"),
    "/opt/homebrew/lib/node_modules/@axint/compiler/dist/mcp/register.js",
    "/opt/homebrew/lib/node_modules/@axint/compiler/dist/mcp/index.js",
    "/usr/local/lib/node_modules/@axint/compiler/dist/mcp/register.js",
    "/usr/local/lib/node_modules/@axint/compiler/dist/mcp/index.js",
  ].filter((value): value is string => Boolean(value));

  return firstExisting(candidates);
}

function firstExisting(paths: string[]): string | null {
  const seen = new Set<string>();
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    if (existsSync(path)) return path;
  }
  return null;
}

function shellOutput(command: string): string | null {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Manual instructions ────────────────────────────────────────────

function printManualClaude(remote: boolean): void {
  console.log();
  if (remote) {
    console.log(`  Add to your Claude Code MCP config:`);
    console.log(`  ${DIM}{${RESET}`);
    console.log(`  ${DIM}  "mcpServers": {${RESET}`);
    console.log(`  ${DIM}    "axint": { "url": "${REMOTE_URL}" }${RESET}`);
    console.log(`  ${DIM}  }${RESET}`);
    console.log(`  ${DIM}}${RESET}`);
  } else {
    console.log(`  Run this command:`);
    console.log(
      `  ${DIM}claude mcp add --transport stdio axint -- npx -y -p ${AXINT_NPM_PACKAGE} ${AXINT_MCP_BIN}${RESET}`
    );
    console.log();
    console.log(
      `  ${DIM}For Xcode's built-in Claude Agent, run: axint xcode setup --agent claude${RESET}`
    );
  }
  console.log();
}

function printManualCodex(remote: boolean): void {
  console.log();
  if (remote) {
    console.log(`  Add to your Codex MCP config:`);
    console.log(`  ${DIM}{${RESET}`);
    console.log(`  ${DIM}  "mcpServers": {${RESET}`);
    console.log(`  ${DIM}    "axint": { "url": "${REMOTE_URL}" }${RESET}`);
    console.log(`  ${DIM}  }${RESET}`);
    console.log(`  ${DIM}}${RESET}`);
  } else {
    console.log(`  Run this command:`);
    console.log(
      `  ${DIM}codex mcp add axint -- npx -y -p ${AXINT_NPM_PACKAGE} ${AXINT_MCP_BIN}${RESET}`
    );
  }
  console.log();
}
