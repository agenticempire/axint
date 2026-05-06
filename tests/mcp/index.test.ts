import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("axint/mcp import surface", () => {
  it("is importable without starting the stdio server", async () => {
    const mod = await import("../../src/mcp/index.js");

    expect(typeof mod.createAxintServer).toBe("function");
    expect(typeof mod.startMCPServer).toBe("function");
    expect(typeof mod.getRuntimeToolManifest).toBe("function");
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

  it("keeps runtime tool listings compact unless verbose mode is requested", async () => {
    const mod = await import("../../src/mcp/index.js");
    const compact = mod.getRuntimeToolManifest();
    const full = mod.getRuntimeToolManifest({ AXINT_MCP_MANIFEST_MODE: "full" });

    expect(compact).toHaveLength(mod.TOOL_MANIFEST.length);
    expect(compact.map((tool: { name: string }) => tool.name)).toEqual(
      mod.TOOL_MANIFEST.map((tool: { name: string }) => tool.name)
    );
    expect(full).toHaveLength(mod.TOOL_MANIFEST.length);
    expect(
      full.every((tool: { outputSchema?: unknown }) => Boolean(tool.outputSchema))
    ).toBe(true);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length);
    expect(
      compact.every((tool: { description?: string }) =>
        Boolean(
          tool.description?.includes("Use:") && tool.description.includes("Effects:")
        )
      )
    ).toBe(true);
  });

  it("keeps the MCP SDK bundled out of published runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.["@modelcontextprotocol/sdk"]).toBeUndefined();
    expect(pkg.devDependencies?.["@modelcontextprotocol/sdk"]).toMatch(/^\^?\d+\./);
  });

  it("starts the stdio server when the package MCP entrypoint is executed directly", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/mcp/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AXINT_TELEMETRY_OPTOUT: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let exit:
      | {
          code: number | null;
          signal: NodeJS.Signals | null;
        }
      | undefined;
    let stderr = "";

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", (code, signal) => {
      exit = { code, signal };
    });

    try {
      await wait(500);
      expect(exit, stderr).toBeUndefined();
    } finally {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        wait(2_000).then(() => {
          child.kill("SIGKILL");
        }),
      ]);
    }
  });
});
