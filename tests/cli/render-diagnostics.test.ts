import { describe, expect, it } from "vitest";
import { renderDiagnostic } from "../../src/cli/render-diagnostics.js";
import type { Diagnostic } from "../../src/core/types.js";

const SOURCE = `defineIntent({
  name: "MakeThing",
  params: {
    length: param.string("Length", { default: 8 }),
  },
});
`;

const diagnostic: Diagnostic = {
  code: "AX127",
  severity: "error",
  message:
    'Parameter "length" is declared param.string() but its default is the number 8',
  file: "make-thing.ts",
  line: 4,
  column: 47,
  suggestion: "Change the default to a string.",
};

describe("renderDiagnostic", () => {
  it("prints a rust-style location with line and column", () => {
    const rendered = renderDiagnostic(diagnostic, { color: false });
    expect(rendered).toContain("error[AX127]:");
    expect(rendered).toContain("--> make-thing.ts:4:47");
    expect(rendered).toContain("= help: Change the default to a string.");
  });

  it("renders a snippet with a caret under the offending column", () => {
    const rendered = renderDiagnostic(diagnostic, {
      color: false,
      sources: new Map([["make-thing.ts", SOURCE]]),
    });
    const lines = rendered.split("\n");
    expect(lines).toContain("   3 |   params: {");
    expect(lines).toContain('   4 |     length: param.string("Length", { default: 8 }),');
    const underline = lines.find((line) => line.includes("^"));
    expect(underline).toBeDefined();
    // The caret column lines up with the default literal in the code row.
    const codeRow = lines.find((line) => line.startsWith("   4 |"))!;
    expect(codeRow[underline!.indexOf("^")]).toBe("8");
  });

  it("underlines an entire string literal when the caret sits on a quote", () => {
    const rendered = renderDiagnostic(
      { ...diagnostic, line: 2, column: 9 },
      { color: false, sources: new Map([["make-thing.ts", SOURCE]]) }
    );
    expect(rendered).toContain("^~~~~~~~~~~");
  });

  it("omits the snippet when no source is available", () => {
    const rendered = renderDiagnostic(diagnostic, { color: false });
    expect(rendered).not.toContain(" | ");
  });

  it("keeps output free of escape bytes when color is off", () => {
    const rendered = renderDiagnostic(diagnostic, {
      color: false,
      sources: new Map([["make-thing.ts", SOURCE]]),
    });
    expect(rendered).not.toContain("\x1b[");
  });
});
