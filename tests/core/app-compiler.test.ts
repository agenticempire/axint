import { describe, it, expect } from "vitest";
import { compileAppSource, compileAppFromIR } from "../../src/core/compiler.js";
import { parseAppSource } from "../../src/core/app-parser.js";
import { generateSwiftApp } from "../../src/core/app-generator.js";
import { validateApp } from "../../src/core/app-validator.js";
import type { IRApp } from "../../src/core/types.js";

// ─── Fixtures ───────────────────────────────────────────────────────

const SIMPLE_APP: IRApp = {
  name: "MyApp",
  scenes: [{ sceneKind: "windowGroup", rootView: "ContentView", isDefault: true }],
  sourceFile: "<test>",
};

const MULTI_SCENE_APP: IRApp = {
  name: "Dashboard",
  scenes: [
    {
      sceneKind: "windowGroup",
      rootView: "MainView",
      isDefault: true,
      title: "Dashboard",
    },
    { sceneKind: "settings", rootView: "SettingsView", platformGuard: "macOS" },
  ],
  sourceFile: "<test>",
};

const APP_WITH_STORAGE: IRApp = {
  name: "Notes",
  scenes: [{ sceneKind: "windowGroup", rootView: "NoteListView", isDefault: true }],
  appStorage: [
    {
      name: "fontSize",
      key: "font_size",
      type: { kind: "primitive", value: "int" },
      defaultValue: 14,
    },
    {
      name: "isDarkMode",
      key: "dark_mode",
      type: { kind: "primitive", value: "boolean" },
      defaultValue: false,
    },
  ],
  sourceFile: "<test>",
};

const MULTI_WINDOW_APP: IRApp = {
  name: "Editor",
  scenes: [
    {
      sceneKind: "windowGroup",
      rootView: "EditorView",
      isDefault: true,
      title: "Editor",
    },
    {
      sceneKind: "window",
      rootView: "InspectorView",
      name: "inspector",
      title: "Inspector",
    },
    { sceneKind: "settings", rootView: "PreferencesView", platformGuard: "macOS" },
  ],
  sourceFile: "<test>",
};

// ─── Generator Tests ────────────────────────────────────────────────

describe("generateSwiftApp", () => {
  it("generates @main attribute", () => {
    const swift = generateSwiftApp(SIMPLE_APP);
    expect(swift).toContain("@main");
  });

  it("generates App conformance", () => {
    const swift = generateSwiftApp(SIMPLE_APP);
    expect(swift).toContain("struct MyAppApp: App {");
  });

  it("generates var body: some Scene", () => {
    const swift = generateSwiftApp(SIMPLE_APP);
    expect(swift).toContain("var body: some Scene {");
  });

  it("generates WindowGroup with root view", () => {
    const swift = generateSwiftApp(SIMPLE_APP);
    expect(swift).toContain("WindowGroup {");
    expect(swift).toContain("ContentView()");
  });

  it("generates titled WindowGroup", () => {
    const swift = generateSwiftApp(MULTI_SCENE_APP);
    expect(swift).toContain('WindowGroup("Dashboard")');
  });

  it("generates Settings with macOS guard", () => {
    const swift = generateSwiftApp(MULTI_SCENE_APP);
    expect(swift).toContain("#if os(macOS)");
    expect(swift).toContain("Settings {");
    expect(swift).toContain("SettingsView()");
    expect(swift).toContain("#endif");
  });

  it("generates @AppStorage properties", () => {
    const swift = generateSwiftApp(APP_WITH_STORAGE);
    expect(swift).toContain('@AppStorage("font_size") private var fontSize: Int = 14');
    expect(swift).toContain(
      '@AppStorage("dark_mode") private var isDarkMode: Bool = false'
    );
  });

  it("generates named Window scene", () => {
    const swift = generateSwiftApp(MULTI_WINDOW_APP);
    expect(swift).toContain('Window("Inspector", id: "inspector")');
    expect(swift).toContain("InspectorView()");
  });

  it("includes import SwiftUI", () => {
    const swift = generateSwiftApp(SIMPLE_APP);
    expect(swift).toContain("import SwiftUI");
  });

  it("includes file header comment", () => {
    const swift = generateSwiftApp(SIMPLE_APP);
    expect(swift).toContain("// MyAppApp.swift");
    expect(swift).toContain("Axint compiler output");
  });
});

// ─── Validator Tests ────────────────────────────────────────────────

describe("validateApp", () => {
  it("passes valid simple app", () => {
    const diagnostics = validateApp(SIMPLE_APP);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("AX510: rejects non-PascalCase name", () => {
    const app: IRApp = { ...SIMPLE_APP, name: "myApp" };
    const diagnostics = validateApp(app);
    expect(diagnostics.some((d) => d.code === "AX510")).toBe(true);
  });

  it("AX511: rejects app with no scenes", () => {
    const app: IRApp = { ...SIMPLE_APP, scenes: [] };
    const diagnostics = validateApp(app);
    expect(diagnostics.some((d) => d.code === "AX511")).toBe(true);
  });

  it("AX512: rejects duplicate scene names", () => {
    const app: IRApp = {
      ...SIMPLE_APP,
      scenes: [
        { sceneKind: "windowGroup", rootView: "ViewA", name: "main" },
        { sceneKind: "windowGroup", rootView: "ViewB", name: "main" },
      ],
    };
    const diagnostics = validateApp(app);
    expect(diagnostics.some((d) => d.code === "AX512")).toBe(true);
  });

  it("AX514: info for unguarded settings scene", () => {
    const app: IRApp = {
      ...SIMPLE_APP,
      scenes: [
        { sceneKind: "windowGroup", rootView: "ContentView", isDefault: true },
        { sceneKind: "settings", rootView: "SettingsView" },
      ],
    };
    const diagnostics = validateApp(app);
    expect(diagnostics.some((d) => d.code === "AX514")).toBe(true);
  });

  it("AX515: warns on multiple unnamed window groups", () => {
    const app: IRApp = {
      ...SIMPLE_APP,
      scenes: [
        { sceneKind: "windowGroup", rootView: "ViewA" },
        { sceneKind: "windowGroup", rootView: "ViewB" },
      ],
    };
    const diagnostics = validateApp(app);
    expect(diagnostics.some((d) => d.code === "AX515")).toBe(true);
  });
});

// ─── Parser Tests ───────────────────────────────────────────────────

describe("parseAppSource", () => {
  it("parses a simple defineApp() call", () => {
    const source = `
      import { defineApp, scene } from "@axint/compiler";
      export default defineApp({
        name: "MyApp",
        scenes: [
          { kind: "windowGroup", view: "ContentView" },
        ],
      });
    `;
    const ir = parseAppSource(source);
    expect(ir.name).toBe("MyApp");
    expect(ir.scenes).toHaveLength(1);
    expect(ir.scenes[0].sceneKind).toBe("windowGroup");
    expect(ir.scenes[0].rootView).toBe("ContentView");
  });

  it("parses multi-scene app", () => {
    const source = `
      import { defineApp, scene } from "@axint/compiler";
      export default defineApp({
        name: "Dashboard",
        scenes: [
          { kind: "windowGroup", view: "MainView", title: "Dashboard" },
          { kind: "settings", view: "SettingsView", platform: "macOS" },
        ],
      });
    `;
    const ir = parseAppSource(source);
    expect(ir.name).toBe("Dashboard");
    expect(ir.scenes).toHaveLength(2);
    expect(ir.scenes[1].sceneKind).toBe("settings");
    expect(ir.scenes[1].platformGuard).toBe("macOS");
  });

  it("parses scene.* helpers in the scenes array", () => {
    const source = `
      import { defineApp, scene } from "@axint/compiler";
      export default defineApp({
        name: "WeatherApp",
        scenes: [
          scene.windowGroup("WeatherDashboard"),
          scene.settings("SettingsView", { platform: "macOS", title: "Settings" }),
        ],
      });
    `;
    const ir = parseAppSource(source);
    expect(ir.name).toBe("WeatherApp");
    expect(ir.scenes).toHaveLength(2);
    expect(ir.scenes[0].sceneKind).toBe("windowGroup");
    expect(ir.scenes[0].rootView).toBe("WeatherDashboard");
    expect(ir.scenes[1].sceneKind).toBe("settings");
    expect(ir.scenes[1].platformGuard).toBe("macOS");
    expect(ir.scenes[1].title).toBe("Settings");
  });

  it("throws AX501 for missing defineApp", () => {
    expect(() => parseAppSource("const x = 1;")).toThrow(/No defineApp\(\) call found/);
  });

  it("throws AX502 for missing name", () => {
    const source = `
      import { defineApp } from "@axint/compiler";
      export default defineApp({
        scenes: [{ kind: "windowGroup", view: "ContentView" }],
      });
    `;
    expect(() => parseAppSource(source)).toThrow(/requires a `name` property/);
  });

  it("throws AX503 for missing scenes", () => {
    const source = `
      import { defineApp } from "@axint/compiler";
      export default defineApp({ name: "MyApp" });
    `;
    expect(() => parseAppSource(source)).toThrow(/requires a `scenes` array/);
  });
});

// ─── Compiler Integration Tests ─────────────────────────────────────

describe("compileAppFromIR", () => {
  it("compiles a valid simple app", () => {
    const result = compileAppFromIR(SIMPLE_APP);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("@main");
    expect(result.output!.swiftCode).toContain("struct MyAppApp: App");
    expect(result.output!.outputPath).toBe("MyAppApp.swift");
  });

  it("compiles multi-scene app with platform guards", () => {
    const result = compileAppFromIR(MULTI_SCENE_APP);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("#if os(macOS)");
    expect(result.output!.swiftCode).toContain("Settings {");
  });

  it("compiles app with @AppStorage", () => {
    const result = compileAppFromIR(APP_WITH_STORAGE);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("@AppStorage");
  });

  it("rejects invalid app name", () => {
    const result = compileAppFromIR({ ...SIMPLE_APP, name: "bad-name" });
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX510")).toBe(true);
  });

  it("respects outDir option", () => {
    const result = compileAppFromIR(SIMPLE_APP, { outDir: "ios/App" });
    expect(result.output!.outputPath).toBe("ios/App/MyAppApp.swift");
  });
});

describe("compileAppSource", () => {
  it("compiles TypeScript source end-to-end", () => {
    const source = `
      import { defineApp, scene } from "@axint/compiler";
      export default defineApp({
        name: "TodoApp",
        scenes: [
          { kind: "windowGroup", view: "TodoListView" },
        ],
      });
    `;
    const result = compileAppSource(source);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("struct TodoAppApp: App");
    expect(result.output!.swiftCode).toContain("TodoListView()");
  });

  it("compiles helper-based scenes end-to-end", () => {
    const source = `
      import { defineApp, scene } from "@axint/compiler";
      export default defineApp({
        name: "WeatherApp",
        scenes: [
          scene.windowGroup("WeatherDashboard"),
          scene.settings("SettingsView", { platform: "macOS" }),
        ],
      });
    `;
    const result = compileAppSource(source);
    expect(result.success).toBe(true);
    expect(result.output!.swiftCode).toContain("WeatherDashboard()");
    expect(result.output!.swiftCode).toContain("SettingsView()");
    expect(result.output!.swiftCode).toContain("#if os(macOS)");
  });

  it("returns parser errors as diagnostics", () => {
    const result = compileAppSource("const x = 1;");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("AX501");
  });
});
