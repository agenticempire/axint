import { describe, it, expect } from "vitest";
import { compileViewSource } from "../../src/core/compiler.js";

const GREETING_VIEW = `
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
      view.text("Tapped \\\\(tapCount) times"),
    ], { spacing: 16 }),
  ],
});
`;

const PROFILE_CARD = `
import { defineView, prop, state, view } from "@axint/sdk";

export default defineView({
  name: "ProfileCard",
  props: {
    name: prop.string("Display name"),
    bio: prop.string("Short bio", { required: false }),
  },
  state: {
    isExpanded: state.boolean("Whether card is expanded", { default: false }),
  },
  body: [
    view.vstack([
      view.hstack([
        view.image({ systemName: "person.circle.fill" }),
        view.text("\\\\(name)"),
        view.spacer(),
      ], { spacing: 12 }),
      view.conditional("isExpanded", [
        view.text("\\\\(bio ?? \\"No bio\\")"),
      ]),
      view.button("Toggle", "isExpanded.toggle()"),
    ], { spacing: 8 }),
  ],
});
`;

const MINIMAL_VIEW = `
import { defineView, view } from "@axint/sdk";

export default defineView({
  name: "EmptyState",
  body: [
    view.text("Nothing here yet"),
  ],
});
`;

describe("compileViewSource", () => {
  it("compiles a simple greeting view", () => {
    const result = compileViewSource(GREETING_VIEW);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();

    const swift = result.output!.swiftCode;
    expect(swift).toContain("import SwiftUI");
    expect(swift).toContain("struct Greeting: View");
    expect(swift).toContain("var username: String");
    expect(swift).toContain("@State private var tapCount: Int = 0");
    expect(swift).toContain("var body: some View");
    expect(swift).toContain("VStack(spacing: 16)");
    expect(swift).toContain('Button("Tap me")');
    expect(swift).toContain("#Preview");
  });

  it("compiles a profile card with conditionals", () => {
    const result = compileViewSource(PROFILE_CARD);
    expect(result.success).toBe(true);

    const swift = result.output!.swiftCode;
    expect(swift).toContain("struct ProfileCard: View");
    expect(swift).toContain("var name: String");
    expect(swift).toContain("var bio: String?");
    expect(swift).toContain("@State private var isExpanded: Bool = false");
    expect(swift).toContain("HStack(spacing: 12)");
    expect(swift).toContain('Image(systemName: "person.circle.fill")');
    expect(swift).toContain("if isExpanded");
    expect(swift).toContain("Spacer()");
  });

  it("compiles a minimal view with no props or state", () => {
    const result = compileViewSource(MINIMAL_VIEW);
    expect(result.success).toBe(true);

    const swift = result.output!.swiftCode;
    expect(swift).toContain("struct EmptyState: View");
    expect(swift).toContain('Text("Nothing here yet")');
    expect(swift).toContain("EmptyState()");
  });

  it("outputs correct file name", () => {
    const result = compileViewSource(GREETING_VIEW);
    expect(result.output!.outputPath).toBe("Greeting.swift");
  });

  it("respects outDir option", () => {
    const result = compileViewSource(GREETING_VIEW, "<stdin>", { outDir: "Generated" });
    expect(result.output!.outputPath).toBe("Generated/Greeting.swift");
  });

  it("rejects views without a name", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        body: [view.text("oops")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("AX302");
  });

  it("rejects views without a body", () => {
    const src = `
      import { defineView } from "@axint/sdk";
      export default defineView({
        name: "Broken",
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("AX307");
  });

  it("rejects views with lowercase names", () => {
    const src = `
      import { defineView, view } from "@axint/sdk";
      export default defineView({
        name: "myView",
        body: [view.text("hi")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX310")).toBe(true);
  });

  it("warns when @State has no default", () => {
    const src = `
      import { defineView, state, view } from "@axint/sdk";
      export default defineView({
        name: "NoDefault",
        state: {
          count: state.int("tap count"),
        },
        body: [view.text("hi")],
      });
    `;
    const result = compileViewSource(src);
    expect(result.success).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "AX317")).toBe(true);
  });
});

describe("view IR roundtrip", () => {
  it("preserves all IR fields", () => {
    const result = compileViewSource(GREETING_VIEW);
    const ir = result.output!.ir;

    expect(ir.name).toBe("Greeting");
    expect(ir.props).toHaveLength(1);
    expect(ir.props[0].name).toBe("username");
    expect(ir.state).toHaveLength(1);
    expect(ir.state[0].name).toBe("tapCount");
    expect(ir.state[0].kind).toBe("state");
    expect(ir.state[0].defaultValue).toBe(0);
    expect(ir.body).toHaveLength(1);
    expect(ir.body[0].kind).toBe("vstack");
  });
});
