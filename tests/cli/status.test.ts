import { describe, expect, it } from "vitest";
import { renderCliStatus } from "../../src/cli/status.js";

describe("axint status", () => {
  it("prints local version and Xcode restart guidance", () => {
    const output = renderCliStatus("9.9.9", "markdown");

    expect(output).toContain("@axint/compiler@9.9.9");
    expect(output).toContain("Call axint.status");
    expect(output).toContain("Restart the Xcode Claude Agent chat");
  });

  it("can emit the startup prompt for Claude in Xcode", () => {
    const output = renderCliStatus("9.9.9", "prompt");

    expect(output).toContain("Call axint.status");
    expect(output).toContain("Expected local package version: 9.9.9");
    expect(output).toContain("axint.cloud.check");
  });
});
