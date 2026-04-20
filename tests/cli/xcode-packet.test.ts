import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const CLI = resolve(__dirname, "../../dist/cli/index.js");

type PacketCommand = "compile" | "validate_swift";
type PacketVerdict = "pass" | "needs_review" | "fail";

function buildPacket(args: {
  command: PacketCommand;
  fileName: string;
  filePath: string;
  verdict: PacketVerdict;
  prompt: string;
}) {
  return {
    schemaVersion: 1,
    createdAt: "2026-04-20T09:00:00.000Z",
    compilerVersion: "0.3.9",
    command: args.command,
    source: {
      surface: args.command === "validate_swift" ? "swift" : "intent",
      language: args.command === "validate_swift" ? "swift" : "typescript",
      fileName: args.fileName,
      filePath: args.filePath,
      sourceLines: 12,
    },
    outcome: {
      success: args.verdict === "pass",
      verdict: args.verdict,
      headline:
        args.verdict === "pass" ? "Axint check passed" : "Axint check needs review",
      detail: "Test packet output.",
      errors: args.verdict === "fail" ? 1 : 0,
      warnings: args.verdict === "needs_review" ? 1 : 0,
      infos: 0,
    },
    artifacts: {
      outputPath: null,
      infoPlistPath: null,
      entitlementsPath: null,
      packetJsonPath: "/tmp/latest.json",
      packetMarkdownPath: "/tmp/latest.md",
    },
    topFindings: [],
    diagnostics: [],
    nextSteps: ["Rerun Axint after you apply the fix."],
    ai: {
      summary: "Copy the prompt below into your AI tool.",
      prompt: args.prompt,
    },
    xcode: {
      summary: "Use this packet as the repair checklist before you go back to Xcode.",
      checklist: ["Open the file and apply the fix."],
    },
  };
}

describe("axint xcode packet", () => {
  let tempRoot: string;
  let derivedDataRoot: string;

  beforeEach(() => {
    tempRoot = resolve(tmpdir(), `axint-xcode-packet-${Date.now()}`);
    derivedDataRoot = join(tempRoot, "DerivedData");
    mkdirSync(derivedDataRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function writePacket(
    packetPath: string,
    packet: ReturnType<typeof buildPacket>,
    timeMs: number
  ) {
    mkdirSync(dirname(packetPath), { recursive: true });
    writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf-8");
    const timeSeconds = timeMs / 1000;
    utimesSync(packetPath, timeSeconds, timeSeconds);
  }

  it("finds the latest validate packet from a DerivedData tree", () => {
    const compilePacketPath = join(
      derivedDataRoot,
      "Demo-abc",
      "SourcePackages",
      "plugins",
      "axint.output",
      "Demo.output",
      "AxintCompilePlugin",
      "fix",
      "set-lights",
      "latest.json"
    );
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
      compilePacketPath,
      buildPacket({
        command: "compile",
        fileName: "set-lights.ts",
        filePath: "/tmp/set-lights.ts",
        verdict: "pass",
        prompt: "compile prompt",
      }),
      1_710_000_000_000
    );
    writePacket(
      validatePacketPath,
      buildPacket({
        command: "validate_swift",
        fileName: "SetLightsIntent.swift",
        filePath: "/tmp/SetLightsIntent.swift",
        verdict: "needs_review",
        prompt: "validate prompt",
      }),
      1_710_000_100_000
    );

    const result = spawnSync(
      "node",
      [
        CLI,
        "xcode",
        "packet",
        "--root",
        derivedDataRoot,
        "--kind",
        "validate",
        "--format",
        "path",
      ],
      { encoding: "utf-8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(validatePacketPath);
  });

  it("renders the latest packet prompt when no kind filter is supplied", () => {
    const compilePacketPath = join(
      derivedDataRoot,
      "Demo-abc",
      "Build",
      "Intermediates.noindex",
      "Plugins",
      "AxintCompilePlugin",
      "fix",
      "profile-card",
      "latest.json"
    );
    const validatePacketPath = join(
      derivedDataRoot,
      "Demo-abc",
      "Build",
      "Intermediates.noindex",
      "Plugins",
      "AxintValidatePlugin",
      "fix",
      "validate",
      "latest.json"
    );

    writePacket(
      compilePacketPath,
      buildPacket({
        command: "compile",
        fileName: "profile-card.ts",
        filePath: "/tmp/profile-card.ts",
        verdict: "pass",
        prompt: "older compile prompt",
      }),
      1_710_000_000_000
    );
    writePacket(
      validatePacketPath,
      buildPacket({
        command: "validate_swift",
        fileName: "ProfileCardIntent.swift",
        filePath: "/tmp/ProfileCardIntent.swift",
        verdict: "fail",
        prompt: "newest validate prompt",
      }),
      1_710_000_100_000
    );

    const result = spawnSync(
      "node",
      [CLI, "xcode", "packet", "--root", derivedDataRoot, "--format", "prompt"],
      { encoding: "utf-8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("newest validate prompt");
  });

  it("fails cleanly when no packet exists under the provided root", () => {
    const result = spawnSync(
      "node",
      [CLI, "xcode", "packet", "--root", derivedDataRoot, "--kind", "validate"],
      { encoding: "utf-8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no validate Fix Packet found");
    expect(result.stderr).toContain("DerivedData");
  });
});
