import { describe, expect, it } from "vitest";
import { buildFixPacket } from "../../src/repair/fix-packet.js";
import { buildCheckSummary } from "../../src/repair/check-summary.js";
import { renderRepairArtifactLines } from "../../src/repair/repair-artifacts.js";

describe("repair artifact terminal lines", () => {
  function buildArtifacts() {
    const packet = buildFixPacket({
      success: true,
      surface: "intent",
      diagnostics: [
        {
          code: "AX118",
          severity: "warning",
          message: "Use Apple's real HealthKit usage-description keys.",
          suggestion:
            "Replace HealthUsageDescription with NSHealthShareUsageDescription and/or NSHealthUpdateUsageDescription.",
        },
      ],
      source: "export default defineIntent({ name: 'HealthReview' });",
      fileName: "health-review.ts",
      filePath: "/tmp/health-review.ts",
      language: "typescript",
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    });

    const summary = buildCheckSummary(packet);

    return {
      packet: {
        packet,
        packetDir: "/tmp",
        jsonPath: "/tmp/latest.json",
        markdownPath: "/tmp/latest.md",
      },
      check: {
        summary,
        jsonPath: "/tmp/latest.check.json",
        markdownPath: "/tmp/latest.check.md",
      },
    };
  }

  it("promotes login in the anonymous terminal report", () => {
    const lines = renderRepairArtifactLines(buildArtifacts(), { signedIn: false });
    const text = lines.join("\n");

    expect(text).toContain("Axint Check");
    expect(text).toContain("Fix Packet");
    expect(text).toContain("axint login");
    expect(text).toContain("fuller repair summaries");
    expect(text).toContain("saved runs");
    expect(text).toContain("shareable links");
  });

  it("shows the richer signed-in summary in terminal output", () => {
    const lines = renderRepairArtifactLines(buildArtifacts(), { signedIn: true });
    const text = lines.join("\n");

    expect(text).toContain("Signed in");
    expect(text).toContain("Needs review");
    expect(text).toContain("AX118");
    expect(text).toContain("Next:");
  });
});
