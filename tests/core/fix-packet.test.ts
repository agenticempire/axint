import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildFixPacket,
  emitFixPacketArtifacts,
  readLatestFixPacket,
  renderFixPacketMarkdown,
} from "../../src/repair/fix-packet.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Fix Packet", () => {
  it("builds a needs_review packet with a structured Apple repair brief", () => {
    const packet = buildFixPacket({
      success: true,
      surface: "intent",
      fileName: "SetLights.ts",
      filePath: "/tmp/SetLights.ts",
      diagnostics: [
        {
          code: "AX219",
          severity: "warning",
          message: "plist key mismatch",
          suggestion: "Align the usage description with the entitlement.",
          file: "SetLights.ts",
          line: 12,
        },
      ],
      outputPath: "/tmp/SetLights.intent.swift",
      infoPlistPath: "/tmp/SetLights.Info.plist",
      entitlementsPath: "/tmp/SetLights.entitlements",
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    });

    expect(packet.outcome.verdict).toBe("needs_review");
    expect(packet.topFindings).toHaveLength(1);
    expect(packet.ai.prompt).toContain("AX codes are Axint diagnostic IDs");
    expect(packet.ai.prompt).toContain("What broke:");
    expect(packet.ai.prompt).toContain("Why it matters:");
    expect(packet.ai.prompt).toContain("Make this change:");
    expect(packet.ai.prompt).toContain("Generated artifacts to use:");
    expect(packet.ai.prompt).toContain("/tmp/SetLights.Info.plist");
    expect(packet.ai.prompt).toContain("Repair plan:");
    expect(packet.ai.prompt).toContain("AX219");
  });

  it("builds a fail packet when blocking diagnostics exist", () => {
    const packet = buildFixPacket({
      success: false,
      surface: "intent",
      fileName: "Workout.ts",
      diagnostics: [
        {
          code: "AX108",
          severity: "error",
          message: "entitlement string format mismatch",
          suggestion: "Use the reserved HealthKit entitlement string.",
        },
      ],
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    });

    expect(packet.outcome.verdict).toBe("fail");
    expect(packet.outcome.headline).toBe("Axint check failed");
    expect(packet.nextSteps[0]).toContain("Copy the AI fix prompt");
  });

  it("marks unknown Swift snippets as low confidence instead of bluffing", () => {
    const packet = buildFixPacket({
      success: true,
      surface: "swift",
      language: "swift",
      fileName: "Helper.swift",
      source: `
        import Foundation

        struct Helper {
            let value: String
        }
      `,
      diagnostics: [],
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    });

    expect(packet.coverage.confidence).toBe("low");
    expect(packet.coverage.summary).toContain(
      "did not recognize a supported Apple-native Swift surface"
    );
    expect(packet.ai.prompt).toContain("Confidence: low");
    expect(packet.nextSteps[0]).toContain("low confidence");
  });

  it("keeps recognized Apple-native Swift snippets at high confidence", () => {
    const packet = buildFixPacket({
      success: true,
      surface: "swift",
      language: "swift",
      fileName: "SendMessage.swift",
      source: `
        import AppIntents

        struct SendMessage: AppIntent {
            static var title: LocalizedStringResource = "Send Message"
            func perform() async throws -> some IntentResult { .result() }
        }
      `,
      diagnostics: [],
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    });

    expect(packet.coverage.confidence).toBe("high");
  });

  it("emits latest json and markdown artifacts and can rediscover them from a child cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "axint-fix-packet-"));
    tempDirs.push(root);
    const nested = join(root, "apps", "demo");
    mkdirSync(nested, { recursive: true });

    const artifacts = emitFixPacketArtifacts(
      {
        success: true,
        surface: "view",
        fileName: "GreetingCard.ts",
        filePath: join(root, "GreetingCard.ts"),
        source: "export default defineView({ name: 'GreetingCard' });",
        diagnostics: [],
      },
      root
    );

    const packetText = readFileSync(artifacts.jsonPath, "utf-8");
    const markdownText = readFileSync(artifacts.markdownPath, "utf-8");
    const rediscovered = readLatestFixPacket({ cwd: nested });

    expect(packetText).toContain('"schemaVersion": 1');
    expect(markdownText).toContain("# Axint Fix Packet");
    expect(markdownText).toContain("## Xcode checklist");
    expect(rediscovered?.source.fileName).toBe("GreetingCard.ts");
    expect(rediscovered?.outcome.verdict).toBe("pass");
  });

  it("renders generated artifact hints into markdown when they exist", () => {
    const packet = buildFixPacket({
      success: false,
      surface: "intent",
      fileName: "LogWorkout.ts",
      diagnostics: [
        {
          code: "AX108",
          severity: "error",
          message: "entitlement string format mismatch",
          suggestion: "Use the reserved HealthKit entitlement string.",
        },
      ],
      outputPath: "/tmp/LogWorkout.intent.swift",
      infoPlistPath: "/tmp/LogWorkout.Info.plist",
      entitlementsPath: "/tmp/LogWorkout.entitlements",
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    });

    const markdown = renderFixPacketMarkdown(packet);

    expect(markdown).toContain("## Generated artifacts");
    expect(markdown).toContain("/tmp/LogWorkout.Info.plist");
    expect(markdown).toContain("## Xcode checklist");
  });
});
