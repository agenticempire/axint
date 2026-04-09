/**
 * Parser Edge Case Tests
 *
 * Tests for apostrophes in strings, special characters, whitespace
 * handling, and various quoting styles.
 */

import { describe, it, expect } from "vitest";
import { parseIntentSource, ParserError } from "../../src/core/parser.js";

describe("parser — apostrophes and quotes", () => {
  it("handles apostrophes in double-quoted title", () => {
    const source = `
defineIntent({
  name: "UserGreeting",
  title: "What's Your Name",
  description: "Asks the user's name for personalized greeting",
  params: {},
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.title).toBe("What's Your Name");
    expect(ir.description).toBe("Asks the user's name for personalized greeting");
  });

  it("handles double quotes in single-quoted strings", () => {
    const source = `
defineIntent({
  name: "QuoteTest",
  title: 'Say "Hello" to AI',
  description: 'Description with "quotes"',
  params: {},
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.title).toBe('Say "Hello" to AI');
  });

  it("handles param descriptions with apostrophes", () => {
    const source = `
defineIntent({
  name: "SetTimer",
  title: "Set Timer",
  description: "Sets a timer",
  params: {
    label: param.string("Timer's display label"),
    minutes: param.number("How many minutes you'd like"),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.parameters).toHaveLength(2);
    expect(ir.parameters[0].description).toBe("Timer's display label");
    expect(ir.parameters[1].description).toBe("How many minutes you'd like");
  });
});

describe("parser — default value edge cases", () => {
  it("parses boolean true default", () => {
    const source = `
defineIntent({
  name: "ToggleTest",
  title: "Toggle Test",
  description: "Tests defaults",
  params: {
    enabled: param.boolean("Is enabled", { default: true }),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.parameters[0].defaultValue).toBe(true);
  });

  it("parses boolean false default", () => {
    const source = `
defineIntent({
  name: "ToggleTest",
  title: "Toggle Test",
  description: "Tests defaults",
  params: {
    enabled: param.boolean("Is enabled", { default: false }),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.parameters[0].defaultValue).toBe(false);
  });

  it("parses string default", () => {
    const source = `
defineIntent({
  name: "GreetTest",
  title: "Greet Test",
  description: "Tests defaults",
  params: {
    greeting: param.string("Greeting text", { default: "hello" }),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.parameters[0].defaultValue).toBe("hello");
  });

  it("parses float default", () => {
    const source = `
defineIntent({
  name: "CalcTest",
  title: "Calc Test",
  description: "Tests defaults",
  params: {
    rate: param.number("Interest rate", { default: 3.14 }),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.parameters[0].defaultValue).toBe(3.14);
  });
});

describe("parser — all supported param types", () => {
  it("parses every canonical param type", () => {
    const source = `
defineIntent({
  name: "AllTypes",
  title: "All Types",
  description: "Uses every param type",
  params: {
    s: param.string("A string"),
    i: param.int("An integer"),
    dbl: param.double("A double"),
    flt: param.float("A float"),
    b: param.boolean("A boolean"),
    d: param.date("A date"),
    dur: param.duration("A duration"),
    u: param.url("A URL"),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.parameters).toHaveLength(8);
    expect(
      ir.parameters.map((p) => (p.type.kind === "primitive" ? p.type.value : ""))
    ).toEqual([
      "string",
      "int",
      "double",
      "float",
      "boolean",
      "date",
      "duration",
      "url",
    ]);
  });

  it("rewrites legacy param.number to int via the alias table", () => {
    const source = `
defineIntent({
  name: "Legacy",
  title: "Legacy",
  description: "Uses deprecated param.number",
  params: {
    count: param.number("A count"),
  },
  perform: async () => {},
});
`;
    const ir = parseIntentSource(source, "test.ts");
    expect(ir.parameters[0].type).toEqual({ kind: "primitive", value: "int" });
  });
});

describe("parser — error cases", () => {
  it("provides AX001 with helpful suggestion", () => {
    try {
      parseIntentSource("const x = 1;", "test.ts");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError);
      const pe = err as ParserError;
      expect(pe.code).toBe("AX001");
      expect(pe.suggestion).toContain("defineIntent");
    }
  });

  it("provides AX005 for unknown type with supported list", () => {
    const source = `
defineIntent({
  name: "Test",
  title: "Test",
  description: "Test",
  params: {
    x: param.int64("Big number"),
  },
  perform: async () => {},
});
`;
    try {
      parseIntentSource(source, "test.ts");
      expect.fail("Should have thrown");
    } catch (err) {
      const pe = err as ParserError;
      expect(pe.code).toBe("AX005");
      expect(pe.suggestion).toContain("string");
      expect(pe.suggestion).toContain("int");
    }
  });

  it("ParserError.format() includes line number when provided", () => {
    const err = new ParserError("AX001", "Test", "file.ts", 42, "Fix it");
    const formatted = err.format();
    expect(formatted).toContain(":42");
  });
});
