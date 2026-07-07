import { describe, expect, it } from "vitest";
import {
  generateEvaluationsScaffold,
  generateFoundationModelsSessionScaffold,
} from "../../src/apple/foundation-models.js";

describe("Foundation Models scaffolds", () => {
  it("generates availability guards for on-device and Private Cloud Compute paths", () => {
    const swift = generateFoundationModelsSessionScaffold({
      profileName: "SearchAssistantProfile",
      tools: ["SpotlightSearchTool"],
      allowPrivateCloudCompute: true,
    });

    expect(swift).toContain("import FoundationModels");
    expect(swift).toContain("PrivateCloudComputeLanguageModel");
    expect(swift).toContain("#if targetEnvironment(simulator)");
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
