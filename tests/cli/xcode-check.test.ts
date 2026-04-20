import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildFixPacket } from "../../src/repair/fix-packet.js";
import { emitCheckSummaryArtifacts } from "../../src/repair/check-summary.js";

const CLI = resolve(__dirname, "../../dist/cli/index.js");

describe("axint xcode check", () => {
  let tempRoot: string;
  let derivedDataRoot: string;

  beforeEach(() => {
    tempRoot = resolve(tmpdir(), `axint-xcode-check-${Date.now()}`);
    derivedDataRoot = join(tempRoot, "DerivedData");
    mkdirSync(derivedDataRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function writePacket(
    packetPath: string,
    args: {
      command: "compile" | "validate_swift";
      verdict: "pass" | "needs_review" | "fail";
      fileName: string;
      filePath: string;
      prompt: string;
    },
    timeMs: number
  ) {
    mkdirSync(dirname(packetPath), { recursive: true });
    const packet = buildFixPacket({
      success: args.verdict !== "fail",
      surface: args.command === "validate_swift" ? "swift" : "intent",
      diagnostics:
        args.verdict === "pass"
          ? []
          : [
              {
                code: "AX118",
                severity: args.verdict === "fail" ? "error" : "warning",
                message: "Use Apple's real HealthKit usage-description keys.",
                suggestion:
                  "Replace HealthUsageDescription with NSHealthShareUsageDescription.",
              },
            ],
      source:
        args.command === "validate_swift"
          ? "struct BrokenIntent: AppIntent {}"
          : "export default defineIntent({ name: 'HealthReview' });",
      fileName: args.fileName,
      filePath: args.filePath,
      language: args.command === "validate_swift" ? "swift" : "typescript",
      packetJsonPath: packetPath,
      packetMarkdownPath: packetPath.replace(/latest\.json$/, "latest.md"),
      command: args.command,
    });
    packet.ai.prompt = args.prompt;
    writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf-8");
    emitCheckSummaryArtifacts(packet);
    const timeSeconds = timeMs / 1000;
    utimesSync(packetPath, timeSeconds, timeSeconds);
  }

  it("renders the latest validate check summary from a DerivedData tree", () => {
    const validatePacketPath = join(
      derivedDataRoot,
      "Demo-abc",
      "SourcePackages",
      "plugins",
      "axint.output",
      "Demo.output",
      "AxintValidatePlugin",
      "fix",
      "validate",
      "latest.json"
    );

    writePacket(
      validatePacketPath,
      {
        command: "validate_swift",
        verdict: "needs_review",
        fileName: "HealthReviewIntent.swift",
        filePath: "/tmp/HealthReviewIntent.swift",
        prompt: "repair prompt",
      },
      1_710_000_100_000
    );

    const result = spawnSync(
      "node",
      [CLI, "xcode", "check", "--root", derivedDataRoot, "--kind", "validate"],
      { encoding: "utf-8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# Axint Check");
    expect(result.stdout).toContain("needs_review");
    expect(result.stdout).toContain("AX118");
  });

  it("returns the prompt when the prompt format is requested", () => {
    const compilePacketPath = join(
      derivedDataRoot,
      "Demo-abc",
      "Build",
      "Intermediates.noindex",
      "Plugins",
      "AxintCompilePlugin",
      "fix",
      "health-review",
      "latest.json"
    );

    writePacket(
      compilePacketPath,
      {
        command: "compile",
        verdict: "fail",
        fileName: "health-review.ts",
        filePath: "/tmp/health-review.ts",
        prompt: "exact AI repair prompt",
      },
      1_710_000_000_000
    );

    const result = spawnSync(
      "node",
      [CLI, "xcode", "check", "--root", derivedDataRoot, "--format", "prompt"],
      { encoding: "utf-8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("exact AI repair prompt");
  });

  it("fails cleanly when no check is available yet", () => {
    const result = spawnSync(
      "node",
      [CLI, "xcode", "check", "--root", derivedDataRoot, "--kind", "validate"],
      { encoding: "utf-8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no validate Axint Check found");
    expect(result.stderr).toContain("DerivedData");
  });
});
