import { describe, expect, it } from "vitest";

describe("axint/mcp import surface", () => {
  it("is importable without starting the stdio server", async () => {
    const mod = await import("../../src/mcp/index.js");

    expect(typeof mod.createAxintServer).toBe("function");
    expect(typeof mod.startMCPServer).toBe("function");
    expect(Array.isArray(mod.TOOL_MANIFEST)).toBe(true);
    expect(Array.isArray(mod.PROMPT_MANIFEST)).toBe(true);
    expect(mod.TOOL_MANIFEST.length).toBeGreaterThan(0);
    expect(mod.TOOL_MANIFEST.map((tool: { name: string }) => tool.name)).toContain(
      "axint.session.start"
    );
    expect(mod.PROMPT_MANIFEST.length).toBeGreaterThan(0);
    expect(mod.PROMPT_MANIFEST.map((prompt: { name: string }) => prompt.name)).toContain(
      "axint.context-recovery"
    );

    const prompt = mod.getPromptMessages("axint.context-recovery", {
      projectName: "Swarm",
    });
    expect(prompt.messages[0].content.text).toContain(".axint/AXINT_MEMORY.md");
    expect(prompt.messages[0].content.text).toContain("axint.context.memory");
    expect(prompt.messages[0].content.text).toContain("axint.context.docs");
    expect(prompt.messages[0].content.text).toContain("axint.status");
  });
});
