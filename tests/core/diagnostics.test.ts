import { describe, it, expect } from "vitest";
import {
  getDiagnostic,
  getCodesByCategory,
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_COUNT,
} from "../../src/core/diagnostics.js";

describe("getDiagnostic", () => {
  it("returns diagnostic info for valid code", () => {
    const diag = getDiagnostic("AX001");
    expect(diag).toBeDefined();
    expect(diag?.code).toBe("AX001");
    expect(diag?.severity).toBe("error");
    expect(diag?.message).toBe("No defineIntent() call found");
    expect(diag?.category).toBe("intent-parser");
  });

  it("returns undefined for unknown code", () => {
    const diag = getDiagnostic("UNKNOWN");
    expect(diag).toBeUndefined();
  });

  it("retrieves all intent parser codes", () => {
    const ax001 = getDiagnostic("AX001");
    const ax002 = getDiagnostic("AX002");
    const ax008 = getDiagnostic("AX008");
    expect(ax001?.category).toBe("intent-parser");
    expect(ax002?.category).toBe("intent-parser");
    expect(ax008?.category).toBe("intent-parser");
  });

  it("retrieves all intent validator codes", () => {
    const ax100 = getDiagnostic("AX100");
    const ax107 = getDiagnostic("AX107");
    expect(ax100?.category).toBe("intent-validator");
    expect(ax107?.category).toBe("intent-validator");
  });

  it("retrieves entity parser codes", () => {
    const ax015 = getDiagnostic("AX015");
    const ax022 = getDiagnostic("AX022");
    expect(ax015?.category).toBe("entity-parser");
    expect(ax022?.category).toBe("intent-parser");
  });

  it("retrieves entity validator codes", () => {
    const ax110 = getDiagnostic("AX110");
    const ax111 = getDiagnostic("AX111");
    expect(ax110?.category).toBe("entity-validator");
    expect(ax111?.category).toBe("entity-validator");
  });

  it("retrieves generator codes", () => {
    const ax200 = getDiagnostic("AX200");
    const ax202 = getDiagnostic("AX202");
    expect(ax200?.category).toBe("intent-generator");
    expect(ax202?.category).toBe("intent-generator");
  });

  it("retrieves view parser codes", () => {
    const ax301 = getDiagnostic("AX301");
    const ax309 = getDiagnostic("AX309");
    expect(ax301?.category).toBe("view-parser");
    expect(ax309?.category).toBe("view-parser");
  });

  it("retrieves view validator codes", () => {
    const ax310 = getDiagnostic("AX310");
    const ax322 = getDiagnostic("AX322");
    expect(ax310?.category).toBe("view-validator");
    expect(ax322?.category).toBe("view-generator");
  });

  it("retrieves widget codes", () => {
    const ax401 = getDiagnostic("AX401");
    const ax415 = getDiagnostic("AX415");
    expect(ax401?.category).toBe("widget-parser");
    expect(ax415?.category).toBe("widget-validator");
  });

  it("retrieves app codes", () => {
    const ax501 = getDiagnostic("AX501");
    const ax522 = getDiagnostic("AX522");
    expect(ax501?.category).toBe("app-parser");
    expect(ax522?.category).toBe("app-generator");
  });
});

describe("getCodesByCategory", () => {
  it("returns all intent-parser codes", () => {
    const codes = getCodesByCategory("intent-parser");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "intent-parser")).toBe(true);
    expect(codes.map((c) => c.code)).toContain("AX001");
    expect(codes.map((c) => c.code)).toContain("AX007");
  });

  it("returns all intent-validator codes", () => {
    const codes = getCodesByCategory("intent-validator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "intent-validator")).toBe(true);
  });

  it("returns all entity-parser codes", () => {
    const codes = getCodesByCategory("entity-parser");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "entity-parser")).toBe(true);
  });

  it("returns all entity-validator codes", () => {
    const codes = getCodesByCategory("entity-validator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "entity-validator")).toBe(true);
  });

  it("returns all intent-generator codes", () => {
    const codes = getCodesByCategory("intent-generator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "intent-generator")).toBe(true);
  });

  it("returns all view-parser codes", () => {
    const codes = getCodesByCategory("view-parser");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "view-parser")).toBe(true);
  });

  it("returns all view-validator codes", () => {
    const codes = getCodesByCategory("view-validator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "view-validator")).toBe(true);
  });

  it("returns all view-generator codes", () => {
    const codes = getCodesByCategory("view-generator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "view-generator")).toBe(true);
  });

  it("returns all widget-parser codes", () => {
    const codes = getCodesByCategory("widget-parser");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "widget-parser")).toBe(true);
  });

  it("returns all widget-validator codes", () => {
    const codes = getCodesByCategory("widget-validator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "widget-validator")).toBe(true);
  });

  it("returns all widget-generator codes", () => {
    const codes = getCodesByCategory("widget-generator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "widget-generator")).toBe(true);
  });

  it("returns all app-parser codes", () => {
    const codes = getCodesByCategory("app-parser");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "app-parser")).toBe(true);
  });

  it("returns all app-validator codes", () => {
    const codes = getCodesByCategory("app-validator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "app-validator")).toBe(true);
  });

  it("returns all app-generator codes", () => {
    const codes = getCodesByCategory("app-generator");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c.category === "app-generator")).toBe(true);
  });

  it("returns empty array for unknown category", () => {
    const codes = getCodesByCategory("unknown-category");
    expect(codes).toEqual([]);
  });
});

describe("DIAGNOSTIC_CODES registry", () => {
  it("has correct count", () => {
    expect(Object.keys(DIAGNOSTIC_CODES).length).toBe(DIAGNOSTIC_COUNT);
  });

  it("has all required fields for each diagnostic", () => {
    Object.entries(DIAGNOSTIC_CODES).forEach(([_key, diag]) => {
      expect(diag.code).toBeDefined();
      expect(diag.severity).toMatch(/^(error|warning|info)$/);
      expect(typeof diag.message).toBe("string");
      expect(diag.message.length).toBeGreaterThan(0);
      expect(typeof diag.category).toBe("string");
      expect(diag.category.length).toBeGreaterThan(0);
    });
  });

  it("has intent parser range codes (AX000-AX099)", () => {
    expect(getDiagnostic("AX001")).toBeDefined();
    expect(getDiagnostic("AX008")).toBeDefined();
    expect(getDiagnostic("AX023")).toBeDefined();
  });

  it("has intent validator range codes (AX100-AX199)", () => {
    expect(getDiagnostic("AX100")).toBeDefined();
    expect(getDiagnostic("AX109")).toBeDefined();
    expect(getDiagnostic("AX118")).toBeDefined();
  });

  it("has intent generator range codes (AX200-AX299)", () => {
    expect(getDiagnostic("AX200")).toBeDefined();
    expect(getDiagnostic("AX202")).toBeDefined();
  });

  it("has view parser range codes (AX300-AX399)", () => {
    expect(getDiagnostic("AX301")).toBeDefined();
    expect(getDiagnostic("AX309")).toBeDefined();
  });

  it("has widget parser range codes (AX400-AX499)", () => {
    expect(getDiagnostic("AX401")).toBeDefined();
    expect(getDiagnostic("AX422")).toBeDefined();
  });

  it("has app parser range codes (AX500-AX599)", () => {
    expect(getDiagnostic("AX501")).toBeDefined();
    expect(getDiagnostic("AX522")).toBeDefined();
  });

  it("distinguishes error, warning, and info severities", () => {
    const errors = Object.values(DIAGNOSTIC_CODES).filter((d) => d.severity === "error");
    const warnings = Object.values(DIAGNOSTIC_CODES).filter(
      (d) => d.severity === "warning"
    );
    const infos = Object.values(DIAGNOSTIC_CODES).filter((d) => d.severity === "info");
    expect(errors.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(infos.length).toBeGreaterThan(0);
  });
});

describe("diagnostic code coverage", () => {
  it("has consistent category naming", () => {
    const categories = new Set(Object.values(DIAGNOSTIC_CODES).map((d) => d.category));
    const expectedCategories = [
      "intent-parser",
      "entity-parser",
      "intent-validator",
      "entity-validator",
      "intent-generator",
      "view-parser",
      "view-validator",
      "view-generator",
      "widget-parser",
      "widget-validator",
      "widget-generator",
      "app-parser",
      "app-validator",
      "app-generator",
    ];
    for (const cat of expectedCategories) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  it("has non-empty messages for all codes", () => {
    Object.values(DIAGNOSTIC_CODES).forEach((diag) => {
      expect(diag.message).toBeTruthy();
      expect(diag.message.length).toBeGreaterThan(0);
    });
  });

  it("maps all codes to their diagnostic info correctly", () => {
    const code = "AX104";
    const diag = getDiagnostic(code);
    expect(diag).toBeDefined();
    expect(diag?.code).toBe(code);
    expect(DIAGNOSTIC_CODES[code]).toBe(diag);
  });
});
