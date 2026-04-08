import { describe, it, expect } from "vitest";
import { parseIntentSource, ParserError } from "../../src/core/parser.js";

const VALID_SOURCE = `
import { defineIntent, param } from "@axint/sdk";

export default defineIntent({
  name: "CreateEvent",
  title: "Create Event",
  description: "Creates a new calendar event",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    duration: param.number("Duration in minutes", { required: false }),
  },
  perform: async ({ title, date, duration }) => {
    return { success: true };
  },
});
`;

describe("parseIntentSource", () => {
  it("parses a valid defineIntent() call", () => {
    const ir = parseIntentSource(VALID_SOURCE, "test.ts");

    expect(ir.name).toBe("CreateEvent");
    expect(ir.title).toBe("Create Event");
    expect(ir.description).toBe("Creates a new calendar event");
    expect(ir.domain).toBe("productivity");
    expect(ir.sourceFile).toBe("test.ts");
  });

  it("extracts parameters correctly", () => {
    const ir = parseIntentSource(VALID_SOURCE, "test.ts");

    expect(ir.parameters).toHaveLength(3);
    expect(ir.parameters[0].name).toBe("title");
    expect(ir.parameters[0].type).toEqual({ kind: "primitive", value: "string" });
    expect(ir.parameters[0].isOptional).toBe(false);

    expect(ir.parameters[1].name).toBe("date");
    expect(ir.parameters[1].type).toEqual({ kind: "primitive", value: "date" });

    expect(ir.parameters[2].name).toBe("duration");
    expect(ir.parameters[2].isOptional).toBe(true);
    expect(ir.parameters[2].type).toEqual({
      kind: "optional",
      innerType: { kind: "primitive", value: "number" },
    });
  });

  it("throws ParserError for missing defineIntent()", () => {
    const source = `const x = 42;`;
    expect(() => parseIntentSource(source, "bad.ts")).toThrow(ParserError);
  });

  it("throws ParserError for missing name field", () => {
    const source = `
defineIntent({
  title: "Test",
  description: "Test",
  params: {},
  perform: async () => {},
});
`;
    expect(() => parseIntentSource(source, "noname.ts")).toThrow(ParserError);
  });

  it("throws ParserError for missing title field", () => {
    const source = `
defineIntent({
  name: "Test",
  description: "Test",
  params: {},
  perform: async () => {},
});
`;
    expect(() => parseIntentSource(source, "notitle.ts")).toThrow(ParserError);
  });

  it("throws ParserError for missing description field", () => {
    const source = `
defineIntent({
  name: "Test",
  title: "Test",
  params: {},
  perform: async () => {},
});
`;
    expect(() => parseIntentSource(source, "nodesc.ts")).toThrow(ParserError);
  });

  it("throws ParserError for unsupported param type", () => {
    const source = `
defineIntent({
  name: "Test",
  title: "Test",
  description: "Test",
  params: {
    foo: param.object("An object"),
  },
  perform: async () => {},
});
`;
    expect(() => parseIntentSource(source, "badtype.ts")).toThrow(ParserError);
  });

  it("ParserError formats correctly", () => {
    const err = new ParserError(
      "AX001",
      "No defineIntent() call found",
      "test.ts",
      undefined,
      "Check your file."
    );
    const formatted = err.format();
    expect(formatted).toContain("AX001");
    expect(formatted).toContain("test.ts");
    expect(formatted).toContain("Check your file.");
  });

  it("handles optional domain and category gracefully", () => {
    const source = `
defineIntent({
  name: "SimpleIntent",
  title: "Simple",
  description: "A simple intent",
  params: {},
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "simple.ts");
    expect(ir.domain).toBeUndefined();
    expect(ir.category).toBeUndefined();
  });

  it("parses default values for parameters", () => {
    const source = `
defineIntent({
  name: "WithDefaults",
  title: "With Defaults",
  description: "Has defaults",
  params: {
    count: param.number("A count", { default: 5 }),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "defaults.ts");
    expect(ir.parameters[0].defaultValue).toBe(5);
  });
});
