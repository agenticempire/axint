import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Claude Code plugin package", () => {
  it("declares Axint with inline MCP server configuration", () => {
    const manifestPath = join(
      ROOT,
      "extensions",
      "claude-code",
      ".claude-plugin",
      "plugin.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      name: string;
      mcpServers?: Record<
        string,
        {
          command?: string;
          args?: string[];
          env?: Record<string, string>;
        }
      >;
    };

    expect(manifest.name).toBe("axint");
    expect(manifest.mcpServers?.axint).toMatchObject({
      command: "npx",
      args: ["-y", "@axint/compiler", "axint-mcp"],
      env: {},
    });
  });

  it("declares marketplace metadata in the Axint skill frontmatter", () => {
    const skillPath = join(
      ROOT,
      "extensions",
      "claude-code",
      "skills",
      "axint",
      "SKILL.md",
    );
    const skill = readFileSync(skillPath, "utf-8");

    expect(skill).toMatch(/^---\nname: axint\ndescription: .+\n---\n\n# Axint/);
  });
});
