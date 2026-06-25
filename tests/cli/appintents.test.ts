import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const CLI = resolve(__dirname, "../../dist/cli/index.js");

const SWIFT_SOURCE = `
import AppIntents

@AppEntity(schema: .messages.message)
struct Message: AppEntity, SyncableEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Message")
    static var defaultQuery = MessageQuery()
    var id: String
}

@AppIntent(schema: .messages.sendMessage)
struct SendMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "Send Message"
}
`;

describe("axint appintents", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `axint-appintents-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints an AppIntentsTesting harness for a Swift file", () => {
    const swiftFile = join(tmpDir, "MessageIntent.swift");
    writeFileSync(swiftFile, SWIFT_SOURCE, "utf-8");

    const result = spawnSync(
      "node",
      [CLI, "appintents", "test", swiftFile, "--module", "DemoApp"],
      {
        cwd: tmpDir,
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("import AppIntentsTesting");
    expect(result.stdout).toContain("@testable import DemoApp");
    expect(result.stdout).toContain("SendMessageIntent");
    expect(result.stdout).toContain("appEntityIdentifier");
  });

  it("writes the harness to --out when requested", () => {
    const swiftFile = join(tmpDir, "MessageIntent.swift");
    const outFile = join(tmpDir, "Tests", "AxintAppIntentsReadinessTests.swift");
    writeFileSync(swiftFile, SWIFT_SOURCE, "utf-8");

    const result = spawnSync(
      "node",
      [CLI, "appintents", "test", swiftFile, "--module", "DemoApp", "--out", outFile],
      {
        cwd: tmpDir,
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wrote AppIntentsTesting harness");
    expect(readFileSync(outFile, "utf-8")).toContain("Shortcuts");
  });
});
