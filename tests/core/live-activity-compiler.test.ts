import { describe, expect, it } from "vitest";
import {
  compileLiveActivityFromIR,
  compileLiveActivitySource,
} from "../../src/core/compiler.js";
import { generateSwiftLiveActivity } from "../../src/core/live-activity-generator.js";
import { parseLiveActivitySource } from "../../src/core/live-activity-parser.js";
import {
  validateLiveActivity,
  validateSwiftLiveActivitySource,
} from "../../src/core/live-activity-validator.js";
import type { IRLiveActivity } from "../../src/core/types.js";

// ─── Fixtures ───────────────────────────────────────────────────────

const PIZZA: IRLiveActivity = {
  name: "PizzaDelivery",
  attributes: [
    {
      name: "orderNumber",
      type: { kind: "primitive", value: "string" },
    },
  ],
  contentState: [
    {
      name: "status",
      type: { kind: "primitive", value: "string" },
    },
    {
      name: "eta",
      type: { kind: "primitive", value: "date" },
    },
    {
      name: "progress",
      type: { kind: "primitive", value: "double" },
      defaultValue: 0,
    },
  ],
  lockScreen: [
    {
      kind: "text",
      content: "Pizza on the way",
    },
  ],
  dynamicIsland: {
    expanded: [{ kind: "text", content: "Pizza Delivery" }],
    compactLeading: [{ kind: "image", systemName: "bicycle" }],
    compactTrailing: [{ kind: "text", content: "5m" }],
    minimal: [{ kind: "image", systemName: "bicycle" }],
  },
  sourceFile: "<test>",
};

const PIZZA_SOURCE = `
import { activityState, defineLiveActivity, view } from "axint";

export default defineLiveActivity({
  name: "PizzaDelivery",
  attributes: {
    orderNumber: activityState.string("Order number"),
  },
  contentState: {
    status: activityState.string("Order status"),
    eta: activityState.date("ETA"),
    progress: activityState.double("Progress", { default: 0 }),
  },
  lockScreen: [
    view.text("Pizza on the way"),
  ],
  dynamicIsland: {
    expanded: [view.text("Pizza Delivery")],
    compactLeading: [view.image({ systemName: "bicycle" })],
    compactTrailing: [view.text("5m")],
    minimal: [view.image({ systemName: "bicycle" })],
  },
});
`;

// ─── Generator ──────────────────────────────────────────────────────

describe("generateSwiftLiveActivity", () => {
  it("emits ActivityAttributes, ContentState, Widget, and every dynamic island region", () => {
    const swift = generateSwiftLiveActivity(PIZZA);

    expect(swift).toContain("import ActivityKit");
    expect(swift).toContain("import SwiftUI");
    expect(swift).toContain("import WidgetKit");
    expect(swift).toContain("struct PizzaDeliveryAttributes: ActivityAttributes");
    expect(swift).toContain(
      "public struct ContentState: Codable, Hashable"
    );
    expect(swift).toContain("var status: String");
    expect(swift).toContain("var eta: Date");
    expect(swift).toContain("var progress: Double");
    expect(swift).toContain("let orderNumber: String");
    expect(swift).toContain("struct PizzaDeliveryLiveActivity: Widget");
    expect(swift).toContain(
      "ActivityConfiguration(for: PizzaDeliveryAttributes.self)"
    );
    expect(swift).toContain("DynamicIsland {");
    expect(swift).toContain("DynamicIslandExpandedRegion(.center)");
    expect(swift).toContain("compactLeading:");
    expect(swift).toContain("compactTrailing:");
    expect(swift).toContain("minimal:");
    expect(swift).toContain("#Preview");
  });

  it("emits the optional bottom region when provided", () => {
    const withBottom: IRLiveActivity = {
      ...PIZZA,
      dynamicIsland: {
        ...PIZZA.dynamicIsland,
        bottom: [{ kind: "text", content: "Tap to track" }],
      },
    };
    expect(generateSwiftLiveActivity(withBottom)).toContain(
      "DynamicIslandExpandedRegion(.bottom)"
    );
  });

  it("falls back to EmptyView for regions that somehow arrive empty", () => {
    // Validator blocks this in practice, but the generator must still be safe.
    const empty: IRLiveActivity = {
      ...PIZZA,
      dynamicIsland: {
        ...PIZZA.dynamicIsland,
        compactTrailing: [],
      },
    };
    const swift = generateSwiftLiveActivity(empty);
    expect(swift).toContain("EmptyView()");
  });
});

// ─── IR Validator ───────────────────────────────────────────────────

describe("validateLiveActivity", () => {
  it("accepts a well-formed activity", () => {
    expect(validateLiveActivity(PIZZA)).toEqual([]);
  });

  it("rejects a non-PascalCase name (AX770)", () => {
    const diags = validateLiveActivity({ ...PIZZA, name: "pizzaDelivery" });
    expect(diags.map((d) => d.code)).toContain("AX770");
  });

  it("rejects an empty contentState (AX771)", () => {
    const diags = validateLiveActivity({ ...PIZZA, contentState: [] });
    expect(diags.map((d) => d.code)).toContain("AX771");
  });

  it("rejects a Swift reserved keyword as a field name", () => {
    const diags = validateLiveActivity({
      ...PIZZA,
      attributes: [
        { name: "class", type: { kind: "primitive", value: "string" } },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX772");
  });

  it("rejects duplicate contentState field names", () => {
    const diags = validateLiveActivity({
      ...PIZZA,
      contentState: [
        { name: "status", type: { kind: "primitive", value: "string" } },
        { name: "status", type: { kind: "primitive", value: "string" } },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX773");
  });

  it("rejects an empty expanded region (AX774)", () => {
    const diags = validateLiveActivity({
      ...PIZZA,
      dynamicIsland: { ...PIZZA.dynamicIsland, expanded: [] },
    });
    expect(diags.map((d) => d.code)).toContain("AX774");
  });

  it("rejects an empty lockScreen (AX778)", () => {
    const diags = validateLiveActivity({ ...PIZZA, lockScreen: [] });
    expect(diags.map((d) => d.code)).toContain("AX778");
  });
});

describe("validateSwiftLiveActivitySource", () => {
  it("flags missing ActivityKit import (AX779)", () => {
    const diags = validateSwiftLiveActivitySource("import SwiftUI");
    expect(diags.map((d) => d.code)).toContain("AX779");
  });

  it("accepts Swift with the ActivityKit import", () => {
    expect(
      validateSwiftLiveActivitySource("import ActivityKit\nimport SwiftUI")
    ).toEqual([]);
  });
});

// ─── Parser + end-to-end compile ───────────────────────────────────

describe("parseLiveActivitySource", () => {
  it("parses a defineLiveActivity call into an IRLiveActivity", () => {
    const ir = parseLiveActivitySource(PIZZA_SOURCE, "pizza.ts");

    expect(ir.name).toBe("PizzaDelivery");
    expect(ir.attributes).toHaveLength(1);
    expect(ir.attributes[0].name).toBe("orderNumber");
    expect(ir.contentState.map((f) => f.name)).toEqual([
      "status",
      "eta",
      "progress",
    ]);
    expect(ir.contentState[2].defaultValue).toBe(0);
    expect(ir.dynamicIsland.compactLeading).toHaveLength(1);
    expect(ir.sourceFile).toBe("pizza.ts");
  });
});

describe("compileLiveActivitySource", () => {
  it("produces valid Swift for a well-formed source", () => {
    const result = compileLiveActivitySource(PIZZA_SOURCE, "pizza.ts");
    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.output?.swiftCode).toContain("struct PizzaDeliveryAttributes");
    expect(result.output?.outputPath).toMatch(/PizzaDeliveryLiveActivity\.swift$/);
  });

  it("reports IR validation errors before generation", () => {
    const result = compileLiveActivityFromIR({ ...PIZZA, contentState: [] });
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain("AX771");
  });
});
