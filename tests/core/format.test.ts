import { describe, it, expect } from "vitest";
import { formatSwift, SWIFT_FORMAT_CONFIG } from "../../src/core/format.js";

describe("formatSwift", () => {
  const sample = `import AppIntents

struct HelloIntent: AppIntent {
    static var title: LocalizedStringResource = "Hello"
    func perform() async throws -> some IntentResult {
        return .result()
    }
}
`;

  it("returns a FormatResult with the original source when swift-format is missing", async () => {
    const result = await formatSwift(sample);
    // On Linux CI the binary will not be present — expect a graceful fallback.
    // On a Mac with Xcode it will actually format — either path yields a valid result.
    expect(typeof result.formatted).toBe("string");
    expect(result.formatted.length).toBeGreaterThan(0);
    expect(typeof result.ran).toBe("boolean");
    if (!result.ran) {
      expect(result.reason).toMatch(/swift-format/i);
      expect(result.formatted).toBe(sample);
    }
  });

  it("throws in strict mode when swift-format is missing", async () => {
    // If swift-format is installed on the dev machine this test will be a
    // no-op (the call succeeds). It primarily guards the Linux CI path.
    try {
      const result = await formatSwift(sample, { strict: true });
      // swift-format was available — the strict call succeeded.
      expect(result.ran).toBe(true);
      expect(result.formatted.length).toBeGreaterThan(0);
    } catch (err) {
      // swift-format was missing — strict mode escalated to an exception.
      expect((err as Error).message).toMatch(/swift-format/i);
    }
  });

  it("exposes a frozen-shape config that mirrors Apple's defaults", () => {
    expect(SWIFT_FORMAT_CONFIG.version).toBe(1);
    expect(SWIFT_FORMAT_CONFIG.lineLength).toBe(100);
    expect(SWIFT_FORMAT_CONFIG.indentation.spaces).toBe(4);
    expect(SWIFT_FORMAT_CONFIG.rules.OrderedImports).toBe(true);
    expect(SWIFT_FORMAT_CONFIG.rules.UseShorthandTypeNames).toBe(true);
    expect(SWIFT_FORMAT_CONFIG.rules.DoNotUseSemicolons).toBe(true);
  });

  it("always returns a FormatResult (never undefined)", async () => {
    const result = await formatSwift("// tiny", { timeoutMs: 2000 });
    expect(result).toBeDefined();
    expect(typeof result.formatted).toBe("string");
  });
});
