import { describe, it, expect } from "vitest";
import { validateIntent, validateSwiftSource } from "../../src/core/validator.js";
import type { IRIntent } from "../../src/core/types.js";

function makeIntent(overrides: Partial<IRIntent> = {}): IRIntent {
  return {
    name: "TestIntent",
    title: "Test Intent",
    description: "A test intent",
    parameters: [],
    returnType: { kind: "primitive", value: "string" },
    sourceFile: "test.ts",
    ...overrides,
  };
}

describe("validateIntent", () => {
  it("returns no diagnostics for a valid intent", () => {
    const diagnostics = validateIntent(makeIntent());
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("flags non-PascalCase names (AX100)", () => {
    const diagnostics = validateIntent(makeIntent({ name: "testIntent" }));
    expect(diagnostics.some((d) => d.code === "AX100")).toBe(true);
  });

  it("flags empty name (AX100)", () => {
    const diagnostics = validateIntent(makeIntent({ name: "" }));
    expect(diagnostics.some((d) => d.code === "AX100")).toBe(true);
  });

  it("flags empty title (AX101)", () => {
    const diagnostics = validateIntent(makeIntent({ title: "" }));
    expect(diagnostics.some((d) => d.code === "AX101")).toBe(true);
  });

  it("flags empty description (AX102)", () => {
    const diagnostics = validateIntent(makeIntent({ description: "" }));
    expect(diagnostics.some((d) => d.code === "AX102")).toBe(true);
  });

  it("flags invalid Swift identifier in param name (AX103)", () => {
    const diagnostics = validateIntent(
      makeIntent({
        parameters: [
          {
            name: "123invalid",
            type: { kind: "primitive", value: "string" },
            title: "Bad",
            description: "Bad param",
            isOptional: false,
          },
        ],
      })
    );
    expect(diagnostics.some((d) => d.code === "AX103")).toBe(true);
  });

  it("warns on empty param description (AX104)", () => {
    const diagnostics = validateIntent(
      makeIntent({
        parameters: [
          {
            name: "good",
            type: { kind: "primitive", value: "string" },
            title: "Good",
            description: "",
            isOptional: false,
          },
        ],
      })
    );
    const warning = diagnostics.find((d) => d.code === "AX104");
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("warns when more than 10 parameters (AX105)", () => {
    const params = Array.from({ length: 12 }, (_, i) => ({
      name: `param${i}`,
      type: { kind: "primitive" as const, value: "string" as const },
      title: `Param ${i}`,
      description: `Param ${i}`,
      isOptional: false,
    }));
    const diagnostics = validateIntent(makeIntent({ parameters: params }));
    expect(diagnostics.some((d) => d.code === "AX105")).toBe(true);
  });

  it("warns when title exceeds 60 characters (AX106)", () => {
    const longTitle = "A".repeat(65);
    const diagnostics = validateIntent(makeIntent({ title: longTitle }));
    expect(diagnostics.some((d) => d.code === "AX106")).toBe(true);
  });

  it("accepts valid PascalCase variants", () => {
    for (const name of ["SendMessage", "A", "CreateCalendarEvent2"]) {
      const diagnostics = validateIntent(makeIntent({ name }));
      expect(diagnostics.filter((d) => d.code === "AX100")).toHaveLength(0);
    }
  });

  it("warns when HealthKit entitlement is present without usage descriptions (AX114)", () => {
    const diagnostics = validateIntent(
      makeIntent({
        entitlements: ["com.apple.developer.healthkit"],
      })
    );
    const warning = diagnostics.find((d) => d.code === "AX114");
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("warns when HealthKit usage descriptions are present without entitlement (AX115)", () => {
    const diagnostics = validateIntent(
      makeIntent({
        infoPlistKeys: {
          NSHealthShareUsageDescription: "Read workout history to chart progress.",
        },
      })
    );
    const warning = diagnostics.find((d) => d.code === "AX115");
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("warns when privacy usage descriptions are empty or placeholder copy (AX116)", () => {
    const diagnostics = validateIntent(
      makeIntent({
        infoPlistKeys: {
          NSHealthShareUsageDescription: "TODO: add real copy",
          NSCalendarsUsageDescription: "",
        },
      })
    );
    expect(diagnostics.filter((d) => d.code === "AX116")).toHaveLength(2);
  });

  it("warns when a Cloud-style HealthKit shorthand entitlement is used (AX117)", () => {
    const diagnostics = validateIntent(
      makeIntent({
        entitlements: ["healthkit.write"],
      })
    );

    const warning = diagnostics.find((d) => d.code === "AX117");
    expect(warning).toBeDefined();
    expect(warning?.suggestion).toContain("com.apple.developer.healthkit");
  });

  it("warns when a Cloud-style HealthKit plist shorthand key is used (AX118)", () => {
    const diagnostics = validateIntent(
      makeIntent({
        infoPlistKeys: {
          HealthUsageDescription: "Logs water intake to Health.",
        },
      })
    );

    const warning = diagnostics.find((d) => d.code === "AX118");
    expect(warning).toBeDefined();
    expect(diagnostics.some((d) => d.code === "AX109")).toBe(false);
  });

  it("accepts well-formed HealthKit entitlements and privacy strings together", () => {
    const diagnostics = validateIntent(
      makeIntent({
        entitlements: ["com.apple.developer.healthkit"],
        infoPlistKeys: {
          NSHealthShareUsageDescription: "Read workout history to personalize coaching.",
          NSHealthUpdateUsageDescription: "Save newly completed workouts to Health.",
        },
      })
    );

    expect(diagnostics.some((d) => d.code === "AX114")).toBe(false);
    expect(diagnostics.some((d) => d.code === "AX115")).toBe(false);
    expect(diagnostics.some((d) => d.code === "AX116")).toBe(false);
  });
});

describe("validateSwiftSource", () => {
  const VALID_SWIFT = `
import AppIntents

struct TestIntent: AppIntent {
    static var title: LocalizedStringResource = "Test"

    func perform() async throws -> some IntentResult {
        return .result()
    }
}
`;

  it("returns no diagnostics for valid Swift", () => {
    const diagnostics = validateSwiftSource(VALID_SWIFT);
    expect(diagnostics).toHaveLength(0);
  });

  it("flags missing import AppIntents (AX200)", () => {
    const swift = VALID_SWIFT.replace("import AppIntents", "");
    const diagnostics = validateSwiftSource(swift);
    expect(diagnostics.some((d) => d.code === "AX200")).toBe(true);
  });

  it("flags missing AppIntent conformance (AX201)", () => {
    const swift = VALID_SWIFT.replace(": AppIntent", "");
    const diagnostics = validateSwiftSource(swift);
    expect(diagnostics.some((d) => d.code === "AX201")).toBe(true);
  });

  it("flags missing perform function (AX202)", () => {
    const swift = VALID_SWIFT.replace("func perform()", "func run()");
    const diagnostics = validateSwiftSource(swift);
    expect(diagnostics.some((d) => d.code === "AX202")).toBe(true);
  });
});

describe("validateIntent — param default type checks (AX127)", () => {
  const paramWith = (
    type: IRIntent["parameters"][number]["type"],
    defaultValue: unknown
  ) =>
    makeIntent({
      parameters: [
        {
          name: "value",
          type,
          title: "Value",
          description: "A value",
          isOptional: false,
          defaultValue,
        },
      ],
    });

  const primitive = (value: string) =>
    ({ kind: "primitive", value }) as IRIntent["parameters"][number]["type"];

  const ax127 = (intent: IRIntent) =>
    validateIntent(intent).find((d) => d.code === "AX127");

  it("rejects a number default on a string param", () => {
    const diagnostic = ax127(paramWith(primitive("string"), 8));
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.message).toContain("the number 8");
    expect(diagnostic?.suggestion).toContain("param.int(...)");
  });

  it("rejects a string default on an int param", () => {
    const diagnostic = ax127(paramWith(primitive("int"), "x"));
    expect(diagnostic?.message).toContain('the string "x"');
    expect(diagnostic?.suggestion).toContain("whole number");
  });

  it("rejects a fractional default on an int param", () => {
    expect(ax127(paramWith(primitive("int"), 1.5))).toBeDefined();
  });

  it("rejects a boolean default on a double param", () => {
    expect(ax127(paramWith(primitive("double"), true))).toBeDefined();
  });

  it("rejects a string default on a float param", () => {
    expect(ax127(paramWith(primitive("float"), "fast"))).toBeDefined();
  });

  it("rejects a string default on a boolean param", () => {
    const diagnostic = ax127(paramWith(primitive("boolean"), "yes"));
    expect(diagnostic?.suggestion).toContain("true or false");
  });

  it("rejects any literal default on a date param", () => {
    const diagnostic = ax127(paramWith(primitive("date"), "2026-01-01"));
    expect(diagnostic?.message).toContain("do not support literal defaults");
    expect(diagnostic?.suggestion).toContain("perform()");
  });

  it("rejects any literal default on a duration param", () => {
    expect(ax127(paramWith(primitive("duration"), 30))).toBeDefined();
  });

  it("rejects a number default on a url param", () => {
    expect(ax127(paramWith(primitive("url"), 8080))).toBeDefined();
  });

  it("rejects an empty-string default on a url param", () => {
    expect(ax127(paramWith(primitive("url"), ""))).toBeDefined();
  });

  it("rejects a mismatched default inside an optional wrapper", () => {
    expect(
      ax127(paramWith({ kind: "optional", innerType: primitive("string") }, 8))
    ).toBeDefined();
  });

  it("rejects a mismatched element in an array default", () => {
    expect(
      ax127(paramWith({ kind: "array", elementType: primitive("string") }, ["a", 2]))
    ).toBeDefined();
  });

  it("rejects a default that is not one of the enum cases", () => {
    const diagnostic = ax127(
      paramWith({ kind: "enum", name: "ModeOption", cases: ["fast", "slow"] }, "medium")
    );
    expect(diagnostic?.suggestion).toContain("fast, slow");
  });

  it("accepts matching defaults for every literal-friendly type", () => {
    const valid: Array<[IRIntent["parameters"][number]["type"], unknown]> = [
      [primitive("string"), "hello"],
      [primitive("int"), 8],
      [primitive("double"), 1.5],
      [primitive("float"), 2.5],
      [primitive("boolean"), false],
      [primitive("url"), "https://example.com"],
      [{ kind: "optional", innerType: primitive("int") }, 3],
      [{ kind: "array", elementType: primitive("string") }, ["a", "b"]],
      [{ kind: "enum", name: "ModeOption", cases: ["fast", "slow"] }, "fast"],
      [
        {
          kind: "dynamicOptions",
          valueType: primitive("string"),
          providerName: "Provider",
        },
        "a",
      ],
    ];

    for (const [type, defaultValue] of valid) {
      expect(ax127(paramWith(type, defaultValue))).toBeUndefined();
    }
  });

  it("accepts params without a default", () => {
    expect(ax127(paramWith(primitive("date"), undefined))).toBeUndefined();
  });
});
