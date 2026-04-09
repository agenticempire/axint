import { describe, it, expect } from "vitest";
import {
  getTemplate,
  listTemplates,
  templates,
  TEMPLATES,
} from "../../src/templates/index.js";

describe("templates registry", () => {
  it("TEMPLATES contains the bundled reference set", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it("legacy `templates` export is an alias for TEMPLATES", () => {
    expect(templates).toBe(TEMPLATES);
  });

  it("every template has a stable shape", () => {
    for (const t of TEMPLATES) {
      expect(t.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.domain.length).toBeGreaterThan(0);
      expect(t.category.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.source).toContain("defineIntent");
      expect(t.source).toContain("import");
    }
  });

  it("template ids are unique", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getTemplate returns undefined for a nonexistent id", () => {
    expect(getTemplate("does-not-exist")).toBeUndefined();
  });

  it("getTemplate finds a bundled template by id", () => {
    const t = getTemplate("send-message");
    expect(t).toBeDefined();
    expect(t?.domain).toBe("messaging");
  });

  it("listTemplates() returns every template when no category is given", () => {
    expect(listTemplates().length).toBe(TEMPLATES.length);
  });

  it("listTemplates('messaging') filters by category", () => {
    const msgs = listTemplates("messaging");
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.every((t) => t.category === "messaging")).toBe(true);
  });
});
