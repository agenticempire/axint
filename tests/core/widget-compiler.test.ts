import { describe, it, expect } from "vitest";
import { compileWidgetSource } from "../../src/core/compiler.js";

const STEP_COUNTER_SOURCE = `
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
      view.text("\\(steps)"),
      view.text("of \\(goal) steps"),
    ], { spacing: 4 }),
  ],
  refreshInterval: 15,
});
`;

const WEATHER_WIDGET_SOURCE = `
import { defineWidget, entry, view } from "@axint/sdk";

export default defineWidget({
  name: "WeatherWidget",
  displayName: "Weather",
  description: "Current weather conditions",
  families: ["systemSmall", "systemMedium", "systemLarge"],
  entry: {
    temperature: entry.double("Temperature in Celsius"),
    condition: entry.string("Weather condition"),
    updatedAt: entry.date("Last update"),
  },
  body: [
    view.vstack([
      view.text("\\(temperature)°C"),
      view.text("\\(condition)"),
    ], { spacing: 8 }),
  ],
  refreshPolicy: "after",
  refreshInterval: 30,
});
`;

describe("Widget Compiler", () => {
  it("compiles a step counter widget successfully", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("struct StepCounterEntry: TimelineEntry");
    expect(result.output!.swiftCode).toContain(
      "struct StepCounterProvider: TimelineProvider"
    );
    expect(result.output!.swiftCode).toContain("struct StepCounterWidget: Widget");
    expect(result.output!.swiftCode).toContain("import WidgetKit");
    expect(result.output!.swiftCode).toContain("import SwiftUI");
    expect(result.output!.ir.name).toBe("StepCounter");
    expect(result.output!.ir.displayName).toBe("Step Counter");
  });

  it("includes entry fields in the TimelineEntry struct", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    const code = result.output!.swiftCode;
    expect(code).toContain("let steps: Int");
    expect(code).toContain("let goal: Int");
    expect(code).toContain("let lastUpdated: Date");
  });

  it("includes default values for entry fields", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    const code = result.output!.swiftCode;
    expect(code).toContain("let steps: Int = 0");
    expect(code).toContain("let goal: Int = 10000");
  });

  it("generates TimelineProvider with placeholder, getSnapshot, and getTimeline", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    const code = result.output!.swiftCode;
    expect(code).toContain("func placeholder(in context: Context)");
    expect(code).toContain("func getSnapshot(in context: Context, completion:");
    expect(code).toContain("func getTimeline(in context: Context, completion:");
  });

  it("supports multiple widget families", () => {
    const result = compileWidgetSource(WEATHER_WIDGET_SOURCE, "weather.ts");

    const code = result.output!.swiftCode;
    expect(code).toContain(".systemSmall");
    expect(code).toContain(".systemMedium");
    expect(code).toContain(".systemLarge");
    expect(code).toContain("supportedFamilies");
  });

  it("includes refresh policy in getTimeline", () => {
    const result = compileWidgetSource(WEATHER_WIDGET_SOURCE, "weather.ts");

    const code = result.output!.swiftCode;
    expect(code).toContain(".after");
  });

  it("generates valid Swift output path", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    expect(result.output!.outputPath).toBe("StepCounterWidget.swift");
  });

  it("rejects widgets without a name", () => {
    const source = STEP_COUNTER_SOURCE.replace('name: "StepCounter",', "");
    const result = compileWidgetSource(source, "bad.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX402")).toBe(true);
  });

  it("rejects widgets without displayName", () => {
    const source = STEP_COUNTER_SOURCE.replace('displayName: "Step Counter",', "");
    const result = compileWidgetSource(source, "bad.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX402")).toBe(true);
  });

  it("rejects widgets without families", () => {
    const source = STEP_COUNTER_SOURCE.replace(
      'families: ["systemSmall", "systemMedium"],',
      ""
    );
    const result = compileWidgetSource(source, "bad.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX402")).toBe(true);
  });

  it("rejects widgets without body", () => {
    const source = STEP_COUNTER_SOURCE.replace(
      'body: [view.vstack([view.text("\\\\(steps)")]), view.text("of \\\\(goal) steps")], { spacing: 4 }),],',
      ""
    )
      .replace("body: [", "")
      .replace("],", "");
    const result = compileWidgetSource(source, "bad.ts");

    expect(result.success).toBe(false);
  });

  it("rejects widgets with invalid family names", () => {
    const source = STEP_COUNTER_SOURCE.replace(
      'families: ["systemSmall", "systemMedium"]',
      'families: ["systemSmall", "invalidFamily"]'
    );
    const result = compileWidgetSource(source, "bad.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX411")).toBe(true);
  });

  it("rejects widgets with non-PascalCase names", () => {
    const source = STEP_COUNTER_SOURCE.replace(
      'name: "StepCounter"',
      'name: "stepCounter"'
    );
    const result = compileWidgetSource(source, "bad.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX410")).toBe(true);
  });

  it("rejects widgets with duplicate entry field names", () => {
    const source = STEP_COUNTER_SOURCE.replace("goal: entry.int(", "steps: entry.int(");
    const result = compileWidgetSource(source, "bad.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX414")).toBe(true);
  });

  it("validates Swift widget source output", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    expect(result.output!.swiftCode).toContain("import WidgetKit");
    expect(result.output!.swiftCode).toContain(": Widget");
    expect(result.output!.swiftCode).toContain(": TimelineProvider");
  });

  it("includes widget displayName in configuration", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    expect(result.output!.swiftCode).toContain(".configurationDisplayName");
    expect(result.output!.swiftCode).toContain("Step Counter");
  });

  it("includes widget description in configuration", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    expect(result.output!.swiftCode).toContain(".description");
    expect(result.output!.swiftCode).toContain("Shows your daily step count");
  });

  it("generates preview block", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");

    expect(result.output!.swiftCode).toContain("#Preview");
    expect(result.output!.swiftCode).toContain(".systemSmall");
  });

  it("parses entry fields with various types", () => {
    const result = compileWidgetSource(WEATHER_WIDGET_SOURCE, "weather.ts");

    expect(result.output!.ir.entry).toHaveLength(3);
    expect(result.output!.ir.entry[0].name).toBe("temperature");
    expect(result.output!.ir.entry[1].name).toBe("condition");
    expect(result.output!.ir.entry[2].name).toBe("updatedAt");
  });

  it("preserves widget families in IR", () => {
    const result = compileWidgetSource(WEATHER_WIDGET_SOURCE, "weather.ts");

    expect(result.output!.ir.families).toContain("systemSmall");
    expect(result.output!.ir.families).toContain("systemMedium");
    expect(result.output!.ir.families).toContain("systemLarge");
  });

  it("preserves refresh policy and interval in IR", () => {
    const result = compileWidgetSource(WEATHER_WIDGET_SOURCE, "weather.ts");

    expect(result.output!.ir.refreshPolicy).toBe("after");
    expect(result.output!.ir.refreshInterval).toBe(30);
  });

  it("snapshot: step counter full pipeline output", () => {
    const result = compileWidgetSource(STEP_COUNTER_SOURCE, "step-counter.ts");
    expect(result.output!.swiftCode).toMatchSnapshot();
  });
});
