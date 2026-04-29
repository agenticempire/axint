import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerFeature } from "../../src/cli/feature.js";
import { registerSchema } from "../../src/cli/schema.js";
import { registerSuggest } from "../../src/cli/suggest.js";

async function run(program: Command, args: string[]) {
  program.name("axint");
  await program.parseAsync(["node", "axint", ...args], { from: "node" });
}

describe("agent-facing generation CLI commands", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "axint-generation-cli-"));
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("compiles a Swarm component schema from the CLI", async () => {
    const schemaPath = join(tempRoot, "project-context-panel.json");
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: "component",
        name: "ProjectContextPanel",
        componentKind: "contextPanel",
        tokenNamespace: "SwarmTokens",
        format: false,
      }),
      "utf-8"
    );

    const program = new Command();
    registerSchema(program);
    await run(program, ["schema", "compile", schemaPath]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("struct ProjectContextPanel: View");
    expect(output).toContain("NORTH_STAR.md");
    expect(output).toContain("SwarmTokens");
  });

  it("writes a Swarm shell feature package from the CLI", async () => {
    const outDir = join(tempRoot, "generated");
    const program = new Command();
    registerFeature(program);
    await run(program, [
      "feature",
      "A three-pane Swarm shell with a 56px sidebar rail, 244px channels column, flexible content area, and right project context pane",
      "--surface",
      "view",
      "--name",
      "SwarmShellView",
      "--platform",
      "macOS",
      "--token-namespace",
      "SwarmTokens",
      "--write",
      outDir,
    ]);

    const generatedPath = join(outDir, "Sources/Views/SwarmShellView.swift");
    expect(existsSync(generatedPath)).toBe(true);
    const swift = readFileSync(generatedPath, "utf-8");
    expect(swift).toContain("SwarmTokens.Layout.sidebarRail");
    expect(swift).toContain("SwarmTokens.Layout.rightContextPane");
    expect(swift).toContain("NORTH_STAR.md");
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Written:");
    expect(output).not.toContain("Domain: messaging");
  });

  it("suggests Swarm features from the CLI when MCP suggest is unavailable", async () => {
    const program = new Command();
    registerSuggest(program);
    await run(program, [
      "suggest",
      "SWARM is a macOS AI-agent mission-control app for project rooms, handoffs, operator review, and focused execution. It is not dating.",
      "--platform",
      "macOS",
      "--exclude",
      "dating,match,swolemate",
      "--json",
    ]);

    const output = logSpy.mock.calls.flat().join("\n");
    const payload = JSON.parse(output) as {
      suggestions: Array<{ domain: string; featurePrompt: string; rationale?: string }>;
    };
    expect(payload.suggestions.length).toBeGreaterThan(0);
    expect(payload.suggestions[0].domain).toBe("collaboration");
    expect(payload.suggestions[0].featurePrompt).toMatch(
      /swarm|mission|agent|handoff|operator|workspace/i
    );
    const generatedPlan = payload.suggestions
      .map((suggestion) => suggestion.featurePrompt)
      .join("\n");
    expect(generatedPlan).not.toMatch(/dating|swolemate|swipe/i);
  });
});
