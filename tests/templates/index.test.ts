import { describe, it, expect } from "vitest";
import {
  getTemplate,
  listTemplates,
  templates,
  TEMPLATES,
} from "../../src/templates/index.js";
import { compileSource } from "../../src/core/compiler.js";

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

  it("Foundation Models tool template includes tool-calling and transcript proof cues", () => {
    const t = getTemplate("foundation-model-tool");

    expect(t?.source).toContain("struct AppDataTool: Tool");
    expect(t?.source).toContain("LanguageModelSession(tools:");
    expect(t?.source).toContain("promptVersion");
    expect(t?.source).toContain("session.transcript");
    expect(t?.source).toContain("redactSensitiveFields");
  });

  it("listTemplates() returns every template when no category is given", () => {
    expect(listTemplates().length).toBe(TEMPLATES.length);
  });

  it("listTemplates('messaging') filters by category", () => {
    const msgs = listTemplates("messaging");
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.every((t) => t.category === "messaging")).toBe(true);
  });

  it("ships WWDC26 proof templates that compile", () => {
    const ids = [
      "appintents-testing-harness",
      "visual-intelligence-router",
      "image-playground-intent",
      "string-catalog-localizer",
      "resizable-layout-proof",
    ];

    for (const id of ids) {
      const template = getTemplate(id);
      expect(template, id).toBeDefined();

      const result = compileSource(template!.source, `${id}.ts`);
      expect(result.success, id).toBe(true);
      expect(result.output?.swiftCode, id).toContain("struct");
    }
  });

  it("ships Apple Intelligence runtime templates from WWDC26 updates", () => {
    const ids = [
      "multimodal-foundation-model",
      "custom-language-model-provider",
      "view-annotation-entity",
      "spotlight-semantic-index",
      "image-playground-pcc",
      "ocr-vision-tool",
      "barcode-vision-tool",
    ];

    for (const id of ids) {
      const template = getTemplate(id);
      expect(template, id).toBeDefined();

      const result = compileSource(template!.source, `${id}.ts`);
      expect(result.success, id).toBe(true);
      expect(result.output?.swiftCode, id).toContain("struct");
    }
  });

  it("ships WWDC26 provider fallback and testing-harness templates that compile", () => {
    const ids = [
      "foundation-models-custom-provider",
      "app-intents-testing-harness",
      "dynamic-profile-session",
    ];

    for (const id of ids) {
      const template = getTemplate(id);
      expect(template, id).toBeDefined();

      const result = compileSource(template!.source, `${id}.ts`);
      expect(result.success, id).toBe(true);
      expect(result.output?.swiftCode, id).toContain("struct");
    }

    const harness = compileSource(
      getTemplate("app-intents-testing-harness")!.source,
      "app-intents-testing-harness.ts"
    );
    expect(harness.output?.swiftCode).toContain(
      "#if canImport(XCTest) && canImport(AppIntentsTesting)"
    );
    expect(harness.output?.swiftCode).toContain(
      "final class LogReadingSessionIntentTests: XCTestCase"
    );

    const provider = compileSource(
      getTemplate("foundation-models-custom-provider")!.source,
      "foundation-models-custom-provider.ts"
    );
    expect(provider.output?.swiftCode).toContain("HouseLanguageModel");
    expect(provider.output?.swiftCode).toContain("onDeviceFallback");
  });
});
