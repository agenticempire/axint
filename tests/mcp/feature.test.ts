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
    expect(widgetFile!.content.match(/\blet date: Date\b/g)).toHaveLength(1);
    expect(widgetFile!.content).not.toContain("date: Date(), date:");
    expect(widgetFile!.content).not.toContain("WidgetWidget");
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

  it("does not infer a generic input parameter for read-only query intents", () => {
    const result = generateFeature({
      description: "Check how many matches are waiting",
      surfaces: ["intent"],
      name: "CheckMatches",
    });

    expect(result.success).toBe(true);
    const intentFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("Intent")
    );
    expect(intentFile).toBeDefined();
    expect(intentFile!.content).not.toContain("@Parameter");
    expect(intentFile!.content).not.toContain("var input");
  });

  it("does not add HealthKit artifacts to non-health features just because domain is stale", () => {
    const result = generateFeature({
      description: "Check how many matches are waiting",
      surfaces: ["intent", "widget"],
      name: "CheckMatches",
      domain: "health",
    });

    expect(result.success).toBe(true);
    expect(result.files.find((f) => f.type === "entitlements")).toBeUndefined();
    expect(result.files.find((f) => f.type === "plist")).toBeUndefined();
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

    expect(result.summary).toContain("Generated scaffold");
    expect(result.summary).toContain("Swift file");
    expect(result.summary).toContain("test");
    expect(result.summary).toContain("starter scaffolds");
    expect(result.summary).toContain("Files:");
  });

  it("accepts a macOS platform hint for starter SwiftUI views", () => {
    const result = generateFeature({
      description: "Track daily water intake",
      surfaces: ["view"],
      platform: "macOS",
    });

    const viewFile = result.files.find((f) => f.path.includes("View"));
    expect(viewFile).toBeDefined();
    expect(result.summary).toContain("Platform: macOS");
    expect(viewFile!.content).not.toContain("NavigationStack");
  });

  it("uses the description instead of a stale health domain for dating profile views", () => {
    const result = generateFeature({
      description:
        "A SwiftUI view showing a dating profile card with the person's photo, name, age, bio, and workout preferences. Has swipe left and right gesture support.",
      surfaces: ["view"],
      name: "SwipeProfileView",
      domain: "health",
      platform: "macOS",
    });

    expect(result.success).toBe(true);
    const viewFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("SwipeProfileView")
    );
    expect(viewFile).toBeDefined();
    expect(viewFile!.path).toBe("Sources/Views/SwipeProfileView.swift");
    expect(viewFile!.content).toContain("struct SwipeProfileView: View");
    expect(viewFile!.content).toContain("photoURL");
    expect(viewFile!.content).toContain("workoutPreferences");
    expect(viewFile!.content).not.toContain("SwipeProfileViewView");
    expect(viewFile!.content).not.toContain('duration: Measurement<UnitDuration> = ""');
    expect(viewFile!.content).not.toContain("calories");
    expect(result.files.find((f) => f.type === "entitlements")).toBeUndefined();
    expect(result.files.find((f) => f.type === "plist")).toBeUndefined();
    expect(
      result.files.find((f) => f.path === "Tests/SwipeProfileViewTests.swift")
    ).toBeDefined();
  });

  it("does not duplicate surface suffixes in feature output paths or structs", () => {
    const view = generateFeature({
      description: "Show a profile card",
      surfaces: ["view"],
      name: "ProfileCardView",
    });
    const widget = generateFeature({
      description: "Show today's suggested match",
      surfaces: ["widget"],
      name: "DailySwolemateWidget",
    });

    expect(view.files.map((f) => f.path).join("\n")).not.toContain("ViewView");
    expect(view.files.find((f) => f.type === "swift")!.content).not.toContain("ViewView");
    expect(widget.files.map((f) => f.path).join("\n")).not.toContain("WidgetWidget");
    expect(widget.files.find((f) => f.type === "swift")!.content).not.toContain(
      "WidgetWidget"
    );
  });

  it("generates a Swarm-style three-pane macOS shell from the description", () => {
    const result = generateFeature({
      description:
        "A three-pane layout with a 56px sidebar rail, 244px channels column, a flex content area for Swarm agent activity, and a 308px right Project Context pane.",
      surfaces: ["view"],
      name: "SwarmShellView",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    const viewFile = result.files.find((f) => f.type === "swift");
    expect(viewFile).toBeDefined();
    expect(viewFile!.content).toContain("HStack(spacing: 0)");
    expect(viewFile!.content).toContain("SwarmTokens.Layout.sidebarRail");
    expect(viewFile!.content).toContain("SwarmTokens.Layout.channelsColumn");
    expect(viewFile!.content).toContain("SwarmTokens.Layout.rightContextPane");
    expect(viewFile!.content).toContain("NORTH_STAR.md");
    expect(viewFile!.content).toContain(".frame(maxWidth: .infinity");
  });

  it("renames reserved SwiftUI state names in generated views", () => {
    const result = generateFeature({
      description: "A messaging profile card",
      surfaces: ["view"],
      name: "ProfileCardView",
      domain: "messaging",
      params: { body: "string", recipient: "string" },
    });

    const viewFile = result.files.find((f) => f.type === "swift");
    expect(viewFile).toBeDefined();
    expect(viewFile!.content).toContain("@State private var messageBody");
    expect(viewFile!.content).not.toContain("@State private var body");
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

  it("lets appDescription override a stale explicit health domain for dating apps", () => {
    const suggestions = suggestFeatures({
      appDescription: "Tinder-style fitness dating app for gym people",
      domain: "health",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("social");
    expect(suggestions[0].name).toMatch(/Match|Profile/);
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
