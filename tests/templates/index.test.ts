import { describe, it, expect } from "vitest";
import { getTemplate, listTemplates, templates } from "../../src/templates/index.js";

describe("templates registry", () => {
  it("templates array is empty by default", () => {
    expect(templates).toEqual([]);
  });

  it("getTemplate returns undefined for nonexistent id", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  it("listTemplates returns empty array when no templates exist", () => {
    expect(listTemplates()).toEqual([]);
  });

  it("listTemplates with category filter returns empty array", () => {
    expect(listTemplates("messaging")).toEqual([]);
  });
});
