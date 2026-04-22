import { describe, expect, it } from "vitest";
import {
  compileAppShortcutFromIR,
  compileAppShortcutSource,
} from "../../src/core/compiler.js";
import { generateSwiftAppShortcut } from "../../src/core/app-shortcut-generator.js";
import { parseAppShortcutSource } from "../../src/core/app-shortcut-parser.js";
import {
  validateAppShortcut,
  validateSwiftAppShortcutSource,
} from "../../src/core/app-shortcut-validator.js";
import type { IRAppShortcut } from "../../src/core/types.js";

// ─── Fixtures ───────────────────────────────────────────────────────

const PIZZA_SHORTCUTS: IRAppShortcut = {
  name: "PizzaShortcuts",
  shortcuts: [
    {
      intent: "OrderPizza",
      phrases: [
        "Order a pizza with ${applicationName}",
        "Start a pizza order in ${applicationName}",
      ],
      shortTitle: "Order Pizza",
      systemImageName: "fork.knife",
    },
    {
      intent: "FindStore",
      phrases: ["Find a ${applicationName} store near me"],
      shortTitle: "Find a Store",
      systemImageName: "location.fill",
    },
  ],
  sourceFile: "<test>",
};

const PIZZA_SHORTCUTS_SOURCE = `
import { defineAppShortcut } from "@axint/compiler";

export default defineAppShortcut({
  name: "PizzaShortcuts",
  shortcuts: [
    {
      intent: "OrderPizza",
      phrases: [
        "Order a pizza with \${applicationName}",
        "Start a pizza order in \${applicationName}",
      ],
      shortTitle: "Order Pizza",
      systemImageName: "fork.knife",
    },
    {
      intent: "FindStore",
      phrases: ["Find a \${applicationName} store near me"],
      shortTitle: "Find a Store",
      systemImageName: "location.fill",
    },
  ],
});
`;

// ─── Generator ──────────────────────────────────────────────────────

describe("generateSwiftAppShortcut", () => {
  it("emits AppIntents import and AppShortcutsProvider conformance", () => {
    const swift = generateSwiftAppShortcut(PIZZA_SHORTCUTS);

    expect(swift).toContain("import AppIntents");
    expect(swift).toContain("struct PizzaShortcuts: AppShortcutsProvider {");
    expect(swift).toContain("static var appShortcuts: [AppShortcut] {");
  });

  it("emits AppShortcut initializers with intent(), phrases, shortTitle, and systemImageName", () => {
    const swift = generateSwiftAppShortcut(PIZZA_SHORTCUTS);

    expect(swift).toContain("intent: OrderPizza()");
    expect(swift).toContain("intent: FindStore()");
    expect(swift).toContain('shortTitle: "Order Pizza"');
    expect(swift).toContain('systemImageName: "fork.knife"');
    expect(swift).toContain('systemImageName: "location.fill"');
  });

  it("rewrites ${applicationName} to Apple's \\(.applicationName) token", () => {
    const swift = generateSwiftAppShortcut(PIZZA_SHORTCUTS);

    expect(swift).toContain('"Order a pizza with \\(.applicationName)"');
    expect(swift).toContain('"Find a \\(.applicationName) store near me"');
    expect(swift).not.toContain("${applicationName}");
  });

  it("escapes quotes in titles without double-escaping the applicationName token", () => {
    const tricky: IRAppShortcut = {
      ...PIZZA_SHORTCUTS,
      shortcuts: [
        {
          intent: "Order",
          phrases: ['Say "hi" to ${applicationName}'],
          shortTitle: 'Order "Now"',
          systemImageName: "bolt.fill",
        },
      ],
    };
    const swift = generateSwiftAppShortcut(tricky);
    expect(swift).toContain('"Say \\"hi\\" to \\(.applicationName)"');
    expect(swift).toContain('"Order \\"Now\\""');
  });
});

// ─── IR Validator ───────────────────────────────────────────────────

describe("validateAppShortcut", () => {
  it("accepts a well-formed provider", () => {
    expect(validateAppShortcut(PIZZA_SHORTCUTS)).toEqual([]);
  });

  it("rejects a non-PascalCase provider name (AX810)", () => {
    const diags = validateAppShortcut({ ...PIZZA_SHORTCUTS, name: "pizzaShortcuts" });
    expect(diags.map((d) => d.code)).toContain("AX810");
  });

  it("rejects an empty shortcuts list (AX811)", () => {
    const diags = validateAppShortcut({ ...PIZZA_SHORTCUTS, shortcuts: [] });
    expect(diags.map((d) => d.code)).toContain("AX811");
  });

  it("rejects an intent name that isn't a Swift type identifier (AX812)", () => {
    const diags = validateAppShortcut({
      ...PIZZA_SHORTCUTS,
      shortcuts: [
        {
          ...PIZZA_SHORTCUTS.shortcuts[0],
          intent: "orderPizza",
        },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX812");
  });

  it("rejects a shortcut with no phrases (AX813)", () => {
    const diags = validateAppShortcut({
      ...PIZZA_SHORTCUTS,
      shortcuts: [
        {
          ...PIZZA_SHORTCUTS.shortcuts[0],
          phrases: [],
        },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX813");
  });

  it("rejects a shortcut with no applicationName phrase (AX814)", () => {
    const diags = validateAppShortcut({
      ...PIZZA_SHORTCUTS,
      shortcuts: [
        {
          ...PIZZA_SHORTCUTS.shortcuts[0],
          phrases: ["Order a pizza"],
        },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX814");
  });

  it("rejects an empty shortTitle (AX815)", () => {
    const diags = validateAppShortcut({
      ...PIZZA_SHORTCUTS,
      shortcuts: [{ ...PIZZA_SHORTCUTS.shortcuts[0], shortTitle: "  " }],
    });
    expect(diags.map((d) => d.code)).toContain("AX815");
  });

  it("rejects an empty systemImageName (AX816)", () => {
    const diags = validateAppShortcut({
      ...PIZZA_SHORTCUTS,
      shortcuts: [{ ...PIZZA_SHORTCUTS.shortcuts[0], systemImageName: "" }],
    });
    expect(diags.map((d) => d.code)).toContain("AX816");
  });

  it("rejects more than 10 shortcuts (AX817)", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      intent: `Intent${i}`,
      phrases: ["Run ${applicationName}"],
      shortTitle: `Title ${i}`,
      systemImageName: "bolt.fill",
    }));
    const diags = validateAppShortcut({ ...PIZZA_SHORTCUTS, shortcuts: eleven });
    expect(diags.map((d) => d.code)).toContain("AX817");
  });
});

describe("validateSwiftAppShortcutSource", () => {
  it("flags missing AppIntents import (AX818)", () => {
    const diags = validateSwiftAppShortcutSource(
      "struct PizzaShortcuts: AppShortcutsProvider {}"
    );
    expect(diags.map((d) => d.code)).toContain("AX818");
  });

  it("flags missing AppShortcutsProvider conformance (AX819)", () => {
    const diags = validateSwiftAppShortcutSource(
      "import AppIntents\nstruct PizzaShortcuts {}"
    );
    expect(diags.map((d) => d.code)).toContain("AX819");
  });

  it("accepts Swift with both import and conformance", () => {
    expect(
      validateSwiftAppShortcutSource(
        "import AppIntents\nstruct PizzaShortcuts: AppShortcutsProvider {}"
      )
    ).toEqual([]);
  });
});

// ─── Parser + end-to-end compile ───────────────────────────────────

describe("parseAppShortcutSource", () => {
  it("parses a defineAppShortcut call into an IRAppShortcut", () => {
    const ir = parseAppShortcutSource(PIZZA_SHORTCUTS_SOURCE, "pizza.ts");

    expect(ir.name).toBe("PizzaShortcuts");
    expect(ir.shortcuts).toHaveLength(2);
    expect(ir.shortcuts[0].intent).toBe("OrderPizza");
    expect(ir.shortcuts[0].phrases).toEqual([
      "Order a pizza with ${applicationName}",
      "Start a pizza order in ${applicationName}",
    ]);
    expect(ir.shortcuts[0].shortTitle).toBe("Order Pizza");
    expect(ir.shortcuts[0].systemImageName).toBe("fork.knife");
    expect(ir.sourceFile).toBe("pizza.ts");
  });

  it("throws when defineAppShortcut is missing (AX800)", () => {
    expect.assertions(1);
    try {
      parseAppShortcutSource("const x = 1;", "nope.ts");
    } catch (err) {
      expect((err as { code: string }).code).toBe("AX800");
    }
  });
});

describe("compileAppShortcutSource", () => {
  it("produces valid Swift for a well-formed source", () => {
    const result = compileAppShortcutSource(PIZZA_SHORTCUTS_SOURCE, "pizza.ts");
    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.output?.swiftCode).toContain(
      "struct PizzaShortcuts: AppShortcutsProvider"
    );
    expect(result.output?.swiftCode).toContain("\\(.applicationName)");
    expect(result.output?.outputPath).toMatch(/PizzaShortcuts\.swift$/);
  });

  it("reports IR validation errors before generation", () => {
    const result = compileAppShortcutFromIR({ ...PIZZA_SHORTCUTS, shortcuts: [] });
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain("AX811");
  });
});
