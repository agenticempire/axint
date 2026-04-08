/**
 * Axint MCP Server
 *
 * Exposes Axint capabilities as MCP tools that AI coding assistants
 * (Claude Code, Cursor, Windsurf) can call automatically.
 *
 * Tools:
 *   - axint_compile:   Compile TypeScript intent → Swift App Intent
 *   - axint_validate:  Validate an intent definition
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { compileSource } from "../core/compiler.js";

export async function startMCPServer(): Promise<void> {
  const server = new Server(
    { name: "axint", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "axint_compile",
        description:
          "Compile a TypeScript intent definition into a native Swift App Intent. " +
          "Pass the full TypeScript source code using the defineIntent() API.",
        inputSchema: {
          type: "object" as const,
          properties: {
            source: {
              type: "string",
              description:
                "TypeScript source code containing a defineIntent() call",
            },
            fileName: {
              type: "string",
              description: "Optional file name for error messages",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint_validate",
        description:
          "Validate a TypeScript intent definition without generating Swift output. " +
          "Returns diagnostics with error codes and fix suggestions.",
        inputSchema: {
          type: "object" as const,
          properties: {
            source: {
              type: "string",
              description:
                "TypeScript source code containing a defineIntent() call",
            },
          },
          required: ["source"],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "axint_compile") {
      const source = (args as { source: string; fileName?: string }).source;
      const fileName = (args as { fileName?: string }).fileName || "<mcp>";

      try {
        const result = compileSource(source, fileName);

        if (result.success && result.output) {
          return {
            content: [
              {
                type: "text" as const,
                text: result.output.swiftCode,
              },
            ],
          };
        } else {
          const errorText = result.diagnostics
            .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
            .join("\n");
          return {
            content: [{ type: "text" as const, text: errorText }],
            isError: true,
          };
        }
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Compilation error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (name === "axint_validate") {
      const source = (args as { source: string }).source;

      try {
        const result = compileSource(source, "<validate>");
        const text = result.diagnostics.length > 0
          ? result.diagnostics
              .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
              .join("\n")
          : "Valid intent definition. No issues found.";

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Validation error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
