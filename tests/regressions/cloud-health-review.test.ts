import { describe, expect, it } from "vitest";

import { compileSource } from "../../src/core/compiler.js";
import { buildFixPacket } from "../../src/repair/fix-packet.js";

const CLOUD_HEALTH_REVIEW_SOURCE = `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "LogWater",
  title: "Log Water Intake",
  description: "Records a serving of water to the health journal",
  domain: "health",
  entitlements: ["healthkit.write"],
  infoPlistKeys: {
    HealthUsageDescription: "Logs water intake",
  },
  params: {
    amountMl: param.number("How many milliliters", { default: 250 }),
    note: param.string("Optional note", { default: "" }),
  },
  perform: async ({ amountMl, note }) => {
    return { amountMl, note, loggedAt: new Date().toISOString() };
  },
});
`;

describe("Cloud failure regressions", () => {
  it("keeps the Health review demo failure actionable in the compiler loop", () => {
    const result = compileSource(CLOUD_HEALTH_REVIEW_SOURCE, "log-water-review.ts", {
      emitInfoPlist: true,
      emitEntitlements: true,
    });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.success).toBe(true);
    expect(codes).toContain("AX117");
    expect(codes).toContain("AX118");
    expect(codes).toContain("AX114");

    const packet = buildFixPacket({
      success: result.success,
      surface: "intent",
      fileName: "log-water-review.ts",
      source: CLOUD_HEALTH_REVIEW_SOURCE,
      diagnostics: result.diagnostics,
      outputPath: result.output?.outputPath,
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    });

    expect(packet.outcome.verdict).toBe("needs_review");
    expect(packet.ai.prompt).toContain("com.apple.developer.healthkit");
    expect(packet.ai.prompt).toContain("NSHealthShareUsageDescription");
  });
});
