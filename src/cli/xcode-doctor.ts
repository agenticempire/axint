/**
 * axint xcode doctor — Project health audit.
 *
 * Walks the user's environment and the current project to confirm the bits
 * that need to line up for an Apple-platform agentic workflow:
 *
 *   • axint binary on PATH (or npx fallback)
 *   • Node version compatible with the compiler
 *   • Xcode + mcpbridge present
 *   • Swift toolchain reachable
 *   • SPM plugin wired into the package (if Package.swift exists)
 *   • MCP config registered in Claude / Codex / Cursor / Zed (if installed)
 *
 * Prints a green/yellow/red checklist and exits non-zero only if there's a
 * real blocker. Soft checks ("you don't have Cursor configured") never fail
 * the run.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ORANGE = "\x1b[38;5;208m";
const GREEN = "\x1b[38;5;82m";
const RED = "\x1b[38;5;196m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

type CheckStatus = "ok" | "warn" | "fail" | "skip";

interface Check {
  label: string;
  status: CheckStatus;
  detail?: string;
  hint?: string;
}

interface DoctorOptions {
  cwd?: string;
}

export async function runXcodeDoctor(options: DoctorOptions = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());

  console.log();
  console.log(
    `  ${ORANGE}◆${RESET} ${BOLD}axint xcode doctor${RESET} ${DIM}· ${cwd}${RESET}`
  );
  console.log();

  const sections: Array<{ title: string; checks: Check[] }> = [
    { title: "Toolchain", checks: toolchainChecks() },
    { title: "Xcode", checks: xcodeChecks() },
    { title: "Project", checks: projectChecks(cwd) },
    { title: "Agents", checks: agentChecks() },
  ];

  for (const section of sections) {
    console.log(`  ${BOLD}${section.title}${RESET}`);
    for (const c of section.checks) {
      printCheck(c);
    }
    console.log();
  }

  const failures = sections.flatMap((s) => s.checks).filter((c) => c.status === "fail");
  const warnings = sections.flatMap((s) => s.checks).filter((c) => c.status === "warn");

  if (failures.length === 0 && warnings.length === 0) {
    console.log(`  ${GREEN}✓${RESET} all checks passed — you're ready to ship`);
    console.log();
    return;
  }

  if (failures.length > 0) {
    console.log(
      `  ${RED}${failures.length} blocker${failures.length === 1 ? "" : "s"}${RESET} ${DIM}· ${warnings.length} warning${warnings.length === 1 ? "" : "s"}${RESET}`
    );
    console.log();
    process.exit(1);
  }

  console.log(
    `  ${YELLOW}${warnings.length} warning${warnings.length === 1 ? "" : "s"}${RESET} ${DIM}· nothing blocking${RESET}`
  );
  console.log();
}

function printCheck(c: Check) {
  const marks: Record<CheckStatus, string> = {
    ok: `${GREEN}✓${RESET}`,
    warn: `${YELLOW}!${RESET}`,
    fail: `${RED}✗${RESET}`,
    skip: `${DIM}·${RESET}`,
  };
  const detail = c.detail ? ` ${DIM}${c.detail}${RESET}` : "";
  console.log(`    ${marks[c.status]} ${c.label}${detail}`);
  if (c.hint) {
    console.log(`        ${DIM}${c.hint}${RESET}`);
  }
}

// ─── Toolchain ──────────────────────────────────────────────────────

function toolchainChecks(): Check[] {
  const checks: Check[] = [];

  const node = which("node");
  if (node) {
    const version = capture("node --version") ?? "";
    const major = Number(version.replace(/^v/, "").split(".")[0]);
    checks.push({
      label: "Node",
      status: major >= 22 ? "ok" : "warn",
      detail: version,
      hint: major >= 22 ? undefined : "axint targets Node 22+",
    });
  } else {
    checks.push({
      label: "Node",
      status: "fail",
      hint: "Install Node 22+ from https://nodejs.org",
    });
  }

  const axint = which("axint");
  if (axint) {
    checks.push({ label: "axint binary", status: "ok", detail: axint });
  } else {
    checks.push({
      label: "axint binary",
      status: "warn",
      detail: "not on PATH",
      hint: "fine for npx-based usage; npm i -g axint to make local",
    });
  }

  const swift = which("swift");
  if (swift) {
    const version = (capture("swift --version") ?? "").split("\n")[0];
    checks.push({ label: "Swift toolchain", status: "ok", detail: version });
  } else {
    checks.push({
      label: "Swift toolchain",
      status: "warn",
      hint: "needed for SPM plugin builds (xcode-select --install)",
    });
  }

  return checks;
}

// ─── Xcode ──────────────────────────────────────────────────────────

function xcodeChecks(): Check[] {
  const checks: Check[] = [];
  const version = capture("xcodebuild -version");
  if (version) {
    const line = version.split("\n")[0];
    const match = line.match(/Xcode\s+([\d.]+)/);
    const semver = match?.[1];
    const status: CheckStatus =
      semver && Number(semver.split(".")[0]) >= 26 ? "ok" : "warn";
    checks.push({
      label: "Xcode",
      status,
      detail: line,
      hint: status === "warn" ? "agentic coding requires Xcode 26.3+" : undefined,
    });
  } else {
    checks.push({
      label: "Xcode",
      status: "fail",
      hint: "install from the Mac App Store",
    });
  }

  const hasMcpBridge = trySilent("xcrun mcpbridge --help");
  checks.push({
    label: "mcpbridge",
    status: hasMcpBridge ? "ok" : "warn",
    hint: hasMcpBridge ? undefined : "ships with Xcode 26.3+ command line tools",
  });

  return checks;
}

// ─── Project ────────────────────────────────────────────────────────

function projectChecks(cwd: string): Check[] {
  const checks: Check[] = [];

  const pkgJson = join(cwd, "package.json");
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, "utf-8"));
      if (pkg.name === "axint" || pkg.name === "@axintai/compiler") {
        checks.push({
          label: "package.json",
          status: "ok",
          detail: "this is the axint repo itself",
        });
      } else {
        const dep = pkg.dependencies?.axint ?? pkg.devDependencies?.axint ?? null;
        checks.push({
          label: "package.json axint dependency",
          status: dep ? "ok" : "warn",
          detail: dep ?? "not found",
          hint: dep ? undefined : "npm install --save-dev axint",
        });
      }
    } catch {
      checks.push({ label: "package.json", status: "warn", detail: "could not parse" });
    }
  } else {
    checks.push({
      label: "package.json",
      status: "skip",
      detail: "no JS project here",
    });
  }

  const swiftPackage = join(cwd, "Package.swift");
  if (existsSync(swiftPackage)) {
    const text = readFileSync(swiftPackage, "utf-8");
    const wired =
      text.includes("AxintCompilePlugin") || text.includes("AxintValidatePlugin");
    checks.push({
      label: "SPM plugin wired",
      status: wired ? "ok" : "warn",
      detail: wired ? "found in Package.swift" : "not wired",
      hint: wired
        ? undefined
        : 'add .plugin(name: "AxintValidatePlugin", package: "axint") to your target',
    });
  } else {
    checks.push({
      label: "Package.swift",
      status: "skip",
      detail: "no SPM package here",
    });
  }

  const intentDirs = ["intents", "src/intents", "Sources/Intents"];
  const found = intentDirs.find((d) => safeIsDir(join(cwd, d)));
  if (found) {
    const count = countFiles(join(cwd, found), [".ts", ".js"]);
    checks.push({
      label: "intent sources",
      status: count > 0 ? "ok" : "warn",
      detail: `${count} files in ${found}/`,
    });
  } else {
    checks.push({ label: "intent sources", status: "skip", detail: "no intents/ dir" });
  }

  return checks;
}

// ─── Agents ─────────────────────────────────────────────────────────

function agentChecks(): Check[] {
  const checks: Check[] = [];
  const home = homedir();

  // Claude Code: ~/.claude.json or ~/.claude/mcp.json
  const claudePaths = [
    join(home, ".claude.json"),
    join(home, ".claude", "mcp.json"),
    join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
  ];
  checks.push(agentCheck("Claude Code", claudePaths, /\baxint\b/));

  // Codex CLI: ~/.codex/config.toml
  checks.push(
    agentCheck("Codex CLI", [join(home, ".codex", "config.toml")], /\baxint\b/)
  );

  // Cursor: ~/.cursor/mcp.json
  checks.push(agentCheck("Cursor", [join(home, ".cursor", "mcp.json")], /\baxint\b/));

  // Zed: ~/.config/zed/settings.json
  checks.push(
    agentCheck("Zed", [join(home, ".config", "zed", "settings.json")], /\baxint\b/)
  );

  return checks;
}

function agentCheck(name: string, paths: string[], needle: RegExp): Check {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, "utf-8");
      if (needle.test(text)) {
        return { label: name, status: "ok", detail: "axint registered" };
      }
      return {
        label: name,
        status: "warn",
        detail: "config found but axint not registered",
        hint: `axint xcode setup --agent ${name.toLowerCase().split(" ")[0]}`,
      };
    } catch {
      // fall through
    }
  }
  return { label: name, status: "skip", detail: "not installed" };
}

// ─── Helpers ────────────────────────────────────────────────────────

function which(bin: string): string | null {
  try {
    return (
      execSync(`command -v ${bin}`, { encoding: "utf-8", timeout: 3000 }).trim() || null
    );
  } catch {
    return null;
  }
}

function capture(cmd: string): string | null {
  try {
    return execSync(`${cmd} 2>/dev/null`, { encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

function trySilent(cmd: string): boolean {
  try {
    execSync(`${cmd} >/dev/null 2>&1`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function countFiles(dir: string, exts: string[]): number {
  let n = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) n += countFiles(full, exts);
      else if (exts.some((e) => entry.name.endsWith(e))) n++;
    }
  } catch {
    /* ignore */
  }
  return n;
}
