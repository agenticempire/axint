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
    expect(report.repairPrompt).toContain("axint cloud check --source <file>");
    expect(renderCloudCheckReport(report, "markdown")).toContain("Axint Cloud Check");
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
    expect(payload.status).toBe("pass");
    expect(payload.fileName).toBe("ContentView.swift");
  });
});
