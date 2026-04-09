/**
 * Axint MCP Server
 *
 * Exposes Axint capabilities as MCP tools that AI coding assistants
 * (Claude Code, Cursor, Windsurf, Zed, any MCP client) can call
 * automatically.
 *
 * Tools:
 *   - axint_scaffold:  Generate a starter TypeScript intent file
 *   - axint_compile:   Compile TypeScript intent → Swift App Intent
 *                      (optionally with Info.plist and entitlements)
 *   - axint_validate:  Validate an intent definition without codegen
 *   - axint_list_templates: List bundled reference templates
 *   - axint_template:  Return the source of a specific template
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSource } from "../core/compiler.js";
import { scaffoldIntent } from "./scaffold.js";
import { TEMPLATES, getTemplate } from "../templates/index.js";

// Read version from package.json so it stays in sync
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf-8")
);

type CompileArgs = {
  source: string;
  fileName?: string;
  emitInfoPlist?: boolean;
  emitEntitlements?: boolean;
};

type ScaffoldArgs = {
  name: string;
  description: string;
  domain?: string;
  params?: Array<{ name: string; type: string; description: string }>;
};

type TemplateArgs = { id: string };

export async function startMCPServer(): Promise<void> {
  const server = new Server(
    { name: "axint", version: pkg.version },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "axint_scaffold",
        description:
          "Generate a starter TypeScript intent file using the axint SDK. " +
          "Pass a PascalCase name, a description, and optionally a domain " +
          "(messaging, productivity, health, finance, commerce, media, " +
          "navigation, smart-home) and a list of parameters. Returns ready-" +
          "to-save source code that compiles with `axint compile`.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "PascalCase name for the intent, e.g., 'CreateEvent'",
            },
            description: {
              type: "string",
              description: "Human-readable description of what the intent does",
            },
            domain: {
              type: "string",
              description:
                "Optional Apple App Intent domain (messaging, productivity, " +
                "health, finance, commerce, media, navigation, smart-home)",
            },
            params: {
              type: "array",
              description:
                "Optional initial parameters. Each item: { name, type, description }. " +
                "Supported types: string, int, double, float, boolean, date, duration, url.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  description: { type: "string" },
                },
                required: ["name", "type", "description"],
              },
            },
          },
          required: ["name", "description"],
        },
      },
      {
        name: "axint_compile",
        description:
          "Compile a TypeScript intent definition into a native Swift App " +
          "Intent. Optionally emits Info.plist and entitlements fragments " +
          "alongside the Swift file. Pass the full TypeScript source code " +
          "using the defineIntent() API.",
        inputSchema: {
          type: "object" as const,
          properties: {
            source: {
              type: "string",
              description: "TypeScript source code containing a defineIntent() call",
            },
            fileName: {
              type: "string",
              description: "Optional file name for error messages",
            },
            emitInfoPlist: {
              type: "boolean",
              description:
                "When true, also returns an Info.plist XML fragment for the " +
                "intent's declared infoPlistKeys",
            },
            emitEntitlements: {
              type: "boolean",
              description:
                "When true, also returns an .entitlements XML fragment for " +
                "the intent's declared entitlements",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint_validate",
        description:
          "Validate a TypeScript intent definition without generating Swift " +
          "output. Returns diagnostics with error codes and fix suggestions.",
        inputSchema: {
          type: "object" as const,
          properties: {
            source: {
              type: "string",
              description: "TypeScript source code containing a defineIntent() call",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint_list_templates",
        description:
          "List the bundled reference templates. Use `axint_template` to " +
          "fetch the full source of a specific template by id.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "axint_template",
        description:
          "Return the full TypeScript source code of a bundled reference " +
          "template by id. Use `axint_list_templates` to discover valid ids.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "Template id (e.g., 'send-message', 'create-event')",
            },
          },
          required: ["id"],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "axint_scaffold") {
        const a = args as unknown as ScaffoldArgs;
        const source = scaffoldIntent({
          name: a.name,
          description: a.description,
          domain: a.domain,
          params: a.params,
        });
        return { content: [{ type: "text" as const, text: source }] };
      }

      if (name === "axint_compile") {
        const a = args as unknown as CompileArgs;
        const result = compileSource(a.source, a.fileName || "<mcp>", {
          emitInfoPlist: a.emitInfoPlist,
          emitEntitlements: a.emitEntitlements,
        });

        if (result.success && result.output) {
          const parts: string[] = [
            "// ─── Swift ──────────────────────────",
            result.output.swiftCode,
          ];
          if (result.output.infoPlistFragment) {
            parts.push("// ─── Info.plist fragment ────────────");
            parts.push(result.output.infoPlistFragment);
          }
          if (result.output.entitlementsFragment) {
            parts.push("// ─── .entitlements fragment ─────────");
            parts.push(result.output.entitlementsFragment);
          }
          return {
            content: [{ type: "text" as const, text: parts.join("\n") }],
          };
        }

        const errorText = result.diagnostics
          .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
          .join("\n");
        return {
          content: [{ type: "text" as const, text: errorText }],
          isError: true,
        };
      }

      if (name === "axint_validate") {
        const a = args as unknown as { source: string };
        const result = compileSource(a.source, "<validate>");
        const text =
          result.diagnostics.length > 0
            ? result.diagnostics
                .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
                .join("\n")
            : "Valid intent definition. No issues found.";
        return { content: [{ type: "text" as const, text }] };
      }

      if (name === "axint_list_templates") {
        const list = TEMPLATES.map(
          (t) => `${t.id}  —  ${t.title}${t.domain ? ` [${t.domain}]` : ""}`
        ).join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: list || "No templates registered.",
            },
          ],
        };
      }

      if (name === "axint_template") {
        const a = args as unknown as TemplateArgs;
        const tpl = getTemplate(a.id);
        if (!tpl) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown template id: ${a.id}. Use axint_list_templates to see available ids.`,
              },
            ],
            isError: true,
          };
        }
        return { content: [{ type: "text" as const, text: tpl.source }] };
      }

      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
