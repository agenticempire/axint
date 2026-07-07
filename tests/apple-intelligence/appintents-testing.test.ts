import { describe, expect, it } from "vitest";
import { generateAppIntentsTestingHarness } from "../../src/apple-intelligence/appintents-testing.js";

describe("AppIntentsTesting harness generator", () => {
  it("generates a safe readiness harness from Swift App Intent source", () => {
    const harness = generateAppIntentsTestingHarness({
      moduleName: "DemoApp",
      fileName: "MessageIntent.swift",
      swiftSource: `
import AppIntents

@AppEntity(schema: .messages.message)
struct Message: AppEntity, SyncableEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Message")
    static var defaultQuery = MessageQuery()
    var id: String
}

@AppIntent(schema: .messages.sendMessage)
struct SendMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "Send Message"
    func perform() async throws -> some IntentResult {
        .result()
    }
}
`,
    });

    expect(harness).toContain("#if canImport(AppIntentsTesting)");
    expect(harness).toContain("import AppIntentsTesting");
    expect(harness).toContain("import Testing");
    expect(harness).toContain("@testable import DemoApp");
    expect(harness).toContain('@Suite("Axint App Intents readiness")');
    expect(harness).toContain("SendMessageIntent");
    expect(harness).toContain("Message");
    expect(harness).toContain('IntentDefinitions(bundleIdentifier: "DemoApp")');
    expect(harness).toContain('definitions.intents["SendMessageIntent"]');
    expect(harness).toContain(".makeIntent(");
    expect(harness).toContain(".run()");
    expect(harness).toContain('definitions.entities["Message"]');
    expect(harness).not.toContain("#expect(true)");
    expect(harness).toContain("appEntityIdentifier");
    expect(harness).toContain("Spotlight");
    expect(harness).toContain("Shortcuts");
  });
});
