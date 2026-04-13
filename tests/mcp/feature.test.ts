import { describe, it, expect } from "vitest";
import { generateFeature } from "../../src/mcp/feature.js";
import { suggestFeatures } from "../../src/mcp/suggest.js";

describe("axint.feature", () => {
  it("generates intent from natural language description", () => {
    const result = generateFeature({
      description: "Let users log water intake via Siri",
    });

    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);

    const intentFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("Intent")
    );
    expect(intentFile).toBeDefined();
    expect(intentFile!.content).toContain("AppIntent");

    const testFile = result.files.find((f) => f.type === "test");
    expect(testFile).toBeDefined();
    expect(testFile!.content).toContain("XCTestCase");
  });

  it("generates intent + widget when both surfaces requested", () => {
    const result = generateFeature({
      description: "Track daily step count",
      surfaces: ["intent", "widget"],
    });

    expect(result.success).toBe(true);

    const swiftFiles = result.files.filter((f) => f.type === "swift");
    expect(swiftFiles.length).toBe(2);

    const widgetFile = swiftFiles.find((f) => f.path.includes("Widget"));
    expect(widgetFile).toBeDefined();
    expect(widgetFile!.content).toContain("Widget");
  });

  it("generates all three surfaces", () => {
    const result = generateFeature({
      description: "Log workouts with type and duration",
      surfaces: ["intent", "widget", "view"],
    });

    expect(result.success).toBe(true);

    const swiftFiles = result.files.filter((f) => f.type === "swift");
    expect(swiftFiles.length).toBe(3);
  });

  it("infers health domain from description", () => {
    const result = generateFeature({
      description: "Let users log calories burned during exercise",
    });

    expect(result.success).toBe(true);
    // health domain should add HealthKit entitlements
    const entFile = result.files.find((f) => f.type === "entitlements");
    expect(entFile).toBeDefined();
    expect(entFile!.content).toContain("healthkit");
  });

  it("uses explicit params when provided", () => {
    const result = generateFeature({
      description: "Log a custom metric",
      params: { value: "double", label: "string", timestamp: "date" },
    });

    expect(result.success).toBe(true);
    const intentFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("Intent")
    );
    expect(intentFile).toBeDefined();
    expect(intentFile!.content).toContain("value");
    expect(intentFile!.content).toContain("label");
    expect(intentFile!.content).toContain("timestamp");
  });

  it("uses explicit name when provided", () => {
    const result = generateFeature({
      description: "Track water intake",
      name: "HydrateNow",
    });

    expect(result.success).toBe(true);
    expect(result.name).toBe("HydrateNow");
    const intentFile = result.files.find((f) => f.path.includes("Intent"));
    expect(intentFile!.path).toContain("HydrateNow");
  });

  it("includes structured file paths for Xcode agent composition", () => {
    const result = generateFeature({
      description: "Send a message to a contact",
      surfaces: ["intent"],
    });

    expect(result.success).toBe(true);
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith("Sources/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("Tests/"))).toBe(true);
  });

  it("generates summary with file listing", () => {
    const result = generateFeature({
      description: "Create a reminder",
      surfaces: ["intent", "widget"],
    });

    expect(result.summary).toContain("Generated");
    expect(result.summary).toContain("Swift file");
    expect(result.summary).toContain("test");
    expect(result.summary).toContain("Files:");
  });
});

describe("axint.suggest", () => {
  it("suggests health features for a fitness app", () => {
    const suggestions = suggestFeatures({
      appDescription: "A fitness tracking app that logs workouts and counts steps",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("health");
    expect(suggestions[0].surfaces.length).toBeGreaterThan(0);
    expect(suggestions[0].featurePrompt).toBeTruthy();
  });

  it("suggests finance features for a budget app", () => {
    const suggestions = suggestFeatures({
      appDescription: "An app for tracking expenses and managing budgets",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("finance");
  });

  it("respects explicit domain", () => {
    const suggestions = suggestFeatures({
      appDescription: "A general utility app",
      domain: "smart-home",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("smart-home");
  });

  it("respects limit", () => {
    const suggestions = suggestFeatures({
      appDescription: "A fitness and health tracking app",
      limit: 3,
    });

    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("falls back to productivity for vague descriptions", () => {
    const suggestions = suggestFeatures({
      appDescription: "An app that helps users be more organized",
    });

    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("each suggestion has all required fields", () => {
    const suggestions = suggestFeatures({
      appDescription: "A recipe and cooking app",
    });

    for (const s of suggestions) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.surfaces.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(s.complexity);
      expect(s.featurePrompt).toBeTruthy();
      expect(s.domain).toBeTruthy();
    }
  });
});
