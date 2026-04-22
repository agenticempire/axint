import { describe, expect, it } from "vitest";
import { compileAppEnumFromIR, compileAppEnumSource } from "../../src/core/compiler.js";
import { generateSwiftAppEnum } from "../../src/core/app-enum-generator.js";
import { parseAppEnumSource } from "../../src/core/app-enum-parser.js";
import {
  validateAppEnum,
  validateSwiftAppEnumSource,
} from "../../src/core/app-enum-validator.js";
import type { IRAppEnum } from "../../src/core/types.js";

// ─── Fixtures ───────────────────────────────────────────────────────

const PIZZA_SIZE: IRAppEnum = {
  name: "PizzaSize",
  title: "Pizza Size",
  cases: [
    { value: "small", title: "Small", image: "circle" },
    { value: "medium", title: "Medium", image: "circle.fill" },
    { value: "large", title: "Large", image: "largecircle.fill.circle" },
  ],
  sourceFile: "<test>",
};

const PIZZA_SIZE_SOURCE = `
import { defineAppEnum } from "@axint/compiler";

export default defineAppEnum({
  name: "PizzaSize",
  title: "Pizza Size",
  cases: [
    { value: "small", title: "Small", image: "circle" },
    { value: "medium", title: "Medium", image: "circle.fill" },
    { value: "large", title: "Large", image: "largecircle.fill.circle" },
  ],
});
`;

// ─── Generator ──────────────────────────────────────────────────────

describe("generateSwiftAppEnum", () => {
  it("emits AppIntents import, String-backed AppEnum, and display reps", () => {
    const swift = generateSwiftAppEnum(PIZZA_SIZE);

    expect(swift).toContain("import AppIntents");
    expect(swift).toContain("enum PizzaSize: String, AppEnum {");
    expect(swift).toContain("case small");
    expect(swift).toContain("case medium");
    expect(swift).toContain("case large");
    expect(swift).toContain(
      'static var typeDisplayRepresentation: TypeDisplayRepresentation = "Pizza Size"'
    );
    expect(swift).toContain(
      "static var caseDisplayRepresentations: [PizzaSize: DisplayRepresentation] = ["
    );
    expect(swift).toContain(
      '.small: DisplayRepresentation(title: "Small", image: .init(systemName: "circle"))'
    );
  });

  it("uses a plain string DisplayRepresentation when a case has no image", () => {
    const plain: IRAppEnum = {
      ...PIZZA_SIZE,
      cases: [{ value: "small", title: "Small" }],
    };
    const swift = generateSwiftAppEnum(plain);
    expect(swift).toContain('.small: "Small"');
    expect(swift).not.toContain("systemName");
  });

  it("escapes double quotes in titles", () => {
    const tricky: IRAppEnum = {
      ...PIZZA_SIZE,
      title: 'Size "XL"',
      cases: [{ value: "xl", title: 'Extra "Large"' }],
    };
    const swift = generateSwiftAppEnum(tricky);
    expect(swift).toContain('"Size \\"XL\\""');
    expect(swift).toContain('"Extra \\"Large\\""');
  });
});

// ─── IR Validator ───────────────────────────────────────────────────

describe("validateAppEnum", () => {
  it("accepts a well-formed enum", () => {
    expect(validateAppEnum(PIZZA_SIZE)).toEqual([]);
  });

  it("rejects a non-PascalCase name (AX790)", () => {
    const diags = validateAppEnum({ ...PIZZA_SIZE, name: "pizzaSize" });
    expect(diags.map((d) => d.code)).toContain("AX790");
  });

  it("rejects an empty cases list (AX791)", () => {
    const diags = validateAppEnum({ ...PIZZA_SIZE, cases: [] });
    expect(diags.map((d) => d.code)).toContain("AX791");
  });

  it("rejects a case value that isn't a valid Swift identifier (AX792)", () => {
    const diags = validateAppEnum({
      ...PIZZA_SIZE,
      cases: [{ value: "1small", title: "Small" }],
    });
    expect(diags.map((d) => d.code)).toContain("AX792");
  });

  it("rejects a case value that collides with a Swift keyword (AX792)", () => {
    const diags = validateAppEnum({
      ...PIZZA_SIZE,
      cases: [{ value: "class", title: "Class" }],
    });
    expect(diags.map((d) => d.code)).toContain("AX792");
  });

  it("rejects duplicate case values (AX793)", () => {
    const diags = validateAppEnum({
      ...PIZZA_SIZE,
      cases: [
        { value: "small", title: "Small" },
        { value: "small", title: "Small Again" },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX793");
  });

  it("rejects an empty case title (AX794)", () => {
    const diags = validateAppEnum({
      ...PIZZA_SIZE,
      cases: [{ value: "small", title: "   " }],
    });
    expect(diags.map((d) => d.code)).toContain("AX794");
  });
});

describe("validateSwiftAppEnumSource", () => {
  it("flags missing AppIntents import (AX795)", () => {
    const diags = validateSwiftAppEnumSource("enum PizzaSize: String, AppEnum {}");
    expect(diags.map((d) => d.code)).toContain("AX795");
  });

  it("flags missing String, AppEnum conformance (AX796)", () => {
    const diags = validateSwiftAppEnumSource("import AppIntents\nenum PizzaSize {}");
    expect(diags.map((d) => d.code)).toContain("AX796");
  });

  it("accepts Swift with both import and conformance", () => {
    expect(
      validateSwiftAppEnumSource("import AppIntents\nenum PizzaSize: String, AppEnum {}")
    ).toEqual([]);
  });
});

// ─── Parser + end-to-end compile ───────────────────────────────────

describe("parseAppEnumSource", () => {
  it("parses a defineAppEnum call into an IRAppEnum", () => {
    const ir = parseAppEnumSource(PIZZA_SIZE_SOURCE, "pizza.ts");

    expect(ir.name).toBe("PizzaSize");
    expect(ir.title).toBe("Pizza Size");
    expect(ir.cases).toHaveLength(3);
    expect(ir.cases.map((c) => c.value)).toEqual(["small", "medium", "large"]);
    expect(ir.cases[0].image).toBe("circle");
    expect(ir.sourceFile).toBe("pizza.ts");
  });

  it("defaults title to name when omitted", () => {
    const ir = parseAppEnumSource(
      `
      import { defineAppEnum } from "@axint/compiler";
      export default defineAppEnum({
        name: "OrderStatus",
        cases: [{ value: "pending", title: "Pending" }],
      });
    `,
      "order.ts"
    );
    expect(ir.title).toBe("OrderStatus");
  });
});

describe("compileAppEnumSource", () => {
  it("produces valid Swift for a well-formed source", () => {
    const result = compileAppEnumSource(PIZZA_SIZE_SOURCE, "pizza.ts");
    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.output?.swiftCode).toContain("enum PizzaSize: String, AppEnum");
    expect(result.output?.outputPath).toMatch(/PizzaSize\.swift$/);
  });

  it("reports IR validation errors before generation", () => {
    const result = compileAppEnumFromIR({ ...PIZZA_SIZE, cases: [] });
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain("AX791");
  });
});
