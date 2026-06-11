import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve(__dirname, "../../dist/cli/index.js");

const ALL_COMMANDS = [
  "init",
  "compile",
  "activate",
  "validate",
  "validate-swift",
  "eject",
  "format",
  "templates",
  "create",
  "login",
  "cloud",
  "tokens",
  "schema",
  "suggest",
  "feature",
  "repair",
  "agent",
  "memory",
  "feedback",
  "telemetry",
  "publish",
  "add",
  "search",
  "watch",
  "status",
  "upgrade",
  "doctor",
  "project",
  "session",
  "workflow",
  "run",
  "runner",
  "paint-test",
  "mcp",
  "xcode",
];

describe("axint --help", () => {
  const result = spawnSync("node", [CLI, "--help"], { encoding: "utf-8" });
  const stdout = result.stdout;

  it("leads with a Core section of hero commands", () => {
    const core = stdout.indexOf("Core:");
    expect(core).toBeGreaterThan(-1);
    for (const heading of ["Authoring:", "Registry & cloud:", "Project & agents:"]) {
      expect(stdout.indexOf(heading)).toBeGreaterThan(core);
    }

    const coreSection = stdout.slice(core, stdout.indexOf("Authoring:"));
    for (const name of [
      "init",
      "compile",
      "validate",
      "validate-swift",
      "templates",
      "suggest",
      "mcp",
    ]) {
      expect(coreSection).toContain(`\n  ${name} `);
    }
  });

  it("keeps every command listed", () => {
    for (const name of ALL_COMMANDS) {
      expect(stdout).toMatch(new RegExp(`^  ${name.replace("-", "\\-")} `, "m"));
    }
  });

  it("keeps help itself working as a command", () => {
    const helpRun = spawnSync("node", [CLI, "help", "compile"], { encoding: "utf-8" });
    expect(helpRun.status).toBe(0);
    expect(helpRun.stdout).toContain("Usage: axint compile");
  });
});
