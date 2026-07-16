import { describe, expect, it } from "vitest";
import {
  generateEvaluationsScaffold,
  generateFoundationModelsSessionScaffold,
} from "../../src/apple/foundation-models.js";

describe("Foundation Models scaffolds", () => {
  it("generates on-device and seeded Private Cloud Compute paths", () => {
    const swift = generateFoundationModelsSessionScaffold({
      profileName: "SearchAssistantProfile",
      tools: ["SpotlightSearchTool"],
      allowPrivateCloudCompute: true,
    });

    expect(swift).toContain("import FoundationModels");
    expect(swift).toContain("PrivateCloudComputeLanguageModel");
    expect(swift).toContain(
      "GenerationOptions(samplingMode: .randomThreshold(0.95, seed: 42))"
    );
    expect(swift).not.toContain("targetEnvironment(simulator)");
    expect(swift).toContain("SpotlightSearchTool");
  });

  it("generates evaluation scaffolds for tool-calling safety", () => {
    const swift = generateEvaluationsScaffold({
      suiteName: "SearchAssistantEvaluations",
      maxToolCalls: 3,
    });

    expect(swift).toContain("import Evaluations");
    expect(swift).toContain("SearchAssistantEvaluations");
    expect(swift).toContain("maxToolCalls");
  });
});
