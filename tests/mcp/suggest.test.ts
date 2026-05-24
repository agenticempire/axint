import { describe, expect, it } from "vitest";
import { suggestFeatures } from "../../src/mcp/suggest.js";

describe("axint.suggest", () => {
  it("routes existing SwiftUI input bugs into proof-first repair suggestions", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Existing SwiftUI home feed bug: the comment box is visible but after adding a feature I cannot tap it, focus it, or type into it anymore.",
      platform: "iOS",
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("repair");
    expect(suggestions[0]?.name).toContain("Repair Existing");
    expect(suggestions[0]?.rationale).toContain("swiftui-input-interaction");
    expect(suggestions[0]?.featurePrompt).toContain("existing iOS Apple repair");
    expect(suggestions[0]?.featurePrompt).toContain("Inspect first");
    expect(suggestions.map((suggestion) => suggestion.name).join("\n")).toContain(
      "Trace Input Interaction Blockers"
    );
    expect(suggestions[0]?.featurePrompt).not.toContain("Create a new");
  });

  it("lets fresh public-lander prompts override stale repair context", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Build the Axint project profile into a custom .axint-powered public lander with programmable modules, share cards, install QR blocks, email capture, safe customization, preserved UI test identifiers, and older repair notes about accessibility, Capture, and reduced motion.",
      platform: "macOS",
      limit: 4,
    });

    expect(suggestions[0]?.domain).toBe("public-page");
    expect(suggestions[0]?.name).toContain("Public Lander");
    expect(suggestions[0]?.featurePrompt).toContain(".axint page manifest");
    expect(suggestions[0]?.featurePrompt).toContain("share card");
    expect(suggestions[0]?.rationale).toContain("Mode trace");
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain("repair");
  });

  it("treats premium landing-page and share-card prompts as product design work", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "SWARM macOS SwiftUI: make the Axint public project page a premium custom startup landing page, customize share cards, preserve accessibility IDs, and remove orange from Nima's profile identity.",
      platform: "macOS",
      domain: "developer-tools",
      goals: ["premium public project page", "shareable launch card"],
      stage: "mvp",
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("public-page");
    expect(suggestions[0]?.featurePrompt).toContain("ProjectShowcaseView");
    expect(suggestions[0]?.featurePrompt).toContain("ShareComposerView");
    expect(suggestions[0]?.rationale).toContain("Mode trace");
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain("repair");
  });

  it("routes brand-asset repair prompts to provenance and visual proof", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "SWARM macOS project network app needs the official Axint symbol mark from axint.ai on Axint project surfaces while keeping the wordmark cover where appropriate",
      platform: "macOS",
      goals: ["brand accuracy", "premium project page"],
      constraints: ["do not use the wrong hand-drawn symbol"],
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("brand-polish");
    expect(suggestions[0]?.featurePrompt).toContain("asset provenance");
    expect(suggestions[0]?.featurePrompt).toContain("visual proof");
    expect(suggestions[0]?.rationale).toContain("Mode trace");
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain(
      "collaboration"
    );
  });

  it("keeps additive Magic Pass controls out of stale repair mode", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Add a new Magic Pass control surface to Cadabra with model tier Fast/Pro/Perfect, magic strength Natural/Strong/Extreme, glow-up pass, backdrop pass, and creative direction. This is new additive product work, not a scroll or layout repair.",
      platform: "iOS",
      goals: ["new generation controls", "provider routing"],
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("additive-feature");
    expect(suggestions[0]?.name).toContain("Magic Pass");
    expect(suggestions[0]?.featurePrompt).toContain("Fast, Pro, Perfect");
    expect(suggestions[0]?.featurePrompt).toContain("glow-up");
    expect(suggestions[0]?.featurePrompt).not.toContain("Live/Events");
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain("repair");
  });

  it("classifies image-provider identity drift as provider repair instead of runtime freeze", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Cadabra provider prompt-quality repair: Gemini/Nano Banana changes identity, face shape, head shape, hairline, beard, and clothing when glow-up or background replacement is strong. This is provider behavior semantics, not a runtime freeze.",
      platform: "iOS",
      constraints: ["preserve identity", "do not collect a freeze sample"],
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("repair");
    expect(suggestions[0]?.rationale).toContain("provider-behavior");
    expect(suggestions[0]?.featurePrompt).toContain("provider behavior");
    expect(suggestions[0]?.featurePrompt).toContain("provider prompt");
    expect(suggestions[0]?.featurePrompt).not.toContain("sample <AppProcessName>");
  });

  it("routes TestFlight metadata failures into release preflight instead of new command surfaces", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "TestFlight prep failed because App Store Connect has no app record for bundle ID cam.cadabra.Cadabra. Repair exportOptions-testflight.plist and release metadata preflight. This is not a new command surface.",
      platform: "iOS",
      constraints: ["do not generate Siri commands", "use archive/export evidence"],
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("release-preflight");
    expect(suggestions[0]?.name).toContain("Preflight");
    expect(suggestions[0]?.featurePrompt).toContain("App Store Connect app record");
    expect(suggestions[0]?.featurePrompt).toContain("exportOptions plist");
    expect(suggestions[0]?.featurePrompt).not.toContain("Capture Testflight");
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain("custom");
  });
});
