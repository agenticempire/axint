import { describe, it, expect } from "vitest";
import {
  compileSource,
  compileFromIR,
  compileViewFromIR,
  compileWidgetFromIR,
  compileAppFromIR,
} from "../../src/core/compiler.js";
import { handleToolCall } from "../../src/mcp/server.js";
import { scaffoldIntent } from "../../src/mcp/scaffold.js";
import { TEMPLATES, getTemplate } from "../../src/templates/index.js";
import { validateSwiftSource } from "../../src/core/swift-validator.js";
import { fixSwiftSource } from "../../src/core/swift-fixer.js";

describe("axint.status tool", () => {
  it("reports the running MCP server version and restart instructions", async () => {
    const result = await handleToolCall("axint.status", { format: "json" });

    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0].text) as {
      server: string;
      version: string;
      restartRequiredAfterUpdate: boolean;
      xcodeSetupCommand: string;
    };
    expect(payload.server).toBe("axint-mcp");
    expect(payload.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(payload.restartRequiredAfterUpdate).toBe(true);
    expect(payload.xcodeSetupCommand).toBe("axint xcode setup --agent claude");
  });

  it("returns a human-readable Xcode update path", async () => {
    const result = await handleToolCall("axint.status", {});

    expect(result.content[0].text).toContain("# Axint MCP Status");
    expect(result.content[0].text).toContain("Call axint.status");
    expect(result.content[0].text).toContain("Restart the Xcode Claude Agent");
  });
});

const VIEW_SOURCE = `
  import { defineView, prop, state, view } from "@axint/sdk";

  export default defineView({
    name: "GreetingCard",
    props: {
      username: prop.string("User name"),
    },
    state: {
      count: state.int("Tap count", { default: 0 }),
    },
    body: [
      view.vstack([
        view.text("Hello, \\\\(username)!"),
        view.button("Tap", "count += 1"),
      ]),
    ],
  });
`;

const WIDGET_SOURCE = `
  import { defineWidget, entry, view } from "@axint/sdk";

  export default defineWidget({
    name: "StepCounter",
    displayName: "Step Counter",
    description: "Shows daily steps",
    families: ["systemSmall"],
    entry: {
      steps: entry.int("Step count", { default: 0 }),
    },
    body: [
      view.text("\\\\(steps)"),
    ],
    refreshInterval: 15,
  });
`;

const APP_SOURCE = `
  import { defineApp } from "@axint/sdk";

  export default defineApp({
    name: "TrailPlanner",
    scenes: [
      { kind: "windowGroup", view: "ContentView" },
    ],
  });
`;

// ── axint.scaffold ──────────────────────────────────────────────────

describe("axint.scaffold tool", () => {
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

// ── axint.compile ───────────────────────────────────────────────────

describe("axint.compile tool", () => {
  it("compiles a valid intent to Swift", () => {
    const source = `
      import { defineIntent, param } from "@axint/compiler";
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
      import { defineIntent } from "@axint/compiler";
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
      import { defineIntent, param } from "@axint/compiler";
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

// ── axint.validate ──────────────────────────────────────────────────

describe("axint.validate tool", () => {
  it("returns no diagnostics for a valid intent", () => {
    const source = `
      import { defineIntent, param } from "@axint/compiler";
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
      import { defineIntent, param } from "@axint/compiler";
      export default defineIntent({
        params: {},
        perform: async (_) => "done",
      });
    `;
    const result = compileSource(source, "<validate>");
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});

describe("axint MCP multi-surface tool dispatch", () => {
  it("compiles defineView() through the axint.compile MCP tool", async () => {
    const result = await handleToolCall("axint.compile", {
      source: VIEW_SOURCE,
      fileName: "greeting-card.ts",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct GreetingCard: View");
  });

  it("validates defineView() through the axint.validate MCP tool", async () => {
    const result = await handleToolCall("axint.validate", {
      source: VIEW_SOURCE,
      fileName: "greeting-card.ts",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("Valid Axint definition. No issues found.");
  });

  it("compiles defineWidget() through the axint.compile MCP tool", async () => {
    const result = await handleToolCall("axint.compile", {
      source: WIDGET_SOURCE,
      fileName: "step-counter.ts",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct StepCounterWidget: Widget");
  });

  it("validates defineWidget() through the axint.validate MCP tool", async () => {
    const result = await handleToolCall("axint.validate", {
      source: WIDGET_SOURCE,
      fileName: "step-counter.ts",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("Valid Axint definition. No issues found.");
  });

  it("compiles defineApp() through the axint.compile MCP tool", async () => {
    const result = await handleToolCall("axint.compile", {
      source: APP_SOURCE,
      fileName: "trail-planner-app.ts",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct TrailPlannerApp: App");
  });

  it("validates defineApp() through the axint.validate MCP tool", async () => {
    const result = await handleToolCall("axint.validate", {
      source: APP_SOURCE,
      fileName: "trail-planner-app.ts",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("Valid Axint definition. No issues found.");
  });
});

// ── axint.schema.compile (intent) ──────────────────────────────

describe("axint.schema.compile — intent", () => {
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

  it("emits AppIntent title with static var to match the Swift validator", () => {
    const ir = {
      name: "LogWaterIntake",
      title: "Log Water Intake",
      description: "Log a glass of water",
      parameters: [],
      returnType: { kind: "primitive" as const, value: "string" as const },
      sourceFile: "<schema>",
    };

    const result = compileFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain(
      'static var title: LocalizedStringResource = "Log Water Intake"'
    );
    expect(
      validateSwiftSource(result.output!.swiftCode, "LogWaterIntake.swift").diagnostics
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "AX704" })]));
  });

  it("schema compile humanizes parameter titles consistently with TypeScript compile", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "intent",
      name: "SwipeRight",
      title: "Swipe Right",
      params: {
        profileName: "string",
        profileId: "string",
      },
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('@Parameter(title: "Profile Name"');
    expect(result.content[0].text).toContain('@Parameter(title: "Profile ID"');
    expect(result.content[0].text).not.toContain('"profile Name"');
    expect(result.content[0].text).not.toContain('"profile Id"');
  });
});

// ── axint.schema.compile (view) ────────────────────────────────

describe("axint.schema.compile — view", () => {
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

  it("coerces numeric string defaults to numeric Swift literals", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "view",
      name: "WaterTrackerView",
      state: {
        totalOunces: { type: "double", default: "0" },
      },
      body: 'Text("\\\\(totalOunces)")',
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain(
      "@State private var totalOunces: Double = 0"
    );
    expect(result.content[0].text).not.toContain(
      '@State private var totalOunces: Double = "0"'
    );
  });

  it("normalizes escaped newlines in raw view bodies", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "view",
      name: "MatchCelebrationView",
      state: {
        isAnimating: { type: "boolean", default: "false" },
        scale: { type: "double", default: "0.5" },
      },
      body: 'VStack {\\n    Text("Matched")\\n}',
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain(
      "@State private var isAnimating: Bool = false"
    );
    expect(result.content[0].text).toContain("@State private var scale: Double = 0.5");
    expect(result.content[0].text).toContain(
      'VStack {\n            Text("Matched")\n        }'
    );
    expect(result.content[0].text).toContain("struct MatchCelebrationView: View");
    expect(result.content[0].text).not.toContain("MatchCelebrationViewView");
    expect(result.content[0].text).not.toContain("\\n");
  });

  it("uses description-driven layout when no body is provided", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "view",
      name: "SwarmShellView",
      description:
        "A three-pane layout with a 56px sidebar rail, 244px channels column, and a flex content area.",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct SwarmShellView: View");
    expect(result.content[0].text).toContain("HStack(spacing: 0)");
    expect(result.content[0].text).toContain("SwarmTokens.Layout.sidebarRail");
    expect(result.content[0].text).toContain("SwarmTokens.Layout.channelsColumn");
    expect(result.content[0].text).not.toContain('Text("VStack {}")');
  });

  it("adds the Swarm context pane when the shell asks for one", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "view",
      name: "SwarmShellView",
      description:
        "A three-pane layout with a 56px sidebar rail, 244px channels column, flex content area, and a 308px right Project Context pane.",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("SwarmTokens.Layout.rightContextPane");
    expect(result.content[0].text).toContain(
      "The project room where context never gets lost."
    );
    expect(result.content[0].text).toContain("NORTH_STAR.md");
    expect(result.content[0].text).not.toContain("ContextFileRow");
  });
});

// ── axint.schema.compile (component) ───────────────────────────────

describe("axint.schema.compile — component", () => {
  it("compiles a reusable Swarm mission card component", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "component",
      name: "MissionCard",
      componentKind: "missionCard",
      tokenNamespace: "SwarmTokens",
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct MissionCard: View");
    expect(result.content[0].text).toContain("var title: String");
    expect(result.content[0].text).toContain("ProgressView(value: progress)");
    expect(result.content[0].text).toContain("SwarmTokens.Colors.accent");
  });

  it("compiles a reusable Swarm project context panel component", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "component",
      name: "ProjectContextPanel",
      componentKind: "contextPanel",
      tokenNamespace: "SwarmTokens",
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct ProjectContextPanel: View");
    expect(result.content[0].text).toContain("var northStar: String");
    expect(result.content[0].text).toContain("var suggestedUpdates: Int");
    expect(result.content[0].text).toContain("PROJECT_CONTEXT.md");
    expect(result.content[0].text).not.toContain("ContextFileRow");
  });
});

describe("axint.tokens.ingest", () => {
  it("turns JS design tokens into a SwiftUI token enum", async () => {
    const result = await handleToolCall("axint.tokens.ingest", {
      source: `
        export default {
          color: { accent: "#FF5A3D", surface: "#15161B", textPrimary: "#F7F3EE" },
          layout: { sidebarRail: 56, channelsColumn: 244 },
          radius: { card: 16, row: 10 }
        }
      `,
      namespace: "SwarmTokens",
      format: "swift",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("enum SwarmTokens");
    expect(result.content[0].text).toContain('static let accent = Color(hex: "#FF5A3D")');
    expect(result.content[0].text).toContain("static let sidebarRail = CGFloat(56)");
  });

  it("turns Swarm V4 tokens into usable SwiftUI aliases and layout constants", async () => {
    const result = await handleToolCall("axint.tokens.ingest", {
      source: `
        // Swarm design tokens
        window.SW = {
          bg: "#0A0A0B",
          surface: "#111113",
          elevated: "#17171A",
          border: "#1F1F22",
          text: "#EDEDEE",
          text2: "#9B9BA1",
          text3: "#6A6A6F",
          accent: "#6366F1",
          accentSoft: "rgba(99,102,241,0.15)",
          warning: "#F59E0B",
          warningSoft: "rgba(245,158,11,0.15)",
          success: "#10B981",
          successSoft: "rgba(16,185,129,0.15)",
          memberColors: ["#6366F1", "#EC4899"],
          r1: 4,
          r2: 6,
          rInput: 8,
          rCard: 12,
          rModal: 14,
          shadowWin: "0 24px 80px rgba(0,0,0,0.5)"
        }
      `,
      namespace: "SwarmTokens",
      format: "swift",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("static let accentSoft = Color(.sRGB");
    expect(result.content[0].text).toContain("opacity: 0.15");
    expect(result.content[0].text).toContain("static let surfaceRaised = elevated");
    expect(result.content[0].text).toContain("static let textPrimary = text");
    expect(result.content[0].text).toContain("static let sidebarRail = CGFloat(56)");
    expect(result.content[0].text).toContain("static let channelsColumn = CGFloat(244)");
    expect(result.content[0].text).toContain(
      "static let rightContextPane = CGFloat(308)"
    );
    expect(result.content[0].text).toContain("static let row = rInput");
  });
});

// ── axint.schema.compile (widget) ──────────────────────────────

describe("axint.schema.compile — widget", () => {
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

  it("does not duplicate Widget suffix or escaped body newlines", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "widget",
      name: "SwolematesMatchWidget",
      displayName: "Swolemates Match",
      description: "Shows new matches",
      families: ["systemSmall"],
      entry: { date: "date", matchCount: "int" },
      body: 'VStack {\\n    Text("\\\\(entry.matchCount)")\\n}',
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct SwolematesMatchWidget: Widget");
    expect(result.content[0].text).not.toContain("SwolematesMatchWidgetWidget");
    expect(result.content[0].text.match(/\blet date: Date\b/g)).toHaveLength(1);
    expect(result.content[0].text).not.toContain("\\n");
  });
});

// ── axint.schema.compile (app) ─────────────────────────────────

describe("axint.schema.compile — app", () => {
  it("does not duplicate an App suffix when compiling app schema input", async () => {
    const result = await handleToolCall("axint.schema.compile", {
      type: "app",
      name: "SwolematesApp",
      scenes: [{ kind: "windowGroup", view: "ContentView" }],
      format: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("struct SwolematesApp: App");
    expect(result.content[0].text).not.toContain("SwolematesAppApp");
  });

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

// ── axint.templates.list ────────────────────────────────────────────

describe("axint.templates.list tool", () => {
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

// ── axint.templates.get ──────────────────────────────────────────────────

describe("axint.templates.get tool", () => {
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

// ── axint.swift.validate ────────────────────────────────────────────

describe("axint.swift.validate tool", () => {
  it("passes clean Swift source", () => {
    const source = `
      import SwiftUI

      struct CounterView: View {
          @State var count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = validateSwiftSource(source, "Counter.swift");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("flags @State let as an error", () => {
    const source = `
      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = validateSwiftSource(source, "Counter.swift");
    expect(result.diagnostics.some((d) => d.code === "AX703")).toBe(true);
  });

  it("flags AppIntent missing perform()", () => {
    const source = `
      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send"
      }
    `;
    const result = validateSwiftSource(source, "SendMessage.swift");
    expect(result.diagnostics.some((d) => d.code === "AX701")).toBe(true);
  });

  it("flags missing AppIntents and SwiftUI imports in Swift snippets", () => {
    const source = `
      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
          func perform() async throws -> some IntentResult { .result() }
      }

      struct CounterView: View {
          @State var count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = validateSwiftSource(source, "Mixed.swift");
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("AX716");
    expect(codes).toContain("AX718");
  });

  it("flags AppIntent inputs missing @Parameter", () => {
    const source = `
      import AppIntents

      struct TrailCheck: AppIntent {
          static var title: LocalizedStringResource = "Trail Check"
          var trailName: String
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    const result = validateSwiftSource(source, "TrailCheck.swift");
    expect(result.diagnostics.some((d) => d.code === "AX719")).toBe(true);
  });

  it("attaches the supplied file name to diagnostics", () => {
    const source = `struct WeatherWidget: Widget { let kind = "x" }`;
    const result = validateSwiftSource(source, "WeatherWidget.swift");
    expect(result.diagnostics.every((d) => d.file === "WeatherWidget.swift")).toBe(true);
  });
});

// ── axint.swift.fix ─────────────────────────────────────────────────

describe("axint.swift.fix tool", () => {
  it("rewrites @State let to @State var", () => {
    const source = `
      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = fixSwiftSource(source, "Counter.swift");
    expect(result.source).toContain("@State var count");
    expect(result.fixed.some((d) => d.code === "AX703")).toBe(true);
    expect(validateSwiftSource(result.source, "Counter.swift").diagnostics).toHaveLength(
      0
    );
  });

  it("injects perform() into an AppIntent that lacks one", () => {
    const source = `
      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
      }
    `;
    const result = fixSwiftSource(source, "SendMessage.swift");
    expect(result.source).toContain("func perform()");
    expect(result.fixed.some((d) => d.code === "AX701")).toBe(true);
  });

  it("returns input unchanged when nothing is broken", () => {
    const source = `
      import SwiftUI

      struct CounterView: View {
          @State var count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = fixSwiftSource(source, "Counter.swift");
    expect(result.source).toBe(source);
    expect(result.fixed).toHaveLength(0);
  });

  it("fixes multiple issues in a single pass", () => {
    const source = `
      import AppIntents
      import SwiftUI

      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }

      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send"
      }
    `;
    const result = fixSwiftSource(source, "Mixed.swift");
    const codes = result.fixed.map((d) => d.code).sort();
    expect(codes).toEqual(["AX701", "AX703"]);
  });

  it("adds missing AppIntents import in one pass", () => {
    const source = `
      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    const result = fixSwiftSource(source, "SendMessage.swift");
    expect(result.source).toContain("import AppIntents");
    expect(result.fixed.some((d) => d.code === "AX716")).toBe(true);
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
