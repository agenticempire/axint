import { describe, expect, it } from "vitest";
import { handleCompileFromSchema } from "../../src/mcp/schema-compile.js";

function text(result: Awaited<ReturnType<typeof handleCompileFromSchema>>) {
  return result.content.map((item) => item.text).join("\n");
}

describe("schema compile Apple 27 parity", () => {
  it("compiles schema-backed App Intents with execution configuration", async () => {
    const result = await handleCompileFromSchema({
      type: "intent",
      name: "CreateNote",
      title: "Create Note",
      schemaDomain: "notes",
      schema: ".calendar.deleteEvents",
      params: { name: "AttributedString" },
      execution: {
        authenticationPolicy: ".requiresAuthentication",
        openAppWhenRun: false,
      },
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(text(result)).toContain("@AppIntent(schema: .calendar.deleteEvent)");
    expect(text(result)).toContain("var name: AttributedString");
    expect(text(result)).toContain("static var authenticationPolicy");
  });

  it("emits a privacy manifest when requested", async () => {
    const result = await handleCompileFromSchema({
      type: "intent",
      name: "AnalyzeFile",
      title: "Analyze File",
      params: {},
      emitPrivacyManifest: true,
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(text(result)).toContain("PrivacyInfo.xcprivacy");
    expect(text(result)).toContain("NSPrivacyAccessedAPITypes");
  });
});
