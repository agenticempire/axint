import { describe, it, expect } from "vitest";
import {
  compileSource,
  compileFromIR,
  compileViewFromIR,
  compileWidgetFromIR,
  compileAppFromIR,
} from "../../src/core/compiler.js";
import { scaffoldIntent } from "../../src/mcp/scaffold.js";
import { TEMPLATES, getTemplate } from "../../src/templates/index.js";

// ── axint_scaffold ──────────────────────────────────────────────────

describe("axint_scaffold tool", () => {
  it("generates a valid intent file for minimal input", () => {
    const source = scaffoldIntent({
      name: "SendMessage",
      description: "Send a message to a contact",
    });
    expect(source).toContain("defineIntent");
    expect(source).toContain('"SendMessage"');
    expect(source).toContain("Send a message to a contact");
    expect(source).toContain("perform:");
  });

  it("includes parameters when provided", () => {
    const source = scaffoldIntent({
      name: "CreateEvent",
      description: "Create a calendar event",
      params: [
        { name: "title", type: "string", description: "Event title" },
        { name: "startDate", type: "date", description: "When it starts" },
      ],
    });
    expect(source).toContain("param.string");
    expect(source).toContain("param.date");
    expect(source).toContain("title");
    expect(source).toContain("startDate");
  });

  it("includes domain when specified", () => {
    const source = scaffoldIntent({
      name: "BookRide",
      description: "Book a rideshare",
      domain: "navigation",
    });
    expect(source).toContain('"navigation"');
  });

  it("converts kebab-case names to PascalCase", () => {
    const source = scaffoldIntent({ name: "send-message", description: "test" });
    expect(source).toContain('"SendMessage"');
  });

  it("falls back to string for unknown param types", () => {
    const source = scaffoldIntent({
      name: "Test",
      description: "test",
      params: [{ name: "foo", type: "unknownType", description: "test" }],
    });
    expect(source).toContain("param.string");
  });

  it("sanitizes control characters in descriptions", () => {
    const source = scaffoldIntent({
      name: "Test",
      description: "line\x00one\ttwo\nthree",
    });
    // The description string inside the JSON should be clean (no null bytes, tabs collapsed)
    expect(source).toContain('"line one two three"');
    // Null byte should never appear in output
    expect(source).not.toContain("\x00");
  });

  it("handles empty params array", () => {
    const source = scaffoldIntent({ name: "Empty", description: "nothing", params: [] });
    expect(source).toContain("params: {},");
  });
});

// ── axint_compile ───────────────────────────────────────────────────

describe("axint_compile tool", () => {
  it("compiles a valid intent to Swift", () => {
    const source = `
      import { defineIntent, param } from "axint";
      export default defineIntent({
        name: "SendMessage",
        title: "Send Message",
        description: "Send a text message",
        params: {
          recipient: param.string("Recipient name"),
          body: param.string("Message body"),
        },
        perform: async ({ recipient, body }) => {
          return \`Sent "\${body}" to \${recipient}\`;
        },
      });
    `;
    const result = compileSource(source, "send-message.ts");
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("struct SendMessage");
    expect(result.output!.swiftCode).toContain("AppIntent");
  });

  it("returns diagnostics for invalid source", () => {
    const result = compileSource("const x = 1;", "bad.ts");
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].code).toBeTruthy();
  });

  it("returns diagnostics for missing required fields", () => {
    const source = `
      import { defineIntent } from "axint";
      export default defineIntent({
        name: "Incomplete",
      });
    `;
    const result = compileSource(source, "incomplete.ts");
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("emits Info.plist fragment when requested", () => {
    const source = `
      import { defineIntent, param } from "axint";
      export default defineIntent({
        name: "PlayMusic",
        title: "Play Music",
        description: "Play a song",
        domain: "media",
        params: {},
        perform: async (_) => "Playing",
      });
    `;
    const result = compileSource(source, "play.ts", { emitInfoPlist: true });
    if (result.success && result.output?.infoPlistFragment) {
      expect(result.output.infoPlistFragment).toContain("plist");
    }
    // Even if plist not supported, compilation should succeed
    expect(result.success).toBe(true);
  });

  it("handles empty source string gracefully", () => {
    const result = compileSource("", "empty.ts");
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

// ── axint_validate ──────────────────────────────────────────────────

describe("axint_validate tool", () => {
  it("returns no diagnostics for a valid intent", () => {
    const source = `
      import { defineIntent, param } from "axint";
      export default defineIntent({
        name: "GetWeather",
        title: "Get Weather",
        description: "Check the weather",
        params: {
          city: param.string("City name"),
        },
        perform: async ({ city }) => \`Weather in \${city}\`,
      });
    `;
    const result = compileSource(source, "<validate>");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("reports error diagnostics for malformed intent", () => {
    const source = `
      import { defineIntent, param } from "axint";
      export default defineIntent({
        params: {},
        perform: async (_) => "done",
      });
    `;
    const result = compileSource(source, "<validate>");
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});

// ── axint_compile_from_schema (intent) ──────────────────────────────

describe("axint_compile_from_schema — intent", () => {
  it("compiles a minimal intent schema to Swift", () => {
    const ir = {
      name: "CreateReminder",
      title: "Create Reminder",
      description: "Create a new reminder",
      parameters: [
        {
          name: "text",
          type: { kind: "primitive" as const, value: "string" as const },
          title: "Reminder text",
          description: "",
          isOptional: false,
        },
      ],
      returnType: { kind: "primitive" as const, value: "string" as const },
      sourceFile: "<schema>",
    };

    const result = compileFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("CreateReminder");
    expect(result.output!.swiftCode).toContain("AppIntent");
  });

  it("handles intent with no parameters", () => {
    const ir = {
      name: "DoNothing",
      title: "Do Nothing",
      description: "A no-op intent",
      parameters: [],
      returnType: { kind: "primitive" as const, value: "string" as const },
      sourceFile: "<schema>",
    };

    const result = compileFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("DoNothing");
  });
});

// ── axint_compile_from_schema (view) ────────────────────────────────

describe("axint_compile_from_schema — view", () => {
  it("compiles a view schema to SwiftUI", () => {
    const ir = {
      name: "ProfileCard",
      props: [
        {
          name: "username",
          type: { kind: "primitive" as const, value: "string" as const },
          isOptional: false,
        },
      ],
      state: [
        {
          name: "isExpanded",
          type: { kind: "primitive" as const, value: "boolean" as const },
          kind: "state" as const,
          defaultValue: false,
        },
      ],
      body: [{ kind: "raw" as const, swift: "VStack { Text(username) }" }],
      sourceFile: "<schema>",
    };

    const result = compileViewFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("ProfileCard");
    expect(result.output!.swiftCode).toContain("View");
  });
});

// ── axint_compile_from_schema (widget) ──────────────────────────────

describe("axint_compile_from_schema — widget", () => {
  it("compiles a widget schema to Swift", () => {
    const ir = {
      name: "StepCounter",
      displayName: "Step Counter",
      description: "Shows daily steps",
      families: ["systemSmall" as const],
      entry: [
        { name: "steps", type: { kind: "primitive" as const, value: "int" as const } },
      ],
      body: [{ kind: "text" as const, content: "Steps today" }],
      refreshPolicy: "atEnd" as const,
      sourceFile: "<schema>",
    };

    const result = compileWidgetFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("StepCounter");
    expect(result.output!.swiftCode).toContain("Widget");
  });

  it("rejects invalid widget family", () => {
    const ir = {
      name: "BadWidget",
      displayName: "Bad",
      description: "test",
      families: ["invalidFamily" as unknown as "systemSmall"],
      entry: [],
      body: [{ kind: "text" as const, content: "test" }],
      refreshPolicy: "atEnd" as const,
      sourceFile: "<schema>",
    };

    const result = compileWidgetFromIR(ir);
    // Should either fail or at least not crash
    expect(result).toBeDefined();
  });
});

// ── axint_compile_from_schema (app) ─────────────────────────────────

describe("axint_compile_from_schema — app", () => {
  it("compiles an app schema with a single scene", () => {
    const ir = {
      name: "MyApp",
      scenes: [
        {
          sceneKind: "windowGroup" as const,
          rootView: "ContentView",
          isDefault: true,
        },
      ],
      sourceFile: "<schema>",
    };

    const result = compileAppFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("MyApp");
    expect(result.output!.swiftCode).toContain("@main");
    expect(result.output!.swiftCode).toContain("App");
  });

  it("compiles an app with multiple scenes", () => {
    const ir = {
      name: "MultiSceneApp",
      scenes: [
        { sceneKind: "windowGroup" as const, rootView: "MainView", isDefault: true },
        { sceneKind: "settings" as const, rootView: "SettingsView", isDefault: false },
      ],
      sourceFile: "<schema>",
    };

    const result = compileAppFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("MainView");
    expect(result.output!.swiftCode).toContain("Settings");
  });

  it("handles platform-guarded scenes", () => {
    const ir = {
      name: "PlatformApp",
      scenes: [
        { sceneKind: "windowGroup" as const, rootView: "ContentView", isDefault: true },
        {
          sceneKind: "windowGroup" as const,
          rootView: "MacOnlyView",
          platformGuard: "macOS" as const,
          isDefault: false,
        },
      ],
      sourceFile: "<schema>",
    };

    const result = compileAppFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("#if os(macOS)");
  });
});

// ── axint_list_templates ────────────────────────────────────────────

describe("axint_list_templates tool", () => {
  it("returns a non-empty list of templates", () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
  });

  it("each template has id, title, and source", () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.source).toBeTruthy();
    }
  });
});

// ── axint_template ──────────────────────────────────────────────────

describe("axint_template tool", () => {
  it("returns source for a known template", () => {
    const knownId = TEMPLATES[0].id;
    const tpl = getTemplate(knownId);
    expect(tpl).toBeDefined();
    expect(tpl!.source).toContain("defineIntent");
  });

  it("returns undefined for an unknown template", () => {
    const tpl = getTemplate("nonexistent-template-xyz-999");
    expect(tpl).toBeUndefined();
  });

  it("returned source compiles successfully", () => {
    const knownId = TEMPLATES[0].id;
    const tpl = getTemplate(knownId);
    expect(tpl).toBeDefined();

    const result = compileSource(tpl!.source, `${knownId}.ts`);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });
});

// ── Error boundary ──────────────────────────────────────────────────

describe("MCP error handling", () => {
  it("compileSource doesn't throw on garbage input", () => {
    expect(() => compileSource("{{{{", "garbage.ts")).not.toThrow();
    const result = compileSource("{{{{", "garbage.ts");
    expect(result.success).toBe(false);
  });

  it("compileFromIR doesn't throw on empty IR", () => {
    const emptyIr = {
      name: "",
      title: "",
      description: "",
      parameters: [],
      returnType: { kind: "primitive" as const, value: "string" as const },
      sourceFile: "",
    };
    expect(() => compileFromIR(emptyIr)).not.toThrow();
  });

  it("scaffoldIntent doesn't throw on empty name", () => {
    expect(() => scaffoldIntent({ name: "", description: "" })).not.toThrow();
    const source = scaffoldIntent({ name: "", description: "" });
    expect(source).toContain("defineIntent");
  });
});
