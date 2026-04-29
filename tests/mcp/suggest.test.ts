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
});
