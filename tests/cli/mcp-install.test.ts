import { describe, expect, it } from "vitest";
import {
  buildMcpInstallPlans,
  renderMcpInstallReport,
  type McpInstallReport,
} from "../../src/cli/mcp-install.js";

describe("mcp install CLI helpers", () => {
  it("builds a durable Codex stdio install command", () => {
    const [plan] = buildMcpInstallPlans({
      requestedAgent: "codex",
      npxPath: "/opt/homebrew/bin/npx",
      pathEnv: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    });

    expect(plan.agent).toBe("codex");
    expect(plan.args).toEqual([
      "mcp",
      "add",
      "axint",
      "--env",
      "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      "--",
      "/opt/homebrew/bin/npx",
      "-y",
      "-p",
      "@axint/compiler",
      "axint-mcp",
    ]);
    expect(plan.verifyArgs).toEqual(["mcp", "get", "axint"]);
  });

  it("uses Codex's current streamable HTTP syntax for remote mode", () => {
    const [plan] = buildMcpInstallPlans({
      requestedAgent: "codex",
      remote: true,
      npxPath: "/opt/homebrew/bin/npx",
    });

    expect(plan.args).toEqual([
      "mcp",
      "add",
      "axint",
      "--url",
      "https://mcp.axint.ai/mcp",
    ]);
  });

  it("renders reload instructions so CLI fallback does not become steady state", () => {
    const report: McpInstallReport = {
      status: "ok",
      mode: "local",
      requestedAgent: "codex",
      results: [
        {
          agent: "codex",
          command: "/opt/homebrew/bin/codex",
          args: ["mcp", "add", "axint"],
          removeArgs: ["mcp", "remove", "axint"],
          verifyArgs: ["mcp", "get", "axint"],
          mode: "local",
          status: "ok",
          detail: "Axint MCP is installed and visible in the host config.",
          nextSteps: [
            "Reload or reconnect only the Axint MCP server/tool process.",
            "In the same thread, call axint.status and axint.activate before editing code.",
          ],
        },
      ],
    };

    const rendered = renderMcpInstallReport(report);
    expect(rendered).toContain(
      "Reload or reconnect only the Axint MCP server/tool process."
    );
    expect(rendered).toContain("axint.status");
    expect(rendered).toContain("axint.activate");
  });
});
