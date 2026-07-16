import { describe, expect, it } from "vitest";
import {
  evaluateAccessibilityNutritionLabels,
  renderAccessibilityNutritionLabelReport,
} from "../../src/apple/accessibility-labels.js";

describe("Accessibility Nutrition Label evidence", () => {
  it("claims a feature only when every common task has evidence", () => {
    const assessment = evaluateAccessibilityNutritionLabels({
      devices: ["iphone"],
      commonTasks: [
        { id: "login", title: "Log in" },
        { id: "create", title: "Create a project" },
      ],
      evidence: [
        {
          taskId: "login",
          device: "iphone",
          feature: "voiceOver",
          status: "pass",
          artifact: "xcresult://login-voiceover",
        },
        {
          taskId: "create",
          device: "iphone",
          feature: "voiceOver",
          status: "pass",
          artifact: "xcresult://create-voiceover",
        },
      ],
    });

    expect(
      assessment.features.find((feature) => feature.feature === "voiceOver")?.claimable
    ).toBe(true);
    expect(
      assessment.features.find((feature) => feature.feature === "voiceControl")?.claimable
    ).toBe(false);
  });

  it("renders missing and failed proof without overclaiming", () => {
    const assessment = evaluateAccessibilityNutritionLabels({
      devices: ["ipad"],
      commonTasks: [
        { id: "login", title: "Log in" },
        { id: "purchase", title: "Upgrade" },
      ],
      evidence: [
        {
          taskId: "login",
          device: "ipad",
          feature: "largerText",
          status: "pass",
        },
        {
          taskId: "purchase",
          device: "ipad",
          feature: "largerText",
          status: "fail",
        },
      ],
    });

    const report = renderAccessibilityNutritionLabelReport(assessment);
    expect(report).toContain("Larger Text: not ready");
    expect(report).toContain("Failed tasks: purchase");
    expect(report).toContain("VoiceOver: not ready");
    expect(report).toContain("Missing evidence: login, purchase");
  });
});
