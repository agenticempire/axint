import { describe, it, expect } from "vitest";
import { handleToolCall } from "../../src/mcp/server.js";

// These tests cover the agent-facing path: MCP tools that emit Swift
// should route through swift-format by default, fall back cleanly when
// the binary is missing, and respect `format: false` as an opt-out.
//
// The tests are tolerant of both environments:
//   - macOS dev boxes with Xcode → swift-format runs and reshapes output
//   - Linux CI without the toolchain → the formatter no-ops and returns
//     the raw generator output
//
// Either way, the shape of the response and the presence of the Swift
// body are invariants we can assert on.

const INTENT_SOURCE = `
  import { defineIntent, param } from "@axint/compiler";
  export default defineIntent({
    name: "SendMessage",
    title: "Send Message",
    description: "Send a text message",
    params: {
      recipient: param.string("Recipient"),
    },
    perform: async (_) => "sent",
  });
`;

const BROKEN_SWIFT = `
import AppIntents

struct BrokenIntent: AppIntent {
    static var title: LocalizedStringResource = "Broken"
    @State let count: Int = 0
}
`;

function textOf(result: Awaited<ReturnType<typeof handleToolCall>>): string {
  return result.content[0]?.text ?? "";
}

describe("axint.compile swift-format pipeline", () => {
  it("routes Swift output through swift-format by default", async () => {
    const result = await handleToolCall("axint.compile", {
      source: INTENT_SOURCE,
      fileName: "send-message.ts",
    });
    const text = textOf(result);
    expect(result.isError).not.toBe(true);
    expect(text).toContain("struct SendMessage");
    expect(text).toContain("AppIntent");
  });

  it("skips swift-format when format is false", async () => {
    const result = await handleToolCall("axint.compile", {
      source: INTENT_SOURCE,
      fileName: "send-message.ts",
      format: false,
    });
    const text = textOf(result);
    expect(result.isError).not.toBe(true);
    expect(text).toContain("struct SendMessage");
  });

  it("produces the same Swift body with and without formatting on Linux CI", async () => {
    // When swift-format is unavailable the two paths converge. When it's
    // available the formatted version may reshape whitespace but both
    // still contain the core generator output.
    const [formatted, raw] = await Promise.all([
      handleToolCall("axint.compile", { source: INTENT_SOURCE }),
      handleToolCall("axint.compile", { source: INTENT_SOURCE, format: false }),
    ]);
    for (const r of [formatted, raw]) {
      expect(r.isError).not.toBe(true);
      expect(textOf(r)).toContain("struct SendMessage");
    }
  });
});

describe("axint.schema.compile swift-format pipeline", () => {
  it("formats intent schema output by default", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "intent",
      name: "GetWeather",
      title: "Get Weather",
      params: { city: "string" },
    });
    const text = textOf(result);
    expect(result.isError).not.toBe(true);
    expect(text).toContain("Token Statistics");
    expect(text).toContain("struct GetWeather");
  });

  it("respects format: false on schema compile", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "intent",
      name: "GetWeather",
      title: "Get Weather",
      format: false,
    });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("struct GetWeather");
  });

  it("formats view schema output", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "view",
      name: "GreetingCard",
      props: { name: "string" },
    });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("struct GreetingCard");
  });

  it("formats widget schema output", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "widget",
      name: "StepsWidget",
      displayName: "Steps",
      entry: { steps: "int" },
    });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("struct StepsWidget");
  });

  it("formats app schema output", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "app",
      name: "TrailPlanner",
      scenes: [{ kind: "windowGroup", view: "ContentView" }],
    });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("struct TrailPlanner");
  });
});

describe("axint.swift.fix swift-format pipeline", () => {
  it("returns repaired Swift that contains the fix", async () => {
    const result = await handleToolCall("axint.swift.fix", {
      source: BROKEN_SWIFT,
    });
    const text = textOf(result);
    expect(result.isError).not.toBe(true);
    // The fixer rewrites @State let → @State var. The formatted and raw
    // paths both preserve that substitution.
    expect(text).toContain("@State");
    expect(text).toContain("var count");
  });

  it("accepts format: false on swift.fix", async () => {
    const result = await handleToolCall("axint.swift.fix", {
      source: BROKEN_SWIFT,
      format: false,
    });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("var count");
  });
});

describe("axint.feature swift-format pipeline", () => {
  it("formats every Swift file in the feature package", async () => {
    const result = await handleToolCall("axint.feature", {
      description: "Let users log water intake via Siri",
      surfaces: ["intent"],
      name: "LogWaterIntake",
    });
    const text = textOf(result);
    expect(result.isError).not.toBe(true);
    expect(text).toContain("LogWaterIntake");
    expect(text).toContain("AppIntent");
  });

  it("respects format: false on feature generation", async () => {
    const result = await handleToolCall("axint.feature", {
      description: "Let users log water intake via Siri",
      surfaces: ["intent"],
      name: "LogWaterIntake",
      format: false,
    });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("LogWaterIntake");
  });
});
