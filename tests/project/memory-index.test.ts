import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderProjectMemoryIndex,
  writeProjectMemoryIndex,
} from "../../src/project/memory-index.js";

describe("project memory index", () => {
  it("summarizes context, latest proof, repair, and source-free learning packets", () => {
    const dir = mkdtempSync(join(tmpdir(), "axint-memory-"));
    try {
      mkdirSync(join(dir, "Sources"), { recursive: true });
      mkdirSync(join(dir, ".axint/run"), { recursive: true });
      mkdirSync(join(dir, ".axint/repair"), { recursive: true });
      mkdirSync(join(dir, ".axint/feedback"), { recursive: true });
      writeFileSync(
        join(dir, "Sources/HomeView.swift"),
        [
          "import SwiftUI",
          "struct HomeView: View {",
          '  @State private var draft = ""',
          "  var body: some View {",
          '    TextField("Post", text: $draft).overlay { Text("placeholder") }',
          "  }",
          "}",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(dir, ".axint/run/latest.json"),
        JSON.stringify({
          id: "axrun_demo",
          status: "fail",
          gate: { decision: "fix_required" },
          xcodeTestFailures: [
            {
              testName: "testComposerIsHittable",
              message: "composer-input should be hittable",
              file: "SwarmUITests.swift",
              line: 42,
              repairHint: "Check overlays.",
            },
          ],
          nextSteps: ["Patch overlay hit testing"],
        })
      );
      writeFileSync(
        join(dir, ".axint/repair/latest.json"),
        JSON.stringify({
          status: "fix_required",
          issueClass: "swiftui-input-interaction",
          filesToInspect: ["Sources/HomeView.swift"],
          proofCommands: ["xcodebuild test"],
        })
      );
      writeFileSync(
        join(dir, ".axint/feedback/learn-demo.json"),
        JSON.stringify({
          fingerprint: "learn-demo",
          priority: "p1",
          suggestedOwner: "cloud",
          title: "UI interaction evidence",
          diagnosticCodes: ["AXCLOUD-UI-HIT-TEST-BLOCKER"],
          redaction: "source_not_included",
        })
      );

      const result = writeProjectMemoryIndex({ cwd: dir, projectName: "MemoryDemo" });
      const markdown = renderProjectMemoryIndex(result.index);

      expect(result.written).toContain(".axint/memory/latest.json");
      expect(result.index.latestRun?.failedTests[0]?.testName).toBe(
        "testComposerIsHittable"
      );
      expect(result.index.latestRepair?.issueClass).toBe("swiftui-input-interaction");
      expect(result.index.learningPackets[0]?.redaction).toBe("source_not_included");
      expect(markdown).toContain("Privacy-Safe Learning Packets");
      expect(markdown).toContain("AXCLOUD-UI-HIT-TEST-BLOCKER");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
