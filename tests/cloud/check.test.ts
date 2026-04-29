import { describe, expect, it } from "vitest";
import { renderCloudCheckReport, runCloudCheck } from "../../src/cloud/check.js";
import { writeCloudFeedbackSignal } from "../../src/cloud/feedback-store.js";
import { handleToolCall } from "../../src/mcp/server.js";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeProjectContextIndex } from "../../src/project/context-index.js";

describe("cloud check", () => {
  it("runs a Swift source check and returns an agent repair prompt", () => {
    const report = runCloudCheck({
      fileName: "BrokenIntent.swift",
      source: `
import AppIntents

struct BrokenIntent: AppIntent {
    static let title: LocalizedStringResource = "Broken"
}
`,
    });

    expect(report.status).toBe("fail");
    expect(report.gate.decision).toBe("fix_required");
    expect(report.gate.canClaimFixed).toBe(false);
    expect(report.language).toBe("swift");
    expect(report.surface).toBe("intent");
    expect(report.errors).toBeGreaterThan(0);
    expect(report.learningSignal?.diagnosticCodes).toContain("AX704");
    expect(report.learningSignal?.redaction).toBe("source_not_included");
    expect(report.repairPlan.map((step) => step.title).join("\n")).toContain("AX704");
    expect(report.repairPrompt).toContain("axint cloud check --source <file>");
    expect(renderCloudCheckReport(report, "markdown")).toContain("Axint Cloud Check");
    expect(renderCloudCheckReport(report, "markdown")).toContain(
      "Compiler Feedback Signal"
    );
    expect(renderCloudCheckReport(report, "markdown")).toContain("Coverage");
  });

  it("surfaces Swift validator diagnostics through Cloud Check", () => {
    const report = runCloudCheck({
      fileName: "Client.swift",
      source: `
class Client {
    func run() {
        Task {
            self.log("go")
        }
    }
    func log(_ msg: String) {}
}
`,
    });

    expect(report.status).toBe("needs_review");
    expect(report.diagnostics.map((d) => d.code)).toContain("AX731");
    expect(report.repairPrompt).toContain("AX731");
    expect(report.coverage).toContainEqual(
      expect.objectContaining({
        label: "Swift validator rule engine",
        state: "checked",
      })
    );
    expect(report.confidence.level).toBe("medium");
  });

  it("compiles TypeScript source before producing a Cloud Check report", () => {
    const report = runCloudCheck({
      fileName: "SendMessage.intent.ts",
      source: `
import { defineIntent, param } from "@axint/sdk";

export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Send a message",
  params: {
    recipient: param.string("Recipient"),
  },
  perform: async ({ recipient }) => ({ recipient }),
});
`,
    });

    expect(report.language).toBe("typescript");
    expect(report.surface).toBe("intent");
    expect(report.swiftCode).toContain("struct SendMessageIntent");
  });

  it("separates compiler, MCP, cloud ruleset, and expected project versions", () => {
    const report = runCloudCheck({
      fileName: "ContentView.swift",
      source: `
import SwiftUI

struct ContentView: View {
    var body: some View { Text("Hello") }
}
`,
      expectedVersion: "9.9.8",
      localPackageVersion: "9.9.8",
      mcpServerVersion: "9.9.7",
      cloudRulesetVersion: "9.9.9",
    });

    expect(report.versionInfo.compilerVersion).toBe(report.compilerVersion);
    expect(report.versionInfo.localPackageVersion).toBe("9.9.8");
    expect(report.versionInfo.mcpServerVersion).toBe("9.9.7");
    expect(report.versionInfo.cloudRulesetVersion).toBe("9.9.9");
    expect(report.versionInfo.expectedProjectVersion).toBe("9.9.8");
    expect(report.versionInfo.consistent).toBe(false);
    expect(renderCloudCheckReport(report, "markdown")).toContain("Version truth");
  });

  it("exposes Cloud Check through MCP", async () => {
    const result = await handleToolCall("axint.cloud.check", {
      fileName: "ContentView.swift",
      source: `
import SwiftUI

struct ContentView: View {
    var body: some View { Text("Hello") }
}
`,
      format: "json",
    });

    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe("needs_review");
    expect(payload.gate.decision).toBe("evidence_required");
    expect(payload.gate.canClaimFixed).toBe(false);
    expect(payload.fileName).toBe("ContentView.swift");
    expect(payload.swiftCode).toBeUndefined();
    expect(payload.sourceRedaction.swiftCode).toBe("omitted_from_rendered_json");
    expect(payload.confidence.level).toBe("medium");
    expect(payload.coverage).toContainEqual(
      expect.objectContaining({
        label: "Xcode build, UI tests, and runtime behavior",
        state: "needs_runtime",
      })
    );
    expect(payload.checks).toContainEqual(
      expect.objectContaining({
        label: "Runtime and UI coverage",
        state: "warn",
      })
    );
    expect(payload.repairPrompt).toContain("This is not a runtime pass");
  });

  it("turns supplied UI-test evidence into actionable Cloud diagnostics", () => {
    const report = runCloudCheck({
      fileName: "MainSwarmWindow.swift",
      source: `
import SwiftUI

struct MainSwarmWindow: View {
    var body: some View {
        VStack {
            Text("Workspace")
            Button("Back") {}
                .accessibilityIdentifier("back-to-workspace")
        }
        .accessibilityIdentifier("project-room")
    }
}
`,
      testFailure:
        'XCTAssert failed: No matches found for app.otherElements["workspace-home"]. Container accessibilityIdentifier propagation overwrote child identifiers.',
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-UI-ACCESSIBILITY-ID"
    );
    expect(report.repairPrompt).toContain("Evidence supplied");
    expect(report.repairPrompt).toContain("Remove container-level identifiers");
    expect(report.repairPlan.map((step) => step.title).join("\n")).toContain(
      "AXCLOUD-UI-TEST-ELEMENT"
    );
    expect(report.learningSignal?.suggestedOwner).toBe("cloud");
    expect(report.coverage).toContainEqual(
      expect.objectContaining({
        label: "Xcode build, UI tests, and runtime behavior",
        state: "checked",
      })
    );
  });

  it("catches macOS platform mismatches from source plus platform hint", () => {
    const report = runCloudCheck({
      fileName: "SettingsView.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct SettingsView: View {
    @State private var value = ""
    var body: some View {
        TextField("Value", text: $value)
            .keyboardType(.decimalPad)
    }
}
`,
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-PLATFORM-MACOS");
    expect(report.nextSteps.join("\n")).toMatch(/macOS|platform/i);
  });

  it("passes a SwiftUI file when static checks and supplied build/test evidence are clean", () => {
    const report = runCloudCheck({
      fileName: "ContentView.swift",
      source: `
import SwiftUI

struct ContentView: View {
    var body: some View { Text("Hello") }
}
`,
      xcodeBuildLog: "Build succeeded. 38 tests passed.",
    });

    expect(report.status).toBe("pass");
    expect(report.gate.decision).toBe("ready_to_ship");
    expect(report.gate.canClaimFixed).toBe(true);
    expect(report.evidence.provided).toContain("xcodeBuildLog");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        label: "Runtime and UI coverage",
        state: "pass",
      })
    );
    expect(report.repairPrompt).not.toContain("This is not a runtime pass");
    expect(report.coverage).toContainEqual(
      expect.objectContaining({
        label: "Xcode build, UI tests, and runtime behavior",
        state: "checked",
      })
    );
  });

  it("treats expected and actual behavior as semantic evidence instead of string equality", () => {
    const report = runCloudCheck({
      fileName: "HomeCommandLayer.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct HomeCommandLayer: View {
    var body: some View {
        VStack(alignment: .leading) {
            Text("Command layer")
            TextField("Ask the swarm", text: .constant(""))
        }
    }
}
`,
      expectedBehavior:
        "Compact 15-20 percent top command layer above the feed with command summary, status pills, ambient activity, and composer interactivity.",
      actualBehavior:
        "Implemented a compact command layer that does not bury the feed, preserves feed-first browsing, shows command summary, status pills, ambient activity, and a composer row.",
      xcodeBuildLog: "Build succeeded. 38 tests passed.",
    });

    expect(report.diagnostics.map((d) => d.code)).not.toContain(
      "AXCLOUD-BEHAVIOR-MISMATCH"
    );
    expect(report.status).toBe("pass");
    expect(report.gate.decision).toBe("ready_to_ship");
  });

  it("does not mark SwiftUI view changes ready to ship from prose-only behavior evidence", () => {
    const report = runCloudCheck({
      fileName: "ProjectRoomContentView.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct ProjectRoomContentView: View {
    var body: some View {
        VStack {
            Text("Project room")
            Button("Launch") { }
        }
    }
}
`,
      expectedBehavior:
        "Project room uses black and cream brand colors, no orange button fills, and uniform command-center card heights.",
      actualBehavior:
        "Source patch adds black/cream palette constants and updates the button styles. Focused UI proof will run next.",
    });

    expect(report.status).toBe("needs_review");
    expect(report.gate.decision).toBe("evidence_required");
    expect(report.gate.canClaimFixed).toBe(false);
    expect(report.confidence.missingEvidence).toContain("Xcode build");
    expect(report.coverage).toContainEqual(
      expect.objectContaining({
        label: "Xcode build, UI tests, and runtime behavior",
        state: "needs_runtime",
      })
    );
  });

  it("does not treat build-only evidence as UI proof when the behavior says proof is pending", () => {
    const report = runCloudCheck({
      fileName: "HomeFeedView.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct HomeFeedView: View {
    var body: some View {
        ScrollView {
            Button("Post") {}
                .accessibilityIdentifier("home-post")
        }
    }
}
`,
      expectedBehavior:
        "The Home feed post control should stay visible and hittable after the composer repair.",
      actualBehavior:
        "The source patch is in place. Focused UI proof is pending and will run next.",
      xcodeBuildLog: "** BUILD SUCCEEDED **",
    });

    expect(report.status).toBe("needs_review");
    expect(report.gate.decision).toBe("evidence_required");
    expect(report.gate.canClaimFixed).toBe(false);
    expect(report.coverage).toContainEqual(
      expect.objectContaining({
        label: "Xcode build, UI tests, and runtime behavior",
        state: "needs_runtime",
      })
    );
  });

  it("trusts passing focused Xcode proof when behavior prose uses different wording", () => {
    const report = runCloudCheck({
      fileName: "DiscoverTabView.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct DiscoverTabView: View {
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, pinnedViews: [.sectionHeaders]) {
                Section {
                    Text("Feed")
                } header: {
                    Text("Discover")
                }
            }
        }
    }
}
`,
      expectedBehavior:
        "Discover tab preserves scroll offset, sticky header position, visible feed cards, and composer tap target after filter changes.",
      actualBehavior:
        "Focused UITest transcript attached for the current branch repair proof.",
      xcodeBuildLog: [
        "Test Suite 'SwarmUITests' started.",
        "Test Case '-[SwarmUITests testDiscoverTabScrollAnchors]' passed (1.18 seconds).",
        "Test Case '-[SwarmUITests testDiscoverComposerRemainsHittable]' passed (0.92 seconds).",
        "** TEST SUCCEEDED **",
        "Executed 2 tests, with 0 failures",
      ].join("\n"),
    });

    expect(report.diagnostics.map((d) => d.code)).not.toContain(
      "AXCLOUD-BEHAVIOR-MISMATCH"
    );
    expect(report.diagnostics.map((d) => d.code)).not.toContain(
      "AXCLOUD-EVIDENCE-UNCLASSIFIED"
    );
    expect(report.status).toBe("pass");
    expect(report.gate.decision).toBe("ready_to_ship");
    expect(report.repairPrompt).not.toContain("This is not a runtime pass");
  });

  it("does not keep stale accessibility warnings after focused UI proof passes", () => {
    const report = runCloudCheck({
      fileName: "BreakawayComposerView.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct BreakawayComposerView: View {
    @State private var draft = ""

    var body: some View {
        VStack {
            TextField("Message", text: $draft)
                .accessibilityIdentifier("breakaway-composer-field")
            Button("Send") {}
                .accessibilityIdentifier("breakaway-send")
        }
    }
}
`,
      expectedBehavior:
        "The breakaway corner entry opens the messenger window and keeps the composer text field hittable.",
      actualBehavior:
        "Focused UI proof passed with the accessibility identifiers attached to the queried text field and send button.",
      xcodeBuildLog: [
        "Test Suite 'SwarmUITests' started.",
        "Test Case '-[SwarmUITests testBreakawayCornerEntryOpensMessengerWindow]' passed (1.42 seconds).",
        "only-testing:SwarmUITests/SwarmUITests/testBreakawayCornerEntryOpensMessengerWindow",
        "** TEST SUCCEEDED **",
        "Executed 1 test, with 0 failures",
      ].join("\n"),
    });

    expect(report.diagnostics.map((d) => d.code)).not.toContain(
      "AXCLOUD-UI-ACCESSIBILITY-ID"
    );
    expect(report.status).toBe("pass");
    expect(report.gate.decision).toBe("ready_to_ship");
  });

  it("classifies macOS UI proof where a scrolled control is visible but not hittable", () => {
    const report = runCloudCheck({
      fileName: "ProjectCommandCenter.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct ProjectCommandCenter: View {
    var body: some View {
        ScrollView {
            Button("Manage Axint Core") {}
                .accessibilityIdentifier("discover-project-manage-axint-core")
        }
    }
}
`,
      testFailure:
        "XCTAssertTrue failed: discover-project-manage-axint-core should be hittable after scrolling. Element is not foreground and does not allow background interaction.",
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-UI-HIT-TEST-BLOCKER"
    );
    expect(report.diagnostics.map((d) => d.code)).not.toContain(
      "AXCLOUD-EVIDENCE-UNCLASSIFIED"
    );
    expect(report.repairPrompt).toContain("hit-testing");
  });

  it("treats intentional absence assertions as passing behavior proof", () => {
    const report = runCloudCheck({
      fileName: "ProjectCommandCenter.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct ProjectCommandCenter: View {
    var body: some View {
        VStack {
            Button("Manage") {}
            Button("Open") {}
        }
    }
}
`,
      expectedBehavior:
        "Owned projects should show Manage and Open actions and should not show Join or Follow.",
      actualBehavior:
        "Focused UI proof passed and asserted Join and Follow did not exist for owned projects while Manage and Open were hittable.",
      xcodeBuildLog: [
        "Test Suite 'SwarmUITests' started.",
        "Test Case '-[SwarmUITests testOwnedProjectActionsHideJoinAndFollow]' passed (1.04 seconds).",
        "** TEST SUCCEEDED **",
        "Executed 1 test, with 0 failures",
      ].join("\n"),
    });

    expect(report.diagnostics.map((d) => d.code)).not.toContain(
      "AXCLOUD-BEHAVIOR-MISMATCH"
    );
    expect(report.status).toBe("pass");
    expect(report.gate.decision).toBe("ready_to_ship");
  });

  it("flags behavior evidence only when the actual text describes a failure", () => {
    const report = runCloudCheck({
      fileName: "HomeCommandLayer.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct HomeCommandLayer: View {
    var body: some View {
        Text("Home")
    }
}
`,
      expectedBehavior:
        "Compact top command layer with command summary, status pills, ambient activity, and composer interactivity.",
      actualBehavior:
        "The command layer is missing. The app still shows the old home view instead.",
    });

    expect(report.status).toBe("needs_review");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-BEHAVIOR-MISMATCH");
    expect(report.gate.decision).toBe("fix_required");
  });

  it("classifies Xcode duplicate symbol build logs", () => {
    const report = runCloudCheck({
      fileName: "BrokenIntent.swift",
      source: `
import AppIntents

struct BrokenIntent: AppIntent {
    static var title: LocalizedStringResource = "Broken"
    func perform() async throws -> some IntentResult { .result() }
}
`,
      xcodeBuildLog:
        "error: invalid redeclaration of 'title'. Static var title was already declared in BrokenIntent.swift.",
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-BUILD-REDECLARATION"
    );
    expect(report.learningSignal?.signals).toContain("runtime-evidence-supplied");
  });

  it("classifies common hallucinated-symbol Xcode build logs", () => {
    const report = runCloudCheck({
      fileName: "ProjectImportProgressView.swift",
      source: `
import SwiftUI

struct ProjectImportProgressView: View {
    var body: some View { Text("Importing") }
}
`,
      xcodeBuildLog: [
        "error: type 'ImportSource.Kind' has no member 'githubRepo'",
        "error: incorrect argument label in call (have 'threadID:content:', expected 'to:content:')",
        "error: type 'SwarmFont' has no member 'codeCaption'",
        "error: cannot convert value of type '[String]' to expected argument type 'String'",
      ].join("\n"),
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-BUILD-MISSING-MEMBER"
    );
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-BUILD-ARGUMENT-LABEL"
    );
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-BUILD-TYPE-MISMATCH"
    );
    expect(report.repairPrompt).toContain("AXCLOUD-BUILD-MISSING-MEMBER");
    expect(report.learningSignal?.signals).toContain("runtime-evidence-supplied");
  });

  it("classifies SwiftUI type-erased modifier build logs as blocking evidence", () => {
    const report = runCloudCheck({
      fileName: "NewChatButton.swift",
      source: `
import SwiftUI

struct NewChatButton: View {
    var body: some View {
        Label("New Chat", systemImage: "plus")
            .labelStyle(.iconOnly)
            .swarmIcon(size: 18)
    }
}
`,
      xcodeBuildLog: "error: value of type 'some View' has no member 'swarmIcon'",
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain("AX766");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-BUILD-MISSING-MEMBER"
    );
    expect(report.nextSteps.join("\n")).toContain("type-erasing SwiftUI modifier");
  });

  it("treats explicit XCTest assertion failures as blocking evidence", () => {
    const report = runCloudCheck({
      fileName: "SprintP0TrustFixTests.swift",
      source: `
import SwiftUI

struct InviteModel {
    let visitorActionLabel = "Publish join call"
}
`,
      testFailure:
        'XCTAssertEqual failed: ("Publish join call") is not equal to ("Join the Swarm") - visitorActionLabel should be owner-aware.',
    });

    expect(report.status).toBe("fail");
    expect(report.gate.decision).toBe("fix_required");
    expect(report.gate.canClaimFixed).toBe(false);
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-XCTEST-FAILURE");
    expect(report.repairPrompt).toContain("failing assertion");
  });

  it("classifies Xcode UI automation startup failure separately from app assertions", () => {
    const report = runCloudCheck({
      fileName: "OnboardingControlsView.swift",
      source: `
import SwiftUI

struct OnboardingControlsView: View {
    var body: some View { Button("Continue") {} }
}
`,
      xcodeBuildLog: [
        "Focused Xcode test proof failed.",
        "The test runner failed to initialize for UI testing.",
        "Timed out while enabling automation mode.",
        "** TEST FAILED **",
      ].join("\n"),
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-XCTEST-AUTOMATION-INFRASTRUCTURE"
    );
    expect(report.repairPrompt).toContain("XCTest infrastructure");
  });

  it("classifies stale app termination as runner health instead of XCTest failure", () => {
    const report = runCloudCheck({
      fileName: "DiscoverView.swift",
      source: `
import SwiftUI

struct DiscoverView: View {
    var body: some View { Text("Discover") }
}
`,
      testFailure:
        "SwarmUITests.swift:62: error: Failed to terminate co.agenticempire.Swarm:9770",
    });
    const codes = report.diagnostics.map((diagnostic) => diagnostic.code);

    expect(report.status).toBe("needs_review");
    expect(codes).toContain("AXCLOUD-XCTEST-STALE-APP");
    expect(codes).not.toContain("AXCLOUD-XCTEST-FAILURE");
    expect(report.repairPrompt).toContain("stale app PID");
  });

  it("classifies focused runner timeouts before assertions as runner health", () => {
    const report = runCloudCheck({
      fileName: "P3FrontendArchitectureTests.swift",
      source: `
import SwiftUI

struct CommandPaletteShell: View {
    var body: some View { Text("Palette") }
}
`,
      xcodeBuildLog: [
        "Focused Xcode test proof failed.",
        "Selectors: -only-testing:SwarmTests/P3FrontendArchitectureTests",
        "[axint] Command timed out after 240s; sending SIGTERM to child process group.",
        "** TEST FAILED **",
      ].join("\n"),
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-XCTEST-RUNNER-HANG");
    expect(report.repairPrompt).toContain("runner health");
  });

  it("routes document-only artifacts away from Apple compiler diagnostics", () => {
    const report = runCloudCheck({
      fileName: "sprint-2026-04-20.html",
      source: `
<!doctype html>
<html>
  <body>
    <h1>North Star Sprint</h1>
    <p>Phase one continuity checklist.</p>
  </body>
</html>
`,
    });

    expect(report.status).toBe("needs_review");
    expect(report.surface).toBe("document");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-NON-APPLE-ARTIFACT");
    expect(report.diagnostics.map((d) => d.code)).not.toContain("AX001");
    expect(report.gate.decision).toBe("evidence_required");
    expect(report.nextSteps.join("\n")).toContain("browser/render");
    expect(report.repairPrompt).toContain("document or web artifact");
    expect(report.repairPlan.map((step) => step.title)).toContain(
      "Use the right proof surface"
    );
    expect(report.coverage).toContainEqual(
      expect.objectContaining({
        label: "Swift validator rule engine",
        state: "not_applicable",
      })
    );
  });

  it("classifies app freeze runtime evidence and likely main-thread blockers", () => {
    const report = runCloudCheck({
      fileName: "SwarmApp.swift",
      platform: "macOS",
      source: `
import SwiftUI

@main
struct SwarmApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    Thread.sleep(forTimeInterval: 10)
                }
        }
    }
}
`,
      runtimeFailure:
        "Swarm opens and freezes. The UI is unresponsive and the launch smoke test timed out waiting for Workspace.",
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-RUNTIME-FREEZE");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-RUNTIME-MAIN-BLOCKER"
    );
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-RUNTIME-SLEEP");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-RUNTIME-LIFECYCLE-BLOCKER"
    );
    expect(report.repairPrompt).toContain("app freezes");
    expect(report.repairPrompt).toContain("sample <AppProcessName>");
    expect(report.repairPlan.map((step) => step.title).join("\n")).toContain(
      "Capture a macOS hang sample"
    );
    expect(report.gate.canClaimFixed).toBe(false);
    expect(report.learningSignal?.signals).toContain("runtime-evidence-supplied");
    expect(report.learningSignal?.signals).toContain("runtime-freeze-evidence");
  });

  it("flags synchronous I/O as a likely freeze cause when runtime evidence says the UI hangs", () => {
    const report = runCloudCheck({
      fileName: "ProfileData.swift",
      platform: "macOS",
      source: `
import SwiftUI

struct ProfileDataView: View {
    var body: some View {
        Text(loadProfiles())
    }

    func loadProfiles() -> String {
        String(data: try! Data(contentsOf: URL(fileURLWithPath: "/tmp/profiles.json")), encoding: .utf8) ?? ""
    }
}
`,
      runtimeFailure:
        "App beachballs after launch and the workspace never becomes interactive.",
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-RUNTIME-FREEZE");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-RUNTIME-SYNC-IO");
    expect(report.repairPrompt).toContain("Synchronous I/O");
  });

  it("classifies SwiftUI state-transition hangs from main-thread busy UI-test evidence", () => {
    const report = runCloudCheck({
      fileName: "HomeFeedView.swift",
      platform: "iOS",
      source: `
import SwiftUI

struct HomeFeedView: View {
    @State private var selectedFilter = "All"
    let items: [FeedItem]

    var filteredItems: [FeedItem] {
        items
            .filter { selectedFilter == "All" || $0.kind == selectedFilter }
            .sorted { $0.createdAt > $1.createdAt }
    }

    var body: some View {
        ScrollView {
            LazyVStack(pinnedViews: [.sectionHeaders]) {
                Section {
                    ForEach(filteredItems) { item in
                        FeedCard(item: item)
                            .transition(.opacity.combined(with: .scale))
                    }
                } header: {
                    HStack {
                        ForEach(["All", "Following", "Popular"], id: \\.self) { filter in
                            Button(filter) {
                                withAnimation(.spring(response: 0.45, dampingFraction: 0.74)) {
                                    selectedFilter = filter
                                }
                            }
                        }
                    }
                }
            }
            .animation(.spring(response: 0.45, dampingFraction: 0.74), value: selectedFilter)
        }
    }
}
`,
      testFailure:
        "XCTAssert failed: after scrolling the Home feed and switching filters, the app main thread was busy for 30 seconds and the UI test timed out waiting for the application to idle.",
      expectedBehavior:
        "The Home feed filter should switch after the user scrolls and taps another segment.",
      actualBehavior:
        "After scrolling and switching filters, the app main thread was busy for 30 seconds.",
    });

    const codes = report.diagnostics.map((d) => d.code);

    expect(report.status).toBe("fail");
    expect(codes).toContain("AXCLOUD-RUNTIME-STATE-TRANSITION-HANG");
    expect(report.repairPrompt).toContain("state-transition hang");
    expect(report.repairPrompt).toContain("pinned headers");
    expect(report.repairPrompt).toContain("filter/sort/list changes");
    expect(report.repairPlan.map((step) => step.title).join("\n")).toContain(
      "Trim SwiftUI transition work first"
    );
    expect(report.learningSignal?.signals).toContain("swiftui-state-transition-hang");
    expect(report.learningSignal?.suggestedOwner).toBe("cloud");
  });

  it("classifies overlay hit-testing blockers when a compose box stops accepting input", () => {
    const report = runCloudCheck({
      fileName: "HomeComposer.swift",
      platform: "iOS",
      source: `
import SwiftUI

struct HomeComposer: View {
    @State private var draft = ""

    var body: some View {
        TextEditor(text: $draft)
            .frame(minHeight: 120)
            .overlay(alignment: .topLeading) {
                if draft.isEmpty {
                    Text("Write a comment")
                        .padding(.top, 12)
                        .padding(.leading, 16)
                }
            }
    }
}
`,
      runtimeFailure:
        "The home feed still renders, but the comment box is visible and I can't tap into it or type anymore.",
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain(
      "AXCLOUD-UI-HIT-TEST-BLOCKER"
    );
    expect(report.repairIntelligence?.issueClass).toBe("swiftui-input-interaction");
    expect(report.repairIntelligence?.summary).toContain("existing iOS Apple repair");
    expect(report.repairPlan.map((step) => step.title).join("\n")).toContain(
      "Senior Apple repair read"
    );
    expect(report.repairPrompt).toContain("allowsHitTesting(false)");
    expect(report.repairPrompt).toContain("Senior Apple repair read");
    expect(report.learningSignal?.signals).toContain("ui-interaction-evidence");
  });

  it("classifies propagated disabled state when a compose box no longer works", () => {
    const report = runCloudCheck({
      fileName: "HomeComposer.swift",
      platform: "iOS",
      source: `
import SwiftUI

struct HomeComposer: View {
    @State private var draft = ""
    @State private var isPosting = false
    @State private var isShowingFeatureGate = false

    var body: some View {
        VStack {
            TextField("Write a comment", text: $draft)
                .textFieldStyle(.roundedBorder)
        }
        .disabled(isPosting || isShowingFeatureGate)
    }
}
`,
      actualBehavior:
        "After adding the new feature, the compose box is visible but no longer accepts input or focus.",
    });

    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain("AXCLOUD-UI-DISABLED-STATE");
  });

  it("loads local project context and surfaces related files for a dead composer", () => {
    const dir = mkdtempSync(join(tmpdir(), "axint-cloud-context-"));
    try {
      mkdirSync(join(dir, ".axint"), { recursive: true });
      writeFileSync(
        join(dir, "HomeComposer.swift"),
        [
          "import SwiftUI",
          "",
          "struct HomeComposer: View {",
          '    @State private var draft = ""',
          "    var body: some View {",
          "        TextEditor(text: $draft)",
          "    }",
          "}",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(dir, "FeedShell.swift"),
        [
          "import SwiftUI",
          "",
          "struct FeedShell: View {",
          "    @State private var isPosting = false",
          "    var body: some View {",
          "        HomeComposer()",
          "            .disabled(isPosting)",
          "    }",
          "}",
          "",
        ].join("\n")
      );
      writeProjectContextIndex({
        targetDir: dir,
        changedFiles: ["FeedShell.swift"],
      });

      const report = runCloudCheck({
        sourcePath: join(dir, "HomeComposer.swift"),
        actualBehavior:
          "The comment box is visible, but after the new feature landed I can't tap into it or type anymore.",
      });

      expect(report.projectContext?.summary.join("\n")).toContain(
        "Project context loaded"
      );
      expect(report.projectContext?.relatedFiles.map((file) => file.path)).toContain(
        "FeedShell.swift"
      );
      expect(report.repairPrompt).toContain("Related files to inspect");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits a learning signal when static SwiftUI validation needs runtime evidence", () => {
    const report = runCloudCheck({
      fileName: "ContentView.swift",
      source: `
import SwiftUI

struct ContentView: View {
    var body: some View { Text("Hello") }
}
`,
    });

    expect(report.status).toBe("needs_review");
    expect(report.errors).toBe(0);
    expect(report.confidence.missingEvidence).toContain("Xcode build");
    expect(report.learningSignal?.diagnosticCodes).toContain("AXCLOUD-RUNTIME-COVERAGE");
    expect(report.learningSignal?.signals).toContain("runtime-evidence-missing");
    expect(report.learningSignal?.suggestedOwner).toBe("cloud");
    expect(report.gate.decision).toBe("evidence_required");
  });

  it("returns a redacted feedback signal as an MCP output format", async () => {
    const result = await handleToolCall("axint.cloud.check", {
      fileName: "BrokenIntent.swift",
      source: `
import AppIntents

struct BrokenIntent: AppIntent {
    static let title: LocalizedStringResource = "Broken"
}
`,
      format: "feedback",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.fingerprint).toMatch(/^learn-/);
    expect(payload.redaction).toBe("source_not_included");
    expect(payload.diagnosticCodes).toContain("AX704");
  });

  it("writes a redacted feedback signal for the learning flywheel", () => {
    const root = mkdtempSync(join(tmpdir(), "axint-feedback-"));
    try {
      const report = runCloudCheck({
        fileName: "BrokenIntent.swift",
        source: `
import AppIntents

struct BrokenIntent: AppIntent {
    static let title: LocalizedStringResource = "Broken"
}
`,
      });
      expect(report.learningSignal).toBeTruthy();
      const stored = writeCloudFeedbackSignal(report.learningSignal!, { cwd: root });
      const json = JSON.parse(readFileSync(stored.path, "utf-8"));
      expect(json.redaction).toBe("source_not_included");
      expect(json.diagnosticCodes).toContain("AX704");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
