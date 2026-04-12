import { describe, it, expect } from "vitest";
import {
  irTypeToSwift,
  SWIFT_TYPE_MAP,
  isPrimitiveType,
  isSceneKind,
} from "../../src/core/types.js";
import type { IRType } from "../../src/core/types.js";

describe("SWIFT_TYPE_MAP", () => {
  it("maps all primitive types", () => {
    expect(SWIFT_TYPE_MAP.string).toBe("String");
    expect(SWIFT_TYPE_MAP.int).toBe("Int");
    expect(SWIFT_TYPE_MAP.double).toBe("Double");
    expect(SWIFT_TYPE_MAP.float).toBe("Float");
    expect(SWIFT_TYPE_MAP.boolean).toBe("Bool");
    expect(SWIFT_TYPE_MAP.date).toBe("Date");
    expect(SWIFT_TYPE_MAP.duration).toBe("Measurement<UnitDuration>");
    expect(SWIFT_TYPE_MAP.url).toBe("URL");
  });
});

describe("irTypeToSwift", () => {
  it("converts primitive types", () => {
    expect(irTypeToSwift({ kind: "primitive", value: "string" })).toBe("String");
    expect(irTypeToSwift({ kind: "primitive", value: "int" })).toBe("Int");
    expect(irTypeToSwift({ kind: "primitive", value: "double" })).toBe("Double");
    expect(irTypeToSwift({ kind: "primitive", value: "float" })).toBe("Float");
    expect(irTypeToSwift({ kind: "primitive", value: "boolean" })).toBe("Bool");
    expect(irTypeToSwift({ kind: "primitive", value: "date" })).toBe("Date");
    expect(irTypeToSwift({ kind: "primitive", value: "url" })).toBe("URL");
  });

  it("converts array types", () => {
    const arrayType: IRType = {
      kind: "array",
      elementType: { kind: "primitive", value: "string" },
    };
    expect(irTypeToSwift(arrayType)).toBe("[String]");
  });

  it("converts optional types", () => {
    const optionalType: IRType = {
      kind: "optional",
      innerType: { kind: "primitive", value: "int" },
    };
    expect(irTypeToSwift(optionalType)).toBe("Int?");
  });

  it("converts entity types", () => {
    const entityType: IRType = {
      kind: "entity",
      entityName: "Contact",
      properties: [],
    };
    expect(irTypeToSwift(entityType)).toBe("Contact");
  });

  it("converts enum types", () => {
    const enumType: IRType = {
      kind: "enum",
      name: "Priority",
      cases: ["low", "medium", "high"],
    };
    expect(irTypeToSwift(enumType)).toBe("Priority");
  });

  it("converts nested types (optional array)", () => {
    const nestedType: IRType = {
      kind: "optional",
      innerType: {
        kind: "array",
        elementType: { kind: "primitive", value: "string" },
      },
    };
    expect(irTypeToSwift(nestedType)).toBe("[String]?");
  });
});

describe("isPrimitiveType", () => {
  it("returns true for all valid primitive types", () => {
    for (const t of [
      "string",
      "int",
      "double",
      "float",
      "boolean",
      "date",
      "duration",
      "url",
    ]) {
      expect(isPrimitiveType(t)).toBe(true);
    }
  });

  it("returns false for unknown types", () => {
    expect(isPrimitiveType("number")).toBe(false);
    expect(isPrimitiveType("String")).toBe(false);
    expect(isPrimitiveType("")).toBe(false);
    expect(isPrimitiveType("object")).toBe(false);
  });
});

describe("isSceneKind", () => {
  it("returns true for valid scene kinds", () => {
    for (const k of ["windowGroup", "window", "documentGroup", "settings"]) {
      expect(isSceneKind(k)).toBe(true);
    }
  });

  it("returns false for invalid scene kinds", () => {
    expect(isSceneKind("tabGroup")).toBe(false);
    expect(isSceneKind("")).toBe(false);
    expect(isSceneKind("WindowGroup")).toBe(false);
  });
});
