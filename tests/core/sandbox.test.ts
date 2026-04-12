import { describe, it, expect } from "vitest";
import { sandboxCompile, sandboxExists } from "../../src/core/sandbox.js";
import { spawnSync } from "node:child_process";

function hasSwiftToolchain(): boolean {
  try {
    const r = spawnSync("swift", ["--version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

const IS_MACOS = process.platform === "darwin";
const SWIFT_AVAILABLE = hasSwiftToolchain();

function hasAppIntentsSDK(): boolean {
  // AppIntents requires Xcode 14+ with a macOS 13+ SDK installed.
  // Command Line Tools alone aren't enough.
  try {
    const r = spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-version"], {
      stdio: "pipe",
    });
    if (r.status !== 0) return false;
    const ver = parseFloat(r.stdout.toString().trim());
    return ver >= 13;
  } catch {
    return false;
  }
}

const APP_INTENTS_AVAILABLE = IS_MACOS && SWIFT_AVAILABLE && hasAppIntentsSDK();
// AppIntents framework only exists on macOS — Linux runners have Swift
// but not the Apple frameworks, so we must check both plus SDK version.
const describeOnMac = APP_INTENTS_AVAILABLE ? describe : describe.skip;

describe("sandboxCompile", () => {
  const hello = `import Foundation
import AppIntents

struct HelloWorldIntent: AppIntent {
    static var title: LocalizedStringResource = "Hello World"
    func perform() async throws -> some IntentResult {
        return .result()
    }
}
`;

  it("throws a clear error on systems without a Swift toolchain", async () => {
    if (SWIFT_AVAILABLE) {
      // Skip this branch on Macs — there's nothing to test.
      return;
    }
    await expect(sandboxCompile(hello, { intentName: "HelloWorld" })).rejects.toThrow(
      /Swift toolchain not found/
    );
  });

  it("exposes sandboxExists helper", () => {
    // Just confirm the function exists and returns a boolean for an
    // arbitrary name (almost certainly false in a fresh tmpdir).
    expect(typeof sandboxExists("NonExistentIntent-" + Date.now())).toBe("boolean");
  });
});

describeOnMac("sandboxCompile (Swift toolchain present)", () => {
  const hello = `import Foundation
import AppIntents

struct HelloWorldIntent: AppIntent {
    static var title: LocalizedStringResource = "Hello World"
    func perform() async throws -> some IntentResult {
        return .result()
    }
}
`;

  it("builds a minimal Swift source inside an SPM sandbox", async () => {
    const result = await sandboxCompile(hello, { intentName: "HelloWorld" });
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
  }, 60_000);
});
