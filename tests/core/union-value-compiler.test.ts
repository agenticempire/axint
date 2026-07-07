import { describe, expect, it } from "vitest";
import { compileAnySource, compileUnionValueSource } from "../../src/core/compiler.js";

describe("defineUnionValue compiler", () => {
  it("emits @UnionValue enum with display representations", () => {
    const source = `
      import { defineUnionValue } from "@axint/compiler";

      export default defineUnionValue({
        name: "SearchTarget",
        title: "Search Target",
        cases: [
          { name: "task", type: "TaskEntity", title: "Task" },
          { name: "query", type: "String", title: "Search Text" },
        ],
      });
    `;

    const result = compileUnionValueSource(source, "SearchTarget.ts");

    expect(result.success).toBe(true);
    expect(result.output?.swiftCode).toContain("@UnionValue");
    expect(result.output?.swiftCode).toContain("enum SearchTarget");
    expect(result.output?.swiftCode).toContain("case task(TaskEntity)");
    expect(result.output?.swiftCode).toContain("case query(String)");
    expect(result.output?.swiftCode).toContain("caseDisplayRepresentations");
  });

  it("is detected by compileAnySource", () => {
    const source = `
      import { defineUnionValue } from "@axint/compiler";
      export default defineUnionValue({
        name: "AttachmentTarget",
        cases: [
          { name: "url", type: "URL", title: "URL" },
          { name: "text", type: "String", title: "Text" },
        ],
      });
    `;

    const result = compileAnySource(source, "AttachmentTarget.ts");

    expect(result.surface).toBe("unionValue");
    expect(result.success).toBe(true);
    expect(result.output?.swiftCode).toContain("@UnionValue");
  });

  it("warns for Beta 3 duplicate number-like cases", () => {
    const source = `
      import { defineUnionValue } from "@axint/compiler";
      export default defineUnionValue({
        name: "AmountValue",
        cases: [
          { name: "whole", type: "Int", title: "Whole" },
          { name: "decimal", type: "Double", title: "Decimal" },
        ],
      });
    `;

    const result = compileUnionValueSource(source, "AmountValue.ts");

    expect(result.diagnostics.some((d) => d.code === "AX821")).toBe(true);
  });
});
