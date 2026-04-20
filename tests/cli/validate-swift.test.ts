import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const CLI = resolve(__dirname, "../../dist/cli/index.js");

const INVALID_SWIFT = `
import AppIntents

struct BrokenIntent: AppIntent {
    static var title: LocalizedStringResource = "Broken"
}
`;

const VALID_SWIFT = `
struct PlainSwift {
    let value: Int = 1
}
`;

describe("axint validate-swift", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `axint-validate-swift-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("emits a Fix Packet when validation fails", () => {
    const swiftFile = join(tmpDir, "BrokenIntent.swift");
    const packetDir = join(tmpDir, "fix");
    writeFileSync(swiftFile, INVALID_SWIFT, "utf-8");

    const result = spawnSync(
      "node",
      [CLI, "validate-swift", swiftFile, "--fix-packet-dir", packetDir],
      {
        cwd: tmpDir,
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Fix Packet");

    const packetPath = join(packetDir, "latest.json");
    expect(existsSync(packetPath)).toBe(true);

    const packet = JSON.parse(readFileSync(packetPath, "utf-8")) as {
      command: string;
      source: { surface: string; language: string };
      outcome: { verdict: string };
      diagnostics: Array<{ code: string }>;
    };

    expect(packet.command).toBe("validate_swift");
    expect(packet.source.surface).toBe("swift");
    expect(packet.source.language).toBe("swift");
    expect(packet.outcome.verdict).toBe("fail");
    expect(packet.diagnostics.some((diagnostic) => diagnostic.code === "AX701")).toBe(
      true
    );
  });

  it("emits a passing Fix Packet for clean Swift input", () => {
    const swiftFile = join(tmpDir, "PlainSwift.swift");
    const packetDir = join(tmpDir, "fix");
    writeFileSync(swiftFile, VALID_SWIFT, "utf-8");

    const result = spawnSync(
      "node",
      [CLI, "validate-swift", swiftFile, "--fix-packet-dir", packetDir],
      {
        cwd: tmpDir,
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Fix Packet");

    const packetPath = join(packetDir, "latest.json");
    expect(existsSync(packetPath)).toBe(true);

    const packet = JSON.parse(readFileSync(packetPath, "utf-8")) as {
      outcome: { verdict: string };
      diagnostics: Array<unknown>;
    };

    expect(packet.outcome.verdict).toBe("pass");
    expect(packet.diagnostics).toHaveLength(0);
  });
});
