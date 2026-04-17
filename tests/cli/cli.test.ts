/**
 * Conformance suite for the `axint compile` multi-surface dispatcher.
 *
 * Each Apple surface (intent, view, widget, app) must round-trip
 * through `compileAnySource` without the caller having to pick the
 * right parser. If any of these tests regress, the CLI stops being a
 * single entry point and new users hit the onboarding break that
 * action 04 of the 2026-04-17 sprint was written to fix.
 */

import { describe, it, expect } from "vitest";

import { compileAnySource } from "../../src/core/compiler.js";
import { detectSurface } from "../../src/core/surface.js";

const INTENT_SOURCE = `
import { defineIntent, param } from "@axint/sdk";

export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Sends a message to a contact",
  params: {
    recipient: param.string("Who to message"),
    body: param.string("Message content"),
  },
  perform: async ({ recipient, body }) => {
    return { sent: true };
  },
});
`;

const VIEW_SOURCE = `
import { defineView, prop, state, view } from "@axint/sdk";

export default defineView({
  name: "Greeting",
  props: {
    username: prop.string("User's display name"),
  },
  state: {
    tapCount: state.int("Number of taps", { default: 0 }),
  },
  body: [
    view.vstack([
      view.text("Hello, \\\\(username)!"),
      view.button("Tap me", "tapCount += 1"),
    ], { spacing: 16 }),
  ],
});
`;

const WIDGET_SOURCE = `
import { defineWidget, entry, view } from "@axint/sdk";

export default defineWidget({
  name: "StepCounter",
  displayName: "Step Counter",
  description: "Shows your daily step count",
  families: ["systemSmall", "systemMedium"],
  entry: {
    steps: entry.int("Current step count", { default: 0 }),
    goal: entry.int("Daily goal", { default: 10000 }),
    lastUpdated: entry.date("Last sync time"),
  },
  body: [
    view.vstack([
      view.text("\\\\(steps)"),
      view.text("of \\\\(goal) steps"),
    ], { spacing: 4 }),
  ],
  refreshInterval: 15,
});
`;

const APP_SOURCE = `
import { defineApp } from "@axint/sdk";

export default defineApp({
  name: "MyApp",
  scenes: [
    { kind: "windowGroup", view: "ContentView" },
  ],
});
`;

describe("detectSurface", () => {
  it("recognizes defineIntent", () => {
    expect(detectSurface(INTENT_SOURCE)).toBe("intent");
  });

  it("recognizes defineView", () => {
    expect(detectSurface(VIEW_SOURCE)).toBe("view");
  });

  it("recognizes defineWidget", () => {
    expect(detectSurface(WIDGET_SOURCE)).toBe("widget");
  });

  it("recognizes defineApp", () => {
    expect(detectSurface(APP_SOURCE)).toBe("app");
  });

  it("returns null when no define call is present", () => {
    expect(detectSurface("const x = 42;")).toBeNull();
  });
});

describe("compileAnySource dispatches by surface", () => {
  it("compiles an intent into an AppIntent struct", () => {
    const result = compileAnySource(INTENT_SOURCE, "send-message.ts");

    expect(result.surface).toBe("intent");
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("struct SendMessageIntent: AppIntent");
    expect(result.output!.outputPath).toBe("SendMessageIntent.swift");
  });

  it("compiles a view into a SwiftUI View struct", () => {
    const result = compileAnySource(VIEW_SOURCE, "greeting.ts");

    expect(result.surface).toBe("view");
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("import SwiftUI");
    expect(result.output!.swiftCode).toContain("struct Greeting: View");
    expect(result.output!.outputPath).toBe("Greeting.swift");
  });

  it("compiles a widget into a TimelineProvider + Widget pair", () => {
    const result = compileAnySource(WIDGET_SOURCE, "step-counter.ts");

    expect(result.surface).toBe("widget");
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("struct StepCounterEntry: TimelineEntry");
    expect(result.output!.swiftCode).toContain(
      "struct StepCounterProvider: TimelineProvider"
    );
    expect(result.output!.outputPath).toBe("StepCounterWidget.swift");
  });

  it("compiles an app into a SwiftUI @main App", () => {
    const result = compileAnySource(APP_SOURCE, "my-app.ts");

    expect(result.surface).toBe("app");
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("@main");
    expect(result.output!.swiftCode).toContain("struct MyAppApp: App");
    expect(result.output!.outputPath).toBe("MyAppApp.swift");
  });

  it("returns AX001 when the source defines no surface", () => {
    const result = compileAnySource("const x = 42;", "bad.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX001")).toBe(true);
  });

  it("respects outDir for every surface", () => {
    const intent = compileAnySource(INTENT_SOURCE, "i.ts", { outDir: "Generated" });
    const view = compileAnySource(VIEW_SOURCE, "v.ts", { outDir: "Generated" });
    const widget = compileAnySource(WIDGET_SOURCE, "w.ts", { outDir: "Generated" });
    const app = compileAnySource(APP_SOURCE, "a.ts", { outDir: "Generated" });

    expect(intent.output!.outputPath).toBe("Generated/SendMessageIntent.swift");
    expect(view.output!.outputPath).toBe("Generated/Greeting.swift");
    expect(widget.output!.outputPath).toBe("Generated/StepCounterWidget.swift");
    expect(app.output!.outputPath).toBe("Generated/MyAppApp.swift");
  });
});
