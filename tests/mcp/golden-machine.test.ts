import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileAnySource } from "../../src/core/compiler.js";
import { validateSwiftSource } from "../../src/core/swift-validator.js";
import { runCloudCheck } from "../../src/cloud/check.js";
import { generateFeature } from "../../src/mcp/feature.js";
import { scaffoldIntent } from "../../src/mcp/scaffold.js";
import { runWorkflowCheck } from "../../src/mcp/workflow-check.js";
import { startAxintSession } from "../../src/project/session.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function startWorkflowSession(): {
  cwd: string;
  sessionToken: string;
  sessionStarted: true;
} {
  const dir = mkdtempSync(join(tmpdir(), "axint-golden-"));
  tempDirs.push(dir);
  const session = startAxintSession({
    targetDir: dir,
    projectName: "Swarm",
    expectedVersion: "9.9.9",
    platform: "macOS",
  });
  return {
    cwd: dir,
    sessionToken: session.session.token,
    sessionStarted: true,
  };
}

describe("golden Axint machine scenarios", () => {
  it("scaffolds, compiles, and Cloud-checks a simple App Intent", () => {
    const source = scaffoldIntent({
      name: "CreateMission",
      description: "Create a mission in a macOS project room",
      domain: "productivity",
      params: [
        { name: "title", type: "string", description: "Mission title" },
        { name: "priority", type: "string", description: "Mission priority" },
      ],
    });
    const compiled = compileAnySource(source, "CreateMission.intent.ts");
    expect(compiled.success).toBe(true);
    expect(compiled.output?.swiftCode).toContain("struct CreateMissionIntent");

    const report = runCloudCheck({
      fileName: "CreateMissionIntent.swift",
      source: compiled.output!.swiftCode,
      platform: "macOS",
      xcodeBuildLog: "Build succeeded.",
    });
    expect(report.status).toBe("pass");
    expect(report.gate.decision).toBe("ready_to_ship");
  });

  it("generates a macOS settings view with token-aware controls", () => {
    const result = generateFeature({
      description:
        "Settings view with appearance segmented picker, accent color swatches, transcription engine picker, reduce motion toggle, and keyboard shortcut reference.",
      surfaces: ["view"],
      name: "AppSettings",
      platform: "macOS",
      tokenNamespace: "SwarmDesignTokens",
    });
    const view = result.files.find((file) => file.path.endsWith("AppSettingsView.swift"));
    expect(result.success).toBe(true);
    expect(view?.content).toContain('Picker("Appearance"');
    expect(view?.content).toContain("SwarmDesignTokens.Colors.surfaceRaised");
    expect(validateSwiftSource(view!.content, view!.path).diagnostics).toEqual([]);
  });

  it("generates an inbox/capture view instead of generic title-date-notes output", () => {
    const result = generateFeature({
      description:
        "Universal capture inbox with composer, saved items list, search, all/unread/pinned/archived filter bar, source badges, classification chips, tags, and action buttons to summarize or save to project.",
      surfaces: ["view"],
      name: "SwarmInbox",
      platform: "macOS",
      tokenNamespace: "SwarmDesignTokens",
      domain: "productivity",
    });
    const view = result.files.find((file) => file.path.endsWith("SwarmInboxView.swift"));
    expect(result.success).toBe(true);
    expect(view?.content).toContain("TextEditor(text: $draftText)");
    expect(view?.content).toContain('Picker("Filter"');
    expect(view?.content).not.toContain("Title:");
    expect(view?.content).not.toContain("Notes:");
  });

  it("generates a shared store surface for agent-accessible app state", () => {
    const result = generateFeature({
      description:
        "Shared mission store for a macOS project room with mission items, selected mission state, status updates, and agent handoff review.",
      surfaces: ["store"],
      name: "MissionWorkspace",
      domain: "collaboration",
    });
    const store = result.files.find((file) =>
      file.path.endsWith("MissionWorkspaceStore.swift")
    );
    expect(store?.content).toContain("@Observable");
    expect(store?.content).toContain("func add");
    expect(store?.content).toContain("func updateStatus");
    expect(validateSwiftSource(store!.content, store!.path).diagnostics).toEqual([]);
  });

  it("blocks pre-build claims until validation, Cloud Check, and Xcode proof exist", () => {
    const session = startWorkflowSession();
    const blocked = runWorkflowCheck({
      ...session,
      stage: "pre-build",
      modifiedFiles: ["Sources/Views/InboxView.swift"],
      ranSuggest: true,
      ranFeature: true,
      ranSwiftValidate: false,
      ranCloudCheck: false,
      xcodeBuildPassed: false,
    });
    expect(blocked.status).toBe("needs_action");
    expect(blocked.required.join("\n")).toContain("axint.swift.validate");

    const ready = runWorkflowCheck({
      ...session,
      stage: "pre-build",
      modifiedFiles: ["Sources/Views/InboxView.swift"],
      ranSuggest: true,
      ranFeature: true,
      ranSwiftValidate: true,
      ranCloudCheck: true,
      xcodeBuildPassed: true,
    });
    expect(ready.status).toBe("ready");
  });
});
