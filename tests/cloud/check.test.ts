import { describe, expect, it } from "vitest";
import { renderCloudCheckReport, runCloudCheck } from "../../src/cloud/check.js";
import { handleToolCall } from "../../src/mcp/server.js";

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
    expect(report.language).toBe("swift");
    expect(report.surface).toBe("intent");
    expect(report.errors).toBeGreaterThan(0);
    expect(report.learningSignal?.diagnosticCodes).toContain("AX704");
    expect(report.learningSignal?.redaction).toBe("source_not_included");
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
});
