import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import worker from "../../workers/mcp-http/src/worker.js";
import { TOOL_MANIFEST } from "../../src/mcp/manifest.js";
import { PROMPT_MANIFEST } from "../../src/mcp/prompts.js";

const packageVersion = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf-8")
).version as string;

const env = {
  ALLOWED_ORIGINS: "https://axint.ai",
  MAX_BODY_BYTES: "4096",
};

async function request(
  body: object | string,
  init: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const method = init.method ?? "POST";
  const req = new Request(init.url ?? "https://mcp.axint.ai/mcp", {
    method,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    body:
      method === "POST"
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });

  return worker.fetch(req, env);
}

describe("axint HTTP MCP transport", () => {
  it("serves a health payload", async () => {
    const response = await request("{}", {
      method: "GET",
      url: "https://mcp.axint.ai/health",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      server: "axint-mcp",
      version: packageVersion,
    });
  });

  it("handles CORS preflight for allowed origins", async () => {
    const response = await request("{}", {
      method: "OPTIONS",
      headers: { Origin: "https://axint.ai" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://axint.ai");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("rejects cross-origin calls from untrusted origins", async () => {
    const response = await request(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { headers: { Origin: "https://evil.example" } }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: -32000, message: "Origin not allowed" },
    });
  });

  it("lists the full MCP tool manifest", async () => {
    const response = await request({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result.tools).toHaveLength(TOOL_MANIFEST.length);
    expect(payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      TOOL_MANIFEST.map((tool) => tool.name)
    );
  });

  it("reports the running remote MCP server version through axint.status", async () => {
    const response = await request({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "axint.status",
        arguments: { format: "json" },
      },
    });
    const payload = await response.json();
    const text = payload.result.content[0].text as string;
    const status = JSON.parse(text) as {
      server: string;
      version: string;
      restartRequiredAfterUpdate: boolean;
    };

    expect(status.server).toBe("axint-mcp");
    expect(status.version).toBe(packageVersion);
    expect(status.restartRequiredAfterUpdate).toBe(true);
  });

  it("lists built-in prompts and resolves prompt content", async () => {
    const listResponse = await request({ jsonrpc: "2.0", id: 1, method: "prompts/list" });
    const listPayload = await listResponse.json();

    expect(listPayload.result.prompts).toHaveLength(PROMPT_MANIFEST.length);
    expect(
      listPayload.result.prompts.map((prompt: { name: string }) => prompt.name)
    ).toEqual(PROMPT_MANIFEST.map((prompt) => prompt.name));

    const getResponse = await request({
      jsonrpc: "2.0",
      id: 2,
      method: "prompts/get",
      params: {
        name: "axint.create-intent",
        arguments: {
          intentName: "CreateReminder",
          intentDescription: "create a reminder from Siri",
          domain: "productivity",
        },
      },
    });
    const getPayload = await getResponse.json();
    const text = getPayload.result.messages[0].content.text as string;

    expect(text).toContain("CreateReminder");
    expect(text).toContain("productivity");
    expect(text).toContain("axint.scaffold");
  });

  it("compiles schema requests over HTTP", async () => {
    const response = await request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "axint.schema.compile",
        arguments: {
          type: "intent",
          name: "CreateReminder",
          title: "Create Reminder",
          description: "Create a reminder",
          domain: "productivity",
          params: {
            text: "string",
          },
        },
      },
    });
    const payload = await response.json();
    const text = payload.result.content[0].text as string;

    expect(text).toContain("struct CreateReminderIntent");
    expect(text).toContain("AppIntent");
  });

  it("returns protocol errors for malformed and invalid payloads", async () => {
    const parseError = await request("{");
    await expect(parseError.json()).resolves.toMatchObject({
      error: { code: -32700, message: "Parse error" },
    });

    const invalidRequest = await request("[]");
    await expect(invalidRequest.json()).resolves.toMatchObject({
      error: { code: -32600, message: "Invalid Request" },
    });
  });

  it("rejects missing tool names and unsupported HTTP verbs", async () => {
    const toolResponse = await request({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {},
    });
    await expect(toolResponse.json()).resolves.toMatchObject({
      error: { code: -32602, message: "Missing tool name" },
    });

    const getResponse = await request("{}", { method: "GET" });
    await expect(getResponse.json()).resolves.toMatchObject({
      error: { code: -32000, message: "POST only" },
    });
  });
});
