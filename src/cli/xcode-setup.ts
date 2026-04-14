/**
 * axint xcode setup — Configure Axint for Xcode's agentic coding workflow.
 *
 * Detects Xcode 26.3+, configures Claude Code and/or Codex to use
 * Axint as an additional MCP server, and verifies the connection.
 */

import { execSync } from "node:child_process";

const ORANGE = "\x1b[38;5;208m";
const GREEN = "\x1b[38;5;82m";
const RED = "\x1b[38;5;196m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const REMOTE_URL = "https://mcp.axint.ai/mcp";

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
}

export async function verifyXcode(): Promise<void> {
  console.log();
  console.log(`  ${ORANGE}◆${RESET} ${BOLD}Axint${RESET} · Verify Xcode MCP Connection`);
  console.log();

  // test that the MCP server starts and can list tools
  try {
    const output = execSync(
      'echo \'{"jsonrpc":"2.0","method":"tools/list","id":1}\' | timeout 5 npx -y @axint/compiler axint-mcp 2>/dev/null',
      { encoding: "utf-8", timeout: 15000 }
    );

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
    const cmd = `claude mcp add --transport stdio axint -- npx -y @axint/compiler axint-mcp`;
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
    const cmd = `codex mcp add axint -- npx -y @axint/compiler axint-mcp`;
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
      `  ${DIM}claude mcp add --transport stdio axint -- npx -y @axint/compiler axint-mcp${RESET}`
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
      `  ${DIM}codex mcp add axint -- npx -y @axint/compiler axint-mcp${RESET}`
    );
  }
  console.log();
}
