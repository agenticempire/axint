import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAdoptionEvent } from "../../src/telemetry/adoption.js";

const OLD_ENV = { ...process.env };
let dir = "";
let fetchBodies: unknown[] = [];

describe("adoption value telemetry", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "axint-telemetry-"));
    fetchBodies = [];
    process.env = {
      ...OLD_ENV,
      AXINT_TELEMETRY_CONFIG: join(dir, "user-telemetry.json"),
      AXINT_PROJECT_TELEMETRY_CONFIG: join(dir, "project-telemetry.json"),
      AXINT_TELEMETRY_ENDPOINT: "https://example.test/adoption",
      AXINT_TELEMETRY: "standard",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        fetchBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...OLD_ENV };
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("emits project first-value and repair-loop proof without source or paths", async () => {
    const result = await recordAdoptionEvent({
      source: "cli",
      eventName: "cli_command_completed",
      version: "0.4.29",
      command: "run",
      host: "codex",
      result: "ok",
    });

    expect(result.sent).toBe(true);
    expect(fetchBodies).toHaveLength(1);
    const batch = fetchBodies[0] as {
      events: Array<{ event_name: string; metadata: Record<string, unknown> }>;
    };
    const eventNames = batch.events.map((event) => event.event_name);
    expect(eventNames).toContain("axint_project_initialized");
    expect(eventNames).toContain("cli_command_completed");
    expect(eventNames).toContain("axint_first_value");
    expect(eventNames).toContain("axint_repair_loop_completed");
    expect(eventNames).toContain("axint_activated");

    const firstValue = batch.events.find(
      (event) => event.event_name === "axint_first_value"
    );
    expect(firstValue?.metadata.project_id).toMatch(/^axp_/);
    expect(firstValue?.metadata.value_stage).toBe("value");
    expect(firstValue?.metadata.file_path).toBeUndefined();
    expect(firstValue?.metadata.source_code).toBeUndefined();

    const project = JSON.parse(
      readFileSync(join(dir, "project-telemetry.json"), "utf-8")
    ) as {
      projectId: string;
      firstValueAt?: string;
      lastValueAt?: string;
    };
    expect(project.projectId).toMatch(/^axp_/);
    expect(project.firstValueAt).toBeTruthy();
    expect(project.lastValueAt).toBeTruthy();
  });

  it("emits remembered-agent and repeat-value proof for retained projects", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(dir, "project-telemetry.json"),
      `${JSON.stringify({
        projectId: "axp_existing",
        createdAt: old,
        updatedAt: old,
        firstValueAt: old,
        lastValueAt: old,
      })}\n`
    );

    const result = await recordAdoptionEvent({
      source: "mcp",
      eventName: "mcp_tool_completed",
      version: "0.4.29",
      toolName: "axint.workflow.check",
      host: "cursor",
      result: "ok",
    });

    expect(result.sent).toBe(true);
    const batch = fetchBodies[0] as {
      events: Array<{ event_name: string; metadata: Record<string, unknown> }>;
    };
    const eventNames = batch.events.map((event) => event.event_name);
    expect(eventNames).toContain("axint_repeat_value");
    expect(eventNames).toContain("axint_agent_rehydrated");

    const rehydrated = batch.events.find(
      (event) => event.event_name === "axint_agent_rehydrated"
    );
    expect(rehydrated?.metadata.project_id).toBe("axp_existing");
    expect(rehydrated?.metadata.value_stage).toBe("rehydration");
    expect(rehydrated?.metadata.project_repeat).toBe(true);
  });
});
