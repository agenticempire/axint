import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleToolCall } from "../../src/mcp/server.js";
import { emitFixPacketArtifacts } from "../../src/repair/fix-packet.js";

describe("axint.fix-packet tool", () => {
  it("returns the latest Fix Packet through MCP", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "axint-mcp-packet-"));
    try {
      emitFixPacketArtifacts(
        {
          success: false,
          surface: "intent",
          fileName: "SetLights.ts",
          diagnostics: [
            {
              code: "AX108",
              severity: "error",
              message: "entitlement string format mismatch",
              suggestion: "Use the reserved HealthKit entitlement string.",
            },
          ],
        },
        cwd
      );

      const promptResult = await handleToolCall("axint.fix-packet", {
        cwd,
        format: "prompt",
      });
      expect(promptResult.isError).not.toBe(true);
      expect(promptResult.content[0].text).toContain("AX108");
      expect(promptResult.content[0].text).toContain("Axint diagnostic IDs");

      const jsonResult = await handleToolCall("axint.fix-packet", {
        cwd,
        format: "json",
      });
      expect(jsonResult.isError).not.toBe(true);
      expect(jsonResult.content[0].text).toContain('"verdict": "fail"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
