import { describe, expect, it } from "vitest";
import { renderCloudCheckReport, runCloudCheck } from "../../src/cloud/check.js";
import { writeCloudFeedbackSignal } from "../../src/cloud/feedback-store.js";
import { handleToolCall } from "../../src/mcp/server.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
