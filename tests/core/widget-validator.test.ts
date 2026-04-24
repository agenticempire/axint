import { describe, it, expect } from "vitest";
import { compileWidgetFromIR, compileWidgetSource } from "../../src/core/compiler.js";
import type { IRWidget } from "../../src/core/types.js";

describe("widget validator: naming", () => {
  it("accepts PascalCase widget names", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "StepCounter",
        displayName: "Steps",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX410")).toBe(false);
  });

  it("rejects lowercase widget names", () => {
    const ir: IRWidget = {
      name: "stepcounter",
      displayName: "Steps",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX410")).toBe(true);
  });

  it("rejects snake_case widget names", () => {
    const ir: IRWidget = {
      name: "step_counter",
      displayName: "Steps",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX410")).toBe(true);
  });

  it("rejects kebab-case widget names", () => {
    const ir: IRWidget = {
      name: "step-counter",
      displayName: "Steps",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX410")).toBe(true);
  });

  it("suggests PascalCase conversion in diagnostic", () => {
    const ir: IRWidget = {
      name: "mywidget",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    const diag = result.diagnostics.find((d) => d.code === "AX410");
    expect(diag?.suggestion).toBeDefined();
    expect(diag?.suggestion).toContain("Widget");
  });
});

describe("widget validator: families", () => {
  it("accepts widgets with one family", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "SingleFamily",
        displayName: "Widget",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX411")).toBe(false);
  });

  it("accepts widgets with multiple families", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "MultiFamily",
        displayName: "Widget",
        families: ["systemSmall", "systemMedium", "systemLarge"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX411")).toBe(false);
  });

  it("rejects widgets with empty families array", () => {
    const ir: IRWidget = {
      name: "NoFamilies",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: [],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX411")).toBe(true);
  });

  it("rejects widgets with undefined families", () => {
    const ir: IRWidget = {
      name: "UndefinedFamilies",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: undefined as unknown,
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX411")).toBe(true);
  });
});

describe("widget validator: body", () => {
  it("accepts widgets with non-empty body", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "WithBody",
        displayName: "Widget",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX412")).toBe(false);
  });

  it("rejects widgets with empty body array", () => {
    const ir: IRWidget = {
      name: "EmptyBody",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX412")).toBe(true);
  });

  it("rejects widgets with undefined body", () => {
    const ir: IRWidget = {
      name: "UndefinedBody",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: undefined as unknown,
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX412")).toBe(true);
  });

  it("accepts widgets with multiple body elements", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "MultiBodies",
        displayName: "Widget",
        families: ["systemSmall"],
        entry: {},
        body: [
          view.text("title"),
          view.text("subtitle"),
          view.text("content"),
        ],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX412")).toBe(false);
  });
});

describe("widget generator: TimelineEntry date ownership", () => {
  it("does not duplicate the generated date field when date is passed as an entry", () => {
    const ir: IRWidget = {
      name: "LogWaterIntake",
      displayName: "Water",
      description: "Shows daily hydration",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [
        { name: "date", type: { kind: "primitive", value: "date" } },
        { name: "ounces", type: { kind: "primitive", value: "double" } },
      ],
      body: [{ kind: "text", content: "Water" }],
      refreshPolicy: "atEnd",
    };

    const result = compileWidgetFromIR(ir);
    expect(result.success).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "AX416")).toBe(true);
    expect(result.output!.swiftCode.match(/\blet date: Date\b/g)).toHaveLength(1);
    expect(result.output!.swiftCode).not.toContain("date: Date(), date:");
  });
});

describe("widget validator: entry fields", () => {
  it("accepts valid Swift identifier entry names", () => {
    const src = `
      import { defineWidget, entry, view } from "@axint/sdk";
      export default defineWidget({
        name: "Valid",
        displayName: "Widget",
        families: ["systemSmall"],
        entry: {
          steps: entry.int("Steps"),
          _private: entry.string("Private"),
          count123: entry.int("Count"),
        },
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.filter((d) => d.code === "AX413")).toHaveLength(0);
  });

  it("rejects entry names starting with numbers", () => {
    const ir: IRWidget = {
      name: "Invalid",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [{ name: "123steps", type: { kind: "primitive", value: "int" } }],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX413")).toBe(true);
  });

  it("rejects entry names that are Swift keywords", () => {
    const ir: IRWidget = {
      name: "Invalid",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [{ name: "var", type: { kind: "primitive", value: "int" } }],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX413")).toBe(true);
  });

  it("rejects all common Swift keywords", () => {
    const keywords = [
      "func",
      "class",
      "struct",
      "enum",
      "protocol",
      "extension",
      "init",
      "self",
      "if",
      "else",
      "for",
      "while",
      "switch",
      "case",
      "break",
      "continue",
      "return",
    ];

    for (const keyword of keywords) {
      const ir: IRWidget = {
        name: "Invalid",
        displayName: "Widget",
        sourceFile: "test.ts",
        families: ["systemSmall"],
        entry: [{ name: keyword, type: { kind: "primitive", value: "int" } }],
        body: [{ kind: "text", value: "content" }],
      };
      const result = compileWidgetFromIR(ir);
      expect(
        result.diagnostics.some((d) => d.code === "AX413"),
        `Expected error for keyword: ${keyword}`
      ).toBe(true);
    }
  });

  it("detects duplicate entry field names", () => {
    const ir: IRWidget = {
      name: "Duplicate",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [
        { name: "steps", type: { kind: "primitive", value: "int" } },
        { name: "steps", type: { kind: "primitive", value: "int" } },
      ],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.filter((d) => d.code === "AX414")).toHaveLength(1);
  });

  it("detects multiple duplicate entry field names", () => {
    const ir: IRWidget = {
      name: "Duplicate",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [
        { name: "steps", type: { kind: "primitive", value: "int" } },
        { name: "steps", type: { kind: "primitive", value: "int" } },
        { name: "steps", type: { kind: "primitive", value: "int" } },
      ],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(
      result.diagnostics.filter((d) => d.code === "AX414").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("accepts empty entry array", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "NoEntry",
        displayName: "Widget",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(
      result.diagnostics.filter((d) => d.code === "AX413" || d.code === "AX414")
    ).toHaveLength(0);
  });
});

describe("widget validator: displayName", () => {
  it("accepts non-empty displayName", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "Widget",
        displayName: "My Widget",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX415")).toBe(false);
  });

  it("rejects empty displayName string", () => {
    const ir: IRWidget = {
      name: "Widget",
      displayName: "",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX415")).toBe(true);
  });

  it("rejects displayName with only whitespace", () => {
    const ir: IRWidget = {
      name: "Widget",
      displayName: "   ",
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX415")).toBe(true);
  });

  it("rejects undefined displayName", () => {
    const ir: IRWidget = {
      name: "Widget",
      displayName: undefined as unknown,
      sourceFile: "test.ts",
      families: ["systemSmall"],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX415")).toBe(true);
  });
});

describe("widget validator: generated Swift source", () => {
  it("validates generated code includes WidgetKit import", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "MyWidget",
        displayName: "My Widget",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.output?.swiftCode).toContain("import WidgetKit");
  });

  it("validates generated code includes Widget protocol conformance", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "MyWidget",
        displayName: "My Widget",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.output?.swiftCode).toContain(": Widget");
  });

  it("validates generated code includes TimelineProvider protocol conformance", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "MyWidget",
        displayName: "My Widget",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.output?.swiftCode).toContain(": TimelineProvider");
  });
});

describe("widget validator: error collection", () => {
  it("collects multiple validation errors", () => {
    const ir: IRWidget = {
      name: "bad_name",
      displayName: "",
      sourceFile: "test.ts",
      families: [],
      entry: [
        { name: "123invalid", type: { kind: "primitive", value: "int" } },
        { name: "valid", type: { kind: "primitive", value: "int" } },
      ],
      body: [],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.diagnostics.length).toBeGreaterThan(3);
    expect(result.diagnostics.some((d) => d.code === "AX410")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "AX411")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "AX412")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "AX413")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "AX415")).toBe(true);
  });

  it("returns success: false when errors exist", () => {
    const ir: IRWidget = {
      name: "bad",
      displayName: "",
      sourceFile: "test.ts",
      families: [],
      entry: [],
      body: [],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.success).toBe(false);
  });

  it("halts compilation when validation errors exist", () => {
    const ir: IRWidget = {
      name: "bad_name",
      displayName: "Widget",
      sourceFile: "test.ts",
      families: [],
      entry: [],
      body: [{ kind: "text", value: "content" }],
    };
    const result = compileWidgetFromIR(ir);
    expect(result.output).toBeUndefined();
  });
});

describe("widget validator: edge cases", () => {
  it("handles widget with all valid fields", () => {
    const src = `
      import { defineWidget, entry, view } from "@axint/sdk";
      export default defineWidget({
        name: "CompleteWidget",
        displayName: "Complete Widget",
        description: "A complete widget",
        families: ["systemSmall", "systemMedium"],
        entry: {
          value1: entry.string("Value 1"),
          value2: entry.int("Value 2", { default: 0 }),
        },
        body: [
          view.vstack([
            view.text("title"),
            view.text("content"),
          ]),
        ],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.success).toBe(true);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("accepts widgets with numbers in names after first character", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "Widget123",
        displayName: "Widget 123",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX410")).toBe(false);
  });

  it("accepts very long but valid displayName", () => {
    const src = `
      import { defineWidget, view } from "@axint/sdk";
      export default defineWidget({
        name: "Widget",
        displayName: "This is a very long display name that is still valid and has meaningful content",
        families: ["systemSmall"],
        entry: {},
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX415")).toBe(false);
  });

  it("handles special characters in entry type names", () => {
    const src = `
      import { defineWidget, entry, view } from "@axint/sdk";
      export default defineWidget({
        name: "SpecialWidget",
        displayName: "Special",
        families: ["systemSmall"],
        entry: {
          item: entry.string("Item"),
          count: entry.int("Count"),
        },
        body: [view.text("content")],
      });
    `;
    const result = compileWidgetSource(src);
    expect(result.diagnostics.filter((d) => d.code === "AX413")).toHaveLength(0);
  });
});
