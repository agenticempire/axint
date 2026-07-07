import { describe, expect, it } from "vitest";
import {
  getAppleCapability,
  isAppleTarget,
  supportsAppleCapability,
} from "../../src/apple/capabilities.js";

describe("Apple capability registry", () => {
  it("tracks WWDC26 and iOS 27 platform capability availability", () => {
    expect(isAppleTarget("ios27")).toBe(true);
    expect(isAppleTarget("macos27")).toBe(true);
    expect(isAppleTarget("visionos27")).toBe(true);

    expect(getAppleCapability("appintents.unionValue")?.framework).toBe("AppIntents");
    expect(getAppleCapability("foundationmodels.evaluations")?.framework).toBe(
      "Evaluations"
    );

    expect(supportsAppleCapability("ios27", "appintents.unionValue")).toBe(true);
    expect(supportsAppleCapability("ios26", "appintents.unionValue")).toBe(false);
    expect(supportsAppleCapability("macos27", "xcode.agentPlugins")).toBe(true);
  });
});
