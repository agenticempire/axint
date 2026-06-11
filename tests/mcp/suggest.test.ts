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

  it("routes viral product hierarchy passes away from generic Magic Pass controls", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Viral-product hierarchy pass after product notes: rename the installed app display name back to Cadabra, make 'The photo they would actually post.' the launch promise, reorganize presets into Better, Outfit, and Wild lanes, make Better the default surface, simplify Magic Pass into public Magic Level, hide advanced dogfood controls behind the version triple-tap, add result feedback buttons Love, Not me, Too fake, and Worse, and rewrite the Gemini Nano Banana prompt contract around identity lock, visible portrait cleanup, outfit-only transformations, and Wild-only scene replacement.",
      platform: "iOS",
      limit: 4,
    });

    expect(suggestions[0]?.domain).toBe("product-hierarchy");
    expect(suggestions[0]?.name).toContain("Public Hierarchy");
    expect(suggestions[0]?.featurePrompt).toContain("launch promise");
    expect(suggestions[0]?.featurePrompt).toContain("Better");
    expect(suggestions[0]?.featurePrompt).toContain("Outfit");
    expect(suggestions[0]?.featurePrompt).toContain("Wild");
    expect(suggestions[0]?.featurePrompt).toContain("Magic Level");
    expect(suggestions.map((suggestion) => suggestion.name).join("\n")).toContain(
      "Result Feedback Loop"
    );
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain(
      "additive-feature"
    );
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

  it("routes provider-output rescue passes into provider repair mode", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Rescue pass after live friend testing: stronger Gemini Nano Banana prompt contract, identity-safe skin cleanup, fine-line cleanup, under-eye cleanup, no near-duplicate output, history/share routing, share-card export typography, and provider-output quality semantics for Cadabra.",
      platform: "iOS",
      limit: 4,
    });

    expect(suggestions[0]?.domain).toBe("repair");
    expect(suggestions[0]?.rationale).toContain("provider-behavior");
    expect(suggestions[0]?.featurePrompt).toContain("provider behavior");
    expect(suggestions[0]?.featurePrompt).toContain("provider prompt");
    expect(suggestions[0]?.featurePrompt).toContain("provider output quality");
    expect(suggestions[0]?.featurePrompt).not.toContain("Capture Rescue");
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain("custom");
  });

  it("keeps weak glow-up output repair out of new app-surface mode", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Cadabra 10/10 Glow-Up leaves the face mostly unchanged and sometimes turns the real background into fantasy or cosmic scenes. Fix the provider output quality semantics and provider prompt contract; do not create a new Siri command.",
      platform: "iOS",
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("repair");
    expect(suggestions[0]?.rationale).toContain("provider-behavior");
    expect(suggestions[0]?.featurePrompt).toContain("background preservation");
    expect(suggestions[0]?.featurePrompt).not.toContain("Siri");
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain("custom");
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

  it("routes Axint dogfood atom fixes to tooling repair instead of app-provider repair", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Fix Axint dogfood atoms from Cadabra without touching Cadabra: route non-Apple artifacts away from fake AX001 diagnostics, keep MCP version metadata current, classify release/preflight/provider-output repair loops correctly, and prevent generic feature scaffolds for product-specific preset-library requests.",
      platform: "iOS",
      limit: 3,
    });

    expect(suggestions[0]?.domain).toBe("axint-dogfood");
    expect(suggestions[0]?.featurePrompt).toContain("Cloud Check");
    expect(suggestions[0]?.featurePrompt).toContain("non-Apple artifacts");
    expect(suggestions[0]?.featurePrompt).toContain("provider-output words");
    expect(suggestions.map((suggestion) => suggestion.name).join("\n")).toContain(
      "Version Truth Guard"
    );
    expect(suggestions.map((suggestion) => suggestion.domain)).not.toContain("repair");
    expect(suggestions[0]?.name).not.toContain("Repair Existing");
  });
});

describe("stock domain matching for consumer phrases", () => {
  const cases: Array<{ prompt: string; domain: string }> = [
    { prompt: "habit tracker with streaks and a home screen widget", domain: "health" },
    { prompt: "todo list app with tasks and reminders", domain: "productivity" },
    { prompt: "budget app to track expenses and spending", domain: "finance" },
    { prompt: "sleep tracker that also logs workouts", domain: "health" },
    { prompt: "note taking app with a calendar and deadlines", domain: "productivity" },
  ];

  for (const { prompt, domain } of cases) {
    it(`matches "${prompt}" to the ${domain} domain`, () => {
      const suggestions = suggestFeatures({ appDescription: prompt, limit: 5 });
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]?.domain).toBe(domain);
      expect(
        suggestions.filter((s) => s.domain === domain).length
      ).toBeGreaterThanOrEqual(2);
    });

    it(`gives every suggestion for "${prompt}" its own rationale`, () => {
      const suggestions = suggestFeatures({ appDescription: prompt, limit: 5 });
      const rationales = suggestions.map((s) => s.rationale);
      expect(new Set(rationales).size).toBe(rationales.length);
    });
  }
});
