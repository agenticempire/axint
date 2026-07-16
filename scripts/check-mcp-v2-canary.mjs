#!/usr/bin/env node

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const endpoint = process.env.AXINT_MCP_ENDPOINT || "https://mcp.axint.ai/mcp";
const expectedTools = Number.parseInt(process.env.AXINT_EXPECTED_MCP_TOOLS || "36", 10);
const expectedPrompts = Number.parseInt(
  process.env.AXINT_EXPECTED_MCP_PROMPTS || "5",
  10
);
const client = new Client(
  {
    name: "axint-mcp-v2-canary",
    version: "1",
  },
  {
    versionNegotiation: {
      mode: "auto",
      probe: {
        timeoutMs: 10_000,
        maxRetries: 0,
      },
    },
  }
);
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const prompts = await client.listPrompts();
  const discover = client.getDiscoverResult();

  if (!discover?.supportedVersions.includes("2026-07-28")) {
    throw new Error("server did not negotiate the 2026-07-28 protocol");
  }
  if (tools.tools.length !== expectedTools) {
    throw new Error(`expected ${expectedTools} tools, received ${tools.tools.length}`);
  }
  if (prompts.prompts.length !== expectedPrompts) {
    throw new Error(
      `expected ${expectedPrompts} prompts, received ${prompts.prompts.length}`
    );
  }

  console.log(
    `MCP v2 beta canary passed: ${discover.serverInfo.name}@${discover.serverInfo.version}, ` +
      `${tools.tools.length} tools, ${prompts.prompts.length} prompts.`
  );
} finally {
  await client.close();
}
