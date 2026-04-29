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
});
