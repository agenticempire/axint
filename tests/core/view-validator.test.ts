import { describe, it, expect } from "vitest";
import { compileViewFromIR, compileViewSource } from "../../src/core/compiler.js";
import { validateView } from "../../src/core/view-validator.js";
import type { IRView } from "../../src/core/types.js";

describe("view validator: naming", () => {
  it("accepts PascalCase view names", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "ProfileCard",
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX310")).toBe(false);
  });

  it("rejects lowercase view names", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "myview",
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX310")).toBe(true);
  });

  it("rejects snake_case view names", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "profile_card",
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX310")).toBe(true);
  });

  it("rejects kebab-case view names", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "profile-card",
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX310")).toBe(true);
  });

  it("validates that empty string names are invalid", () => {
    const ir: IRView = {
      name: "",
      sourceFile: "test.ts",
      props: [],
      state: [],
      body: [],
    };
    const diags = validateView(ir);
    expect(diags.some((d) => d.code === "AX310")).toBe(true);
  });

  it("suggests PascalCase conversion in diagnostic", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "my_view",
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    const diag = result.diagnostics.find((d) => d.code === "AX310");
    expect(diag?.suggestion).toBeDefined();
    expect(diag?.suggestion).toContain("MyView");
  });
});

describe("view validator: body", () => {
  it("accepts views with non-empty body", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "Valid",
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX311")).toBe(false);
  });

  it("rejects views with empty body array", () => {
    const ir: IRView = {
      name: "Empty",
      sourceFile: "test.ts",
      props: [],
      state: [],
      body: [],
    };
    const result = compileViewFromIR(ir);
    expect(result.diagnostics.some((d) => d.code === "AX311")).toBe(true);
  });

  it("accepts empty body after validation phase", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "Test",
        body: [],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX311")).toBe(true);
  });
});

describe("view validator: props", () => {
  it("accepts valid Swift identifier prop names", () => {
    const src = `
      import { defineView, prop, view } from "@axint/sdk";
      export default defineView({
        name: "Valid",
        props: {
          title: prop.string("Title"),
          _private: prop.string("Private"),
          count123: prop.string("Count"),
        },
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.filter((d) => d.code === "AX312")).toHaveLength(0);
  });

  it("rejects prop names starting with numbers", () => {
    const src = `
      import { defineView, prop, view } from "@axint/sdk";
      export default defineView({
        name: "Invalid",
        props: {
          "123title": prop.string("Title"),
        },
        body: [view.text("content")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX312")).toBe(true);
  });

  it("detects duplicate prop names in IR", () => {
    const ir: IRView = {
      name: "Duplicate",
      sourceFile: "test.ts",
      props: [
        { name: "title", type: { kind: "primitive", value: "string" } },
        { name: "title", type: { kind: "primitive", value: "string" } },
      ],
      state: [],
      body: [],
    };
    const diags = validateView(ir);
    expect(diags.filter((d) => d.code === "AX313")).toHaveLength(1);
  });
});

describe("view validator: state", () => {
  it("accepts valid Swift identifier state names in IR", () => {
    const ir: IRView = {
      name: "Valid",
      sourceFile: "test.ts",
      props: [],
      state: [
        { name: "count", kind: "state", type: { kind: "primitive", value: "int" } },
        {
          name: "_internal",
          kind: "state",
          type: { kind: "primitive", value: "string" },
        },
      ],
      body: [],
    };
    const diags = validateView(ir);
    expect(diags.filter((d) => d.code === "AX314")).toHaveLength(0);
  });

  it("rejects state names starting with numbers in IR", () => {
    const ir: IRView = {
      name: "Invalid",
      sourceFile: "test.ts",
      props: [],
      state: [
        { name: "123state", kind: "state", type: { kind: "primitive", value: "int" } },
      ],
      body: [],
    };
    const diags = validateView(ir);
    expect(diags.some((d) => d.code === "AX314")).toBe(true);
  });

  it("detects state name conflicts with props", () => {
    const ir: IRView = {
      name: "Conflict",
      sourceFile: "test.ts",
      props: [{ name: "title", type: { kind: "primitive", value: "string" } }],
      state: [
        { name: "title", kind: "state", type: { kind: "primitive", value: "int" } },
      ],
      body: [],
    };
    const diags = validateView(ir);
    expect(diags.some((d) => d.code === "AX315")).toBe(true);
  });

  it("warns when @State has no default value via source", () => {
    const src = `
      import { defineView, state, view } from "@axint/sdk";
      export default defineView({
        name: "NoDefault",
        state: {
          count: state.int("Count"),
        },
        body: [view.text("hi")],
      });
    `;
    const result = compileViewSource(src);
    const diag = result.diagnostics.find((d) => d.code === "AX317");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("warning");
  });

  it("accepts @State with default value via source", () => {
    const src = `
      import { defineView, state, view } from "@axint/sdk";
      export default defineView({
        name: "WithDefault",
        state: {
          count: state.int("Count", { default: 0 }),
        },
        body: [view.text("hi")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.diagnostics.some((d) => d.code === "AX317")).toBe(false);
  });

  it("detects environment state without key", () => {
    const ir: IRView = {
      name: "NoKey",
      sourceFile: "test.ts",
      props: [],
      state: [
        {
          name: "dismiss",
          kind: "environment",
          type: { kind: "primitive", value: "string" },
        },
      ],
      body: [],
    };
    const diags = validateView(ir);
    const diag = diags.find((d) => d.code === "AX316");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("warning");
  });

  it("accepts environment state with key", () => {
    const ir: IRView = {
      name: "WithKey",
      sourceFile: "test.ts",
      props: [],
      state: [
        {
          name: "dismiss",
          kind: "environment",
          type: { kind: "primitive", value: "string" },
          environmentKey: "\\.dismiss",
        },
      ],
      body: [],
    };
    const diags = validateView(ir);
    expect(diags.some((d) => d.code === "AX316")).toBe(false);
  });
});

describe("view validator: body nodes", () => {
  it("validates nested vstack children", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "Nested",
        body: [
          view.vstack([
            view.text("title"),
            view.text("subtitle"),
          ]),
        ],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(true);
  });

  it("validates hstack children", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "HStack",
        body: [
          view.hstack([
            view.text("left"),
            view.text("right"),
          ]),
        ],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(true);
  });

  it("validates zstack children", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "ZStack",
        body: [
          view.zstack([
            view.text("background"),
            view.text("foreground"),
          ]),
        ],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(true);
  });

  it("rejects ForEach without collection", () => {
    const ir: IRView = {
      name: "BadForEach",
      sourceFile: "test.ts",
      props: [],
      state: [],
      body: [
        {
          kind: "foreach",
          collection: undefined as unknown,
          body: [],
        },
      ],
    };
    const diags = validateView(ir);
    expect(diags.some((d) => d.code === "AX318")).toBe(true);
  });

  it("accepts ForEach with collection via IR", () => {
    const ir: IRView = {
      name: "GoodForEach",
      sourceFile: "test.ts",
      props: [],
      state: [],
      body: [
        {
          kind: "foreach",
          collection: "items",
          body: [],
        },
      ],
    };
    const diags = validateView(ir);
    expect(diags.some((d) => d.code === "AX318")).toBe(false);
  });

  it("rejects Conditional without condition", () => {
    const ir: IRView = {
      name: "BadConditional",
      sourceFile: "test.ts",
      props: [],
      state: [],
      body: [
        {
          kind: "conditional",
          condition: undefined as unknown,
          then: [],
        },
      ],
    };
    const diags = validateView(ir);
    expect(diags.some((d) => d.code === "AX319")).toBe(true);
  });

  it("validates NavigationLink label children", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "NavLink",
        body: [
          view.navigationLink([view.text("Link")], "DetailView"),
        ],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(true);
  });

  it("validates List children", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "ListView",
        body: [
          view.list([
            view.text("item1"),
            view.text("item2"),
          ]),
        ],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(true);
  });

  it("validates deeply nested structures", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "Deep",
        body: [
          view.vstack([
            view.hstack([
              view.zstack([
                view.text("deep"),
                view.text("content"),
              ]),
            ]),
          ]),
        ],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(true);
  });
});

describe("view validator: generated Swift source", () => {
  it("validates generated Swift code includes SwiftUI import", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "MyView",
        body: [view.text("hi")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.output?.swiftCode).toContain("import SwiftUI");
  });

  it("validates generated Swift code includes View conformance", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "MyView",
        body: [view.text("hi")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.output?.swiftCode).toContain(": View");
  });

  it("validates generated Swift code includes body property", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "MyView",
        body: [view.text("hi")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.output?.swiftCode).toContain("var body: some View");
  });
});

describe("view validator: error collection", () => {
  it("collects multiple validation errors", () => {
    const ir: IRView = {
      name: "bad_name",
      sourceFile: "test.ts",
      props: [
        { name: "123invalid", type: { kind: "primitive", value: "string" } },
        { name: "valid", type: { kind: "primitive", value: "string" } },
      ],
      state: [
        { name: "123bad", kind: "state", type: { kind: "primitive", value: "int" } },
      ],
      body: [],
    };
    const diags = validateView(ir);
    expect(diags.length).toBeGreaterThan(2);
    expect(diags.some((d) => d.code === "AX310")).toBe(true);
    expect(diags.some((d) => d.code === "AX312")).toBe(true);
    expect(diags.some((d) => d.code === "AX314")).toBe(true);
    expect(diags.some((d) => d.code === "AX311")).toBe(true);
  });

  it("does not validate body nodes if IR has errors", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "bad_name",
        body: [
          view.conditional(undefined, [view.text("oops")]),
        ],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(false);
  });
});
