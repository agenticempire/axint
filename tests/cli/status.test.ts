import { describe, expect, it } from "vitest";
import { renderCliStatus, renderMcpRecoveryPacket } from "../../src/cli/status.js";

describe("axint status", () => {
  it("prints local version and same-thread reload guidance", () => {
    const output = renderCliStatus("9.9.9", "markdown");

    expect(output).toContain("@axint/compiler@9.9.9");
    expect(output).toContain("Call axint.status");
    expect(output).toContain("axint upgrade --apply");
    expect(output).toContain("Keep the current Codex or Claude thread");
  });

  it("can emit the startup prompt for Claude in Xcode", () => {
    const output = renderCliStatus("9.9.9", "prompt");

    expect(output).toContain("Call axint.status");
    expect(output).toContain("Expected local package version: 9.9.9");
    expect(output).toContain("axint.upgrade");
    expect(output).toContain("axint.cloud.check");
  });

  it("prints a same-thread MCP recovery packet with CLI fallbacks", () => {
    const output = renderMcpRecoveryPacket("9.9.9", {
      dir: "/tmp/My Project",
      agent: "codex",
      sessionToken: "axsess_test",
    });

    expect(output).toContain("Axint MCP Recovery Packet");
    expect(output).toContain("Transport closed");
    expect(output).toContain("@axint/compiler@9.9.9");
    expect(output).toContain("axint workflow check");
    expect(output).toContain("--session-token axsess_test");
    expect(output).toContain("axint run --cwd");
    expect(output).toContain("continue through the CLI fallback");
  });
});
