import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readLatestRepairFeedback,
  renderAxintRepairReport,
  runAxintRepair,
} from "../../src/repair/project-repair.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function tempProject(): string {
  const dir = mkdirTemp("axint-repair-");
  tempDirs.push(dir);
  return dir;
}

function mkdirTemp(prefix: string): string {
  const path = join(tmpdir(), `${prefix}${Math.random().toString(36).slice(2)}`);
  mkdirSync(path, { recursive: true });
  return path;
}

describe("project repair", () => {
  it("plans an input-interaction repair with privacy-safe feedback", () => {
    const dir = tempProject();
    mkdirSync(join(dir, "Swarm.xcodeproj", "xcshareddata", "xcschemes"), {
      recursive: true,
    });
    writeFileSync(
      join(dir, "Swarm.xcodeproj", "xcshareddata", "xcschemes", "Swarm.xcscheme"),
      "<Scheme></Scheme>\n"
    );
    writeFileSync(
      join(dir, "HomeComposer.swift"),
      [
        "import SwiftUI",
        "",
        "struct HomeComposer: View {",
        '    @State private var draft = ""',
        "    var body: some View {",
        "        TextEditor(text: $draft)",
        '            .accessibilityIdentifier("home-composer")',
        "            .overlay {",
        '                Text("Write a comment")',
        "            }",
        "    }",
        "}",
        "",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "FeedScreen.swift"),
      [
        "import SwiftUI",
        "",
        "struct FeedScreen: View {",
        "    @State private var isLoading = false",
        "    var body: some View {",
        "        ZStack {",
        "            HomeComposer()",
        "                .disabled(isLoading)",
        "            Color.clear",
        "                .allowsHitTesting(isLoading)",
        "                .zIndex(3)",
        "        }",
        "    }",
        "}",
        "",
      ].join("\n")
    );

    const report = runAxintRepair({
      cwd: dir,
      projectName: "Swarm",
      issue:
        "The Swarm comment box is visible but I cannot tap it; token sk_live_1234567890123456 appeared in /Users/alice/Swarm/trace.log.",
      sourcePath: "HomeComposer.swift",
      platform: "iOS",
      agent: "codex",
      expectedBehavior: "The composer should accept focus and typing.",
      runtimeFailure:
        "The home feed renders, but the comment box is visible and cannot be tapped or typed into.",
      changedFiles: ["FeedScreen.swift"],
    });

    expect(report.issueClass).toBe("swiftui-input-interaction");
    expect(report.status).toBe("fix_required");
    expect(report.repairIntelligence.summary).toContain("existing iOS Apple repair");
    expect(report.repairIntelligence.inspectionChecklist.join("\n")).toContain(
      "Parent wrappers"
    );
    expect(report.hypotheses.map((item) => item.title).join("\n")).toContain(
      "Overlay or z-index layer"
    );
    expect(report.filesToInspect.map((file) => file.path)).toContain("FeedScreen.swift");
    expect(report.agent.agent).toBe("codex");
    expect(report.repairPrompt).toContain("Senior Apple repair read");
    expect(report.repairPrompt.match(/Likely root causes:/g)).toHaveLength(1);
    expect(report.repairPrompt).toContain("Do not claim the bug is fixed");
    expect(report.feedbackPacket.privacy.redaction).toBe("source_not_included");
    expect(report.feedbackPacket.privacy.evidence).toBe("redacted_and_truncated");
    expect(JSON.stringify(report.feedbackPacket)).not.toContain("TextEditor(text");
    expect(JSON.stringify(report.feedbackPacket.redactedEvidence)).not.toContain(
      "sk_live"
    );
    expect(JSON.stringify(report.feedbackPacket.redactedEvidence)).not.toContain(
      "/Users/alice"
    );
    expect(report.feedbackPacket.redactedEvidence.join(" ")).toContain("[project]");
    expect(existsSync(join(dir, ".axint/repair/latest.json"))).toBe(true);
    expect(existsSync(join(dir, ".axint/feedback/latest.json"))).toBe(true);
    expect(readLatestRepairFeedback({ cwd: dir })?.classification.issueClass).toBe(
      "swiftui-input-interaction"
    );
    expect(renderAxintRepairReport(report)).toContain("Privacy-Safe Feedback Packet");
    expect(renderAxintRepairReport(report)).toContain("Senior Repair Read");
    expect(readFileSync(join(dir, ".axint/context/latest.md"), "utf-8")).toContain(
      "home-composer"
    );
  });

  it("classifies macOS hit-testing evidence without requiring source", () => {
    const dir = tempProject();
    writeFileSync(
      join(dir, "ProjectRoomView.swift"),
      [
        "import SwiftUI",
        "",
        "struct ProjectRoomView: View {",
        "    var body: some View {",
        "        ScrollView {",
        '            Button("Manage Axint Core") {}',
        '                .accessibilityIdentifier("discover-project-manage-axint-core")',
        "        }",
        "    }",
        "}",
        "",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "SwarmUITests.swift"),
      [
        "import XCTest",
        "final class SwarmUITests: XCTestCase {",
        "    func testProjectCommandCenterPrimaryActionsRouteToCoreTabs() {",
        "        let app = XCUIApplication()",
        '        XCTAssertTrue(app.buttons["discover-project-manage-axint-core"].exists)',
        "    }",
        "}",
        "",
      ].join("\n")
    );

    const report = runAxintRepair({
      cwd: dir,
      issue:
        "discover-project-manage-axint-core should be hittable after scrolling but is not foreground and does not allow background interaction",
      platform: "macOS",
      testFailure:
        "XCTAssertTrue failed: discover-project-manage-axint-core should be hittable after scrolling. Button is not foreground and does not allow background interaction.",
      writeReport: false,
      writeFeedback: false,
    });

    expect(report.issueClass).toBe("swiftui-hit-testing");
    expect(report.hypotheses[0]?.title).toContain("UI test is hitting");
    expect(report.filesToInspect.map((file) => file.path)).toContain(
      "SwarmUITests.swift"
    );
    expect(report.evidenceToCollect.join("\n")).toContain("source");
    expect(report.feedbackPacket.privacy.localPaths).toBe("project_relative_only");
  });

  it("routes provider prompt identity drift away from runtime-freeze repair", () => {
    const dir = tempProject();
    writeFileSync(
      join(dir, "CadabraProvider.swift"),
      [
        "import Foundation",
        "",
        "struct CadabraProvider {",
        "    func prompt(style: String) -> String {",
        '        "Make a polished portrait with \\(style)."',
        "    }",
        "}",
        "",
      ].join("\n")
    );

    const report = runAxintRepair({
      cwd: dir,
      issue:
        "Cadabra provider prompt-quality repair: Gemini/Nano Banana changes identity, face shape, head shape, hairline, beard, and clothing when glow-up or background replacement is strong. This is provider behavior semantics, not a runtime freeze.",
      sourcePath: "CadabraProvider.swift",
      platform: "iOS",
      expectedBehavior:
        "The generated portrait should preserve the same person's identity while applying selected Magic Pass settings.",
      actualBehavior:
        "The provider output preserves vibe but drifts identity and changes facial details.",
      writeReport: false,
      writeFeedback: false,
    });

    expect(report.issueClass).toBe("provider-behavior");
    expect(report.repairIntelligence.summary).toContain("provider behavior repair");
    expect(report.repairIntelligence.summary).not.toContain("runtime freeze");
    expect(report.hypotheses.map((item) => item.title).join("\n")).toContain(
      "Provider prompt contract"
    );
    expect(report.evidenceToCollect.join("\n")).toContain(
      "provider prompt/routing proof"
    );
    expect(report.repairPrompt).toContain("identity preservation");
    expect(report.repairPrompt).not.toContain("sample <AppProcessName>");
  });
});
