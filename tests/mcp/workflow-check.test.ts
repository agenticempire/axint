import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderWorkflowCheckReport,
  runWorkflowCheck,
} from "../../src/mcp/workflow-check.js";
import { startAxintSession } from "../../src/project/session.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function sessionArgs(): { cwd: string; sessionToken: string; sessionStarted: true } {
  const dir = mkdtempSync(join(tmpdir(), "axint-workflow-"));
  tempDirs.push(dir);
  const result = startAxintSession({
    targetDir: dir,
    projectName: "Swarm",
    expectedVersion: "9.9.9",
    platform: "macOS",
  });
  return {
    cwd: dir,
    sessionToken: result.session.token,
    sessionStarted: true,
  };
}

describe("axint.workflow.check", () => {
  it("requires an Axint session token before any workflow gate", () => {
    const report = runWorkflowCheck({
      stage: "planning",
      ranSuggest: false,
    });

    expect(report.status).toBe("needs_action");
    expect(report.required.join("\n")).toMatch(/axint\.session\.start/);
    expect(report.nextTool).toBe("axint.session.start");
  });

  it("forces context recovery after a compacted or restarted agent chat", () => {
    const report = runWorkflowCheck({
      ...sessionArgs(),
      stage: "context-recovery",
      readRehydrationContext: false,
      readAgentInstructions: false,
      ranStatus: false,
    });

    expect(report.status).toBe("needs_action");
    expect(report.required.join("\n")).toMatch(/AXINT_REHYDRATE/);
    expect(report.required.join("\n")).toMatch(/AXINT_MEMORY/);
    expect(report.required.join("\n")).toMatch(/AXINT_DOCS_CONTEXT/);
    expect(report.required.join("\n")).toMatch(/axint\.context\.docs/);
    expect(report.required.join("\n")).toMatch(/AGENTS\.md/);
    expect(report.required.join("\n")).toMatch(/axint\.status/);
    expect(report.nextTool).toBe("axint.session.start");
  });

  it("nudges agents to use suggest before planning", () => {
    const report = runWorkflowCheck({
      ...sessionArgs(),
      stage: "planning",
      surfaces: ["view"],
      ranSuggest: false,
    });

    expect(report.status).toBe("needs_action");
    expect(report.nextTool).toBe("axint.suggest");
    expect(report.required.join("\n")).toMatch(/axint\.suggest/);
  });

  it("requires validation and Cloud Check before a SwiftUI build gate", () => {
    const report = runWorkflowCheck({
      ...sessionArgs(),
      stage: "pre-build",
      modifiedFiles: ["HomeFeedView.swift"],
      ranSuggest: true,
      ranFeature: true,
      ranSwiftValidate: false,
      ranCloudCheck: false,
    });

    expect(report.status).toBe("needs_action");
    expect(report.required.join("\n")).toMatch(/axint\.swift\.validate/);
    expect(report.required.join("\n")).toMatch(/axint\.cloud\.check/);
    expect(report.nextTool).toBe("axint.swift.validate");
  });

  it("detects drift language and forces rehydration before continuing", () => {
    const report = runWorkflowCheck({
      ...sessionArgs(),
      stage: "before-write",
      surfaces: ["view"],
      ranSuggest: true,
      ranFeature: true,
      notes: "This is a new chat after compaction and I may have lost context.",
    });

    expect(report.status).toBe("needs_action");
    expect(report.required.join("\n")).toMatch(/context recovery/i);
    expect(report.required.join("\n")).toMatch(/AXINT_REHYDRATE/);
    expect(report.nextTool).toBe("axint.session.start");
  });

  it("allows explicit feature bypasses while keeping validation gates", () => {
    const report = runWorkflowCheck({
      ...sessionArgs(),
      stage: "before-write",
      surfaces: ["view"],
      ranSuggest: true,
      ranFeature: false,
      featureBypassReason: "Editing an existing hand-written view; no new surface.",
    });

    expect(report.status).toBe("ready");
    expect(report.required).toEqual([]);
    expect(report.checked.join("\n")).toMatch(/intentionally bypassed/);
  });

  it("passes when static checks and build evidence are present", () => {
    const report = runWorkflowCheck({
      ...sessionArgs(),
      stage: "pre-build",
      modifiedFiles: ["CreateMissionIntent.swift"],
      ranSuggest: true,
      ranFeature: true,
      ranSwiftValidate: true,
      ranCloudCheck: true,
      xcodeBuildPassed: true,
    });

    expect(report.status).toBe("ready");
    expect(report.required).toEqual([]);
    expect(renderWorkflowCheckReport(report)).toContain(
      "Axint workflow gate is satisfied"
    );
  });
});
