import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMachineDoctor } from "../../src/mcp/doctor.js";
import { handleToolCall } from "../../src/mcp/server.js";
import {
  buildProjectStartPack,
  writeProjectStartPack,
} from "../../src/project/start-pack.js";
import { startAxintSession } from "../../src/project/session.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "axint-machine-"));
  tempDirs.push(dir);
  return dir;
}

describe("Axint project machine", () => {
  it("generates a first-try project start pack without side effects", () => {
    const dir = tempDir();
    const pack = buildProjectStartPack({
      targetDir: dir,
      projectName: "Swarm",
      version: "9.9.9",
    });

    expect(pack.files.map((file) => file.path)).toEqual([
      ".mcp.json",
      "AGENTS.md",
      "CLAUDE.md",
      ".axint/AXINT_MEMORY.md",
      ".axint/AXINT_REHYDRATE.md",
      ".axint/AXINT_DOCS_CONTEXT.md",
      ".axint/project.json",
      ".axint/README.md",
    ]);
    expect(pack.startPrompt).toContain("Call axint.status");
    expect(pack.startPrompt).toContain("axint.session.start");
    expect(pack.startPrompt).toContain("axint.workflow.check");
    expect(pack.startPrompt).toContain("Context recovery rule");
    expect(pack.startPrompt).toContain("axint.context.memory");
    expect(pack.files.find((file) => file.path === ".mcp.json")?.content).toContain(
      "axint-mcp"
    );
    expect(
      pack.files.find((file) => file.path === ".axint/AXINT_MEMORY.md")?.content
    ).toContain("Axint Operating Memory");
    expect(
      pack.files.find((file) => file.path === ".axint/AXINT_REHYDRATE.md")?.content
    ).toContain("Axint Rehydration Contract");
    expect(
      pack.files.find((file) => file.path === ".axint/AXINT_DOCS_CONTEXT.md")?.content
    ).toContain("Axint Docs Context");
    expect(
      pack.files.find((file) => file.path === ".axint/project.json")?.content
    ).toContain("contextRecovery");
    expect(
      pack.files.find((file) => file.path === ".axint/project.json")?.content
    ).toContain("workflowCheckRequiresToken");
  });

  it("generates Codex start packs without Xcode-only write requirements", () => {
    const dir = tempDir();
    const pack = buildProjectStartPack({
      targetDir: dir,
      projectName: "Swarm",
      version: "9.9.9",
      agent: "codex",
    });

    expect(pack.startPrompt).toContain("Active agent lane: Codex");
    expect(pack.startPrompt).toContain("apply_patch, then axint.swift.validate");
    expect(pack.startPrompt).toContain("Do not call axint.xcode.guard");

    const projectJson = pack.files.find(
      (file) => file.path === ".axint/project.json"
    )?.content;
    expect(projectJson).toContain('"agent": "codex"');
    expect(projectJson).toContain("host-native patch/edit lane");
    expect(projectJson).not.toContain(
      "axint.xcode.write for guarded file writes when available"
    );
  });

  it("writes the project start pack conservatively", () => {
    const dir = tempDir();
    const result = writeProjectStartPack({
      targetDir: dir,
      projectName: "Swarm",
      version: "9.9.9",
    });

    expect(result.written).toContain(".mcp.json");
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toContain(
      "Expected Axint version: 9.9.9"
    );
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toContain("Context Recovery");
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toContain(
      "axint.session.start"
    );
    expect(readFileSync(join(dir, ".axint/AXINT_REHYDRATE.md"), "utf-8")).toContain(
      "Non-Negotiable Rule"
    );
    expect(readFileSync(join(dir, ".axint/AXINT_MEMORY.md"), "utf-8")).toContain(
      "Do not silently fall back"
    );
    expect(readFileSync(join(dir, ".axint/AXINT_DOCS_CONTEXT.md"), "utf-8")).toContain(
      "agent-callable Cloud Check"
    );

    const second = writeProjectStartPack({
      targetDir: dir,
      projectName: "Swarm",
      version: "9.9.9",
    });
    expect(second.written).toEqual([]);
    expect(second.skipped).toContain("AGENTS.md");
  });

  it("starts a durable Axint session for enforced workflow gates", () => {
    const dir = tempDir();
    const result = startAxintSession({
      targetDir: dir,
      projectName: "Swarm",
      expectedVersion: "9.9.9",
      platform: "macOS",
    });

    const sessionJson = readFileSync(join(dir, ".axint/session/current.json"), "utf-8");
    expect(sessionJson).toContain(result.session.token);
    expect(readFileSync(join(dir, ".axint/AXINT_REHYDRATE.md"), "utf-8")).toContain(
      result.session.token
    );
    expect(result.workflowCheckArgs.sessionToken).toBe(result.session.token);
    expect(result.workflowCheckArgs.readRehydrationContext).toBe(true);
    expect(result.recoveryPrompt).toContain("Do not edit Apple-native code");
  });

  it("reports project setup gaps and stale versions", () => {
    const dir = tempDir();
    const report = runMachineDoctor({
      cwd: dir,
      runningVersion: "0.4.7",
      expectedVersion: "0.4.8",
    });

    expect(report.status).toBe("fail");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        label: "Axint version",
        status: "fail",
      })
    );
    expect(report.nextSteps.join("\n")).toContain("reload or reconnect");
  });

  it("exposes project pack and doctor through MCP", async () => {
    const packResult = await handleToolCall("axint.project.pack", {
      projectName: "Swarm",
      format: "json",
    });
    const pack = JSON.parse(packResult.content[0].text);
    expect(pack.files.map((file: { path: string }) => file.path)).toContain("CLAUDE.md");
    expect(pack.files.map((file: { path: string }) => file.path)).toContain(
      ".axint/AXINT_MEMORY.md"
    );
    expect(pack.files.map((file: { path: string }) => file.path)).toContain(
      ".axint/AXINT_REHYDRATE.md"
    );
    expect(pack.files.map((file: { path: string }) => file.path)).toContain(
      ".axint/AXINT_DOCS_CONTEXT.md"
    );

    const doctorResult = await handleToolCall("axint.doctor", {
      expectedVersion: "0.0.0",
      format: "json",
    });
    const doctor = JSON.parse(doctorResult.content[0].text);
    expect(doctor.checks.map((check: { label: string }) => check.label)).toContain(
      "Axint version"
    );
    expect(doctorResult.isError).toBe(true);

    const memoryResult = await handleToolCall("axint.context.memory", {
      projectName: "Swarm",
      expectedVersion: "9.9.9",
    });
    expect(memoryResult.content[0].text).toContain("Project: Swarm");
    expect(memoryResult.content[0].text).toContain("Expected Axint version: 9.9.9");

    const docsResult = await handleToolCall("axint.context.docs", {
      projectName: "Swarm",
      expectedVersion: "9.9.9",
    });
    expect(docsResult.content[0].text).toContain("Axint Docs Context");
    expect(docsResult.content[0].text).toContain("Project: Swarm");

    const sessionDir = tempDir();
    const sessionResult = await handleToolCall("axint.session.start", {
      targetDir: sessionDir,
      projectName: "Swarm",
      expectedVersion: "9.9.9",
      platform: "macOS",
      format: "json",
    });
    const session = JSON.parse(sessionResult.content[0].text);
    expect(session.session.token).toMatch(/^axsess_/);
    expect(session.workflowCheckArgs.sessionToken).toBe(session.session.token);
    expect(
      readFileSync(join(sessionDir, ".axint/session/current.json"), "utf-8")
    ).toContain(session.session.token);

    const contextResult = await handleToolCall("axint.project.index", {
      targetDir: sessionDir,
      projectName: "Swarm",
      dryRun: true,
      format: "json",
    });
    const context = JSON.parse(contextResult.content[0].text);
    expect(context.schema).toBe("https://axint.ai/schemas/project-context-index.v1.json");
    expect(context.projectName).toBe("Swarm");
  });
});
