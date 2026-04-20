import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildCheckSummary,
  emitCheckSummaryArtifacts,
  renderCheckSummaryMarkdown,
} from "../../src/repair/check-summary.js";
import { buildFixPacket } from "../../src/repair/fix-packet.js";

describe("Check Summary", () => {
  it("builds a human-first summary from a Fix Packet", () => {
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
    const markdown = renderCheckSummaryMarkdown(summary);

    expect(summary.outcome.verdict).toBe("needs_review");
    expect(summary.nextAction).toContain("Review");
    expect(summary.packet.jsonPath).toBe("/tmp/latest.json");
    expect(markdown).toContain("# Axint Check");
    expect(markdown).toContain("AX118");
    expect(markdown).toContain("Fix Packet JSON: /tmp/latest.json");
  });

  it("writes summary artifacts next to the packet artifacts", () => {
    const packetRoot = mkdtempSync(join(tmpdir(), "axint-check-summary-"));
    const packet = buildFixPacket({
      success: false,
      surface: "swift",
      diagnostics: [
        {
          code: "AX701",
          severity: "error",
          message: "AppIntent is missing perform().",
          file: "/tmp/BrokenIntent.swift",
          line: 4,
          suggestion: "Add a perform() implementation that returns a result.",
        },
      ],
      source: "struct BrokenIntent: AppIntent {}",
      fileName: "BrokenIntent.swift",
      filePath: "/tmp/BrokenIntent.swift",
      language: "swift",
      packetJsonPath: join(packetRoot, "latest.json"),
      packetMarkdownPath: join(packetRoot, "latest.md"),
      command: "validate_swift",
    });

    const artifacts = emitCheckSummaryArtifacts(packet);
    const jsonText = readFileSync(artifacts.jsonPath, "utf-8");
    const markdownText = readFileSync(artifacts.markdownPath, "utf-8");

    expect(artifacts.jsonPath).toMatch(/latest\.check\.json$/);
    expect(jsonText).toContain('"verdict": "fail"');
    expect(markdownText).toContain("AppIntent is missing perform().");
  });
});
