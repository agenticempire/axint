import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Xcode agent plugin package", () => {
  it("declares Axint as an Xcode 27 agent plugin with MCP tools and skills", () => {
    const manifestPath = join(ROOT, "extensions", "xcode", "agent-plugin", "plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      name: string;
      version: string;
      mcpServers?: Record<
        string,
        {
          type: string;
          command?: string;
          args?: string[];
          _meta?: {
            ideToolIconPath?: string;
            ideToolTitles?: Record<string, string>;
          };
        }
      >;
      skills?: Array<{ name: string; path: string }>;
    };

    expect(manifest.name).toBe("Axint");
    expect(manifest.version).toBe("0.4.30");
    expect(manifest.mcpServers?.axint).toMatchObject({
      type: "stdio",
      command: "npx",
      args: ["-y", "-p", "@axint/compiler", "axint-mcp"],
    });
    expect(manifest.mcpServers?.axint?._meta?.ideToolTitles).toMatchObject({
      "axint.cloud.check": "Apple Readiness Check",
      "axint.xcode.guard": "Axint Guard",
    });
    expect(manifest.skills?.map((skill) => skill.name)).toContain(
      "apple-intelligence-proof"
    );
  });
});
