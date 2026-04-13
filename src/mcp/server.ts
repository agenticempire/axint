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
 *   - axint_compile_from_schema: Compile minimal JSON schema → Swift (token saver)
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
import {
  compileSource,
  compileFromIR,
  compileViewFromIR,
  compileWidgetFromIR,
  compileAppFromIR,
} from "../core/compiler.js";
import { scaffoldIntent } from "./scaffold.js";
import { TEMPLATES, getTemplate } from "../templates/index.js";
import type {
  IRIntent,
  IRView,
  IRWidget,
  IRWidgetEntry,
  IRApp,
  IRScene,
  IRViewState,
  IRViewProp,
  IRParameter,
  IRType,
  WidgetFamily,
  WidgetRefreshPolicy,
  SceneKind,
} from "../core/types.js";
import { isPrimitiveType, isSceneKind } from "../core/types.js";

// Read version from package.json so it stays in sync
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));

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

type SchemaCompileArgs = {
  type: "intent" | "view" | "widget" | "app";
  name: string;
  title?: string;
  description?: string;
  domain?: string;
  params?: Record<string, string>;
  props?: Record<string, string>;
  state?: Record<string, { type: string; default?: unknown }>;
  body?: string;
  displayName?: string;
  families?: string[];
  entry?: Record<string, string>;
  refreshInterval?: number;
  scenes?: Array<{
    kind: string;
    view: string;
    title?: string;
    name?: string;
    platform?: string;
  }>;
};

const VALID_PLATFORMS = new Set<string>(["macOS", "iOS", "visionOS"]);

function toSceneKind(kind: string | undefined): SceneKind {
  const k = kind || "windowGroup";
  return isSceneKind(k) ? k : "windowGroup";
}

type Platform = "macOS" | "iOS" | "visionOS";

function isPlatform(s: string): s is Platform {
  return VALID_PLATFORMS.has(s);
}

function toPlatformGuard(platform: string | undefined): Platform | undefined {
  return platform && isPlatform(platform) ? platform : undefined;
}

/**
 * Convert a minimal schema string type to an IRType.
 */
function schemaTypeToIRType(typeStr: string): IRType {
  const normalized = typeStr === "number" ? "int" : typeStr;
  if (isPrimitiveType(normalized)) {
    return { kind: "primitive", value: normalized };
  }
  return { kind: "primitive", value: "string" };
}

/**
 * Handle compile_from_schema requests.
 */
async function handleCompileFromSchema(args: SchemaCompileArgs) {
  try {
    const inputJson = JSON.stringify(args);
    const inputTokens = Math.ceil(inputJson.length / 4);

    if (args.type === "intent") {
      return handleIntentSchema(args, inputTokens);
    } else if (args.type === "view") {
      return handleViewSchema(args, inputTokens);
    } else if (args.type === "widget") {
      return handleWidgetSchema(args, inputTokens);
    } else if (args.type === "app") {
      return handleAppSchema(args, inputTokens);
    }

    return {
      content: [{ type: "text" as const, text: `Invalid type: ${args.type}` }],
      isError: true,
    };
  } catch (err: unknown) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Schema compilation error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handle intent schema compilation.
 */
async function handleIntentSchema(args: SchemaCompileArgs, inputTokens: number) {
  if (!args.name) {
    return {
      content: [
        { type: "text" as const, text: "[AX002] error: Schema requires a 'name' field" },
      ],
      isError: true,
    };
  }
  if (!args.title && !args.name) {
    return {
      content: [
        { type: "text" as const, text: "[AX003] error: Schema requires a 'title' field" },
      ],
      isError: true,
    };
  }

  const parameters: IRParameter[] = [];
  if (args.params) {
    for (const [name, typeStr] of Object.entries(args.params)) {
      parameters.push({
        name,
        type: schemaTypeToIRType(typeStr),
        title: name.replace(/([A-Z])/g, " $1").trim(),
        description: "",
        isOptional: false,
      });
    }
  }

  const ir: IRIntent = {
    name: args.name,
    title: args.title || args.name.replace(/([A-Z])/g, " $1").trim(),
    description: args.description || "",
    domain: args.domain,
    parameters,
    returnType: { kind: "primitive", value: "string" },
    sourceFile: "<schema>",
  };

  const result = compileFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens);
}

/**
 * Handle view schema compilation.
 */
async function handleViewSchema(args: SchemaCompileArgs, inputTokens: number) {
  if (!args.name) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX301] error: View schema requires a 'name' field",
        },
      ],
      isError: true,
    };
  }

  const props: IRViewProp[] = [];
  if (args.props) {
    for (const [name, typeStr] of Object.entries(args.props)) {
      props.push({
        name,
        type: schemaTypeToIRType(typeStr),
        isOptional: false,
      });
    }
  }

  const state: IRViewState[] = [];
  if (args.state) {
    for (const [name, stateConfig] of Object.entries(args.state)) {
      state.push({
        name,
        type: schemaTypeToIRType(stateConfig.type || "string"),
        kind: "state",
        defaultValue: stateConfig.default,
      });
    }
  }

  const ir: IRView = {
    name: args.name,
    props,
    state,
    body: args.body
      ? [{ kind: "raw", swift: args.body }]
      : [{ kind: "text", content: "VStack {}" }],
    sourceFile: "<schema>",
  };

  const result = compileViewFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens);
}

/**
 * Handle widget schema compilation.
 */
async function handleWidgetSchema(args: SchemaCompileArgs, inputTokens: number) {
  if (!args.name) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX402] error: Widget schema requires a 'name' field",
        },
      ],
      isError: true,
    };
  }
  if (!args.displayName) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX403] error: Widget schema requires a 'displayName' field",
        },
      ],
      isError: true,
    };
  }

  const entries: IRWidgetEntry[] = [];
  if (args.entry) {
    for (const [name, typeStr] of Object.entries(args.entry)) {
      entries.push({
        name,
        type: schemaTypeToIRType(typeStr),
      });
    }
  }

  const validFamilies = new Set<string>([
    "systemSmall",
    "systemMedium",
    "systemLarge",
    "systemExtraLarge",
    "accessoryCircular",
    "accessoryRectangular",
    "accessoryInline",
  ]);
  const families: WidgetFamily[] = (args.families || ["systemSmall"]).filter(
    (f: string): f is WidgetFamily => validFamilies.has(f)
  );

  let refreshPolicy: WidgetRefreshPolicy = "atEnd";
  if (args.refreshInterval) {
    refreshPolicy = "after";
  }

  const ir: IRWidget = {
    name: args.name,
    displayName: args.displayName || args.name.replace(/([A-Z])/g, " $1").trim(),
    description: args.description || "",
    families,
    entry: entries,
    body: args.body
      ? [{ kind: "raw", swift: args.body }]
      : [{ kind: "text", content: "Hello" }],
    refreshInterval: args.refreshInterval,
    refreshPolicy,
    sourceFile: "<schema>",
  };

  const result = compileWidgetFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens);
}

/**
 * Handle app schema compilation.
 */
async function handleAppSchema(args: SchemaCompileArgs, inputTokens: number) {
  if (!args.name) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX502] error: App schema requires a 'name' field",
        },
      ],
      isError: true,
    };
  }
  if (!args.scenes || args.scenes.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX503] error: App schema requires at least one scene",
        },
      ],
      isError: true,
    };
  }

  const scenes: IRScene[] = [];
  if (args.scenes) {
    for (const s of args.scenes) {
      scenes.push({
        sceneKind: toSceneKind(s.kind),
        rootView: s.view,
        title: s.title,
        name: s.name,
        platformGuard: toPlatformGuard(s.platform),
        isDefault: scenes.length === 0 && (s.kind || "windowGroup") === "windowGroup",
      });
    }
  }

  if (scenes.length === 0) {
    scenes.push({
      sceneKind: "windowGroup",
      rootView: "ContentView",
      isDefault: true,
    });
  }

  const ir: IRApp = {
    name: args.name,
    scenes,
    sourceFile: "<schema>",
  };

  const result = compileAppFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens);
}

/**
 * Format the schema output with token statistics.
 */
function formatSchemaOutput(
  swiftCode: string,
  inputTokens: number
): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const outputTokens = Math.ceil(swiftCode.length / 4);
  const compressionRatio =
    inputTokens > 0 ? (outputTokens / inputTokens).toFixed(2) : "0.00";
  const tokensSaved = inputTokens - outputTokens;

  const tokenStats = `
// ─── Token Statistics ────────────────────────────────────────
// Input tokens (JSON schema):     ~${inputTokens}
// Output tokens (Swift code):     ~${outputTokens}
// Compression ratio:              ${compressionRatio}x
// Tokens saved:                   ${tokensSaved > 0 ? `+${tokensSaved}` : tokensSaved}
`;

  const output = tokenStats + "\n\n" + swiftCode;
  return { content: [{ type: "text" as const, text: output }] };
}

/**
 * Create and configure the Axint MCP server instance.
 * Separated from transport so the same server logic works over
 * stdio, HTTP/SSE, or any future transport.
 */
export function createAxintServer(): Server {
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
        name: "axint_compile_from_schema",
        description:
          "Compile a minimal JSON schema directly to Swift, bypassing TypeScript. " +
          "Supports intents, views, and widgets. Minimal JSON means ~20 tokens vs " +
          "hundreds for full TypeScript. Returns Swift code with token usage stats.",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              enum: ["intent", "view", "widget", "app"],
              description: "What to compile: intent, view, widget, or app",
            },
            name: {
              type: "string",
              description: "PascalCase name (e.g., 'CreateEvent', 'EventListView')",
            },
            title: {
              type: "string",
              description: "Human-readable title (for intents)",
            },
            description: {
              type: "string",
              description: "Description of what this does",
            },
            domain: {
              type: "string",
              description:
                "Intent domain (messaging, productivity, health, finance, commerce, " +
                "media, navigation, smart-home) — intents only",
            },
            params: {
              type: "object",
              description:
                "For intents: parameter definitions as { fieldName: 'type' }. " +
                "Types: string, int, double, float, boolean, date, duration, url",
              additionalProperties: { type: "string" },
            },
            props: {
              type: "object",
              description:
                "For views: prop definitions as { fieldName: 'type' }. " + "Views only.",
              additionalProperties: { type: "string" },
            },
            state: {
              type: "object",
              description:
                "For views: state definitions as { fieldName: { type: 'string', default?: value } }. " +
                "Views only.",
            },
            body: {
              type: "string",
              description:
                "For views/widgets: raw Swift code to use as the body. " +
                "E.g., 'VStack { Text(\"Hello\") }' — will be wrapped automatically.",
            },
            displayName: {
              type: "string",
              description: "Display name (widgets only)",
            },
            families: {
              type: "array",
              items: { type: "string" },
              description:
                "Widget families: systemSmall, systemMedium, systemLarge, systemExtraLarge, " +
                "accessoryCircular, accessoryRectangular, accessoryInline — widgets only",
            },
            entry: {
              type: "object",
              description:
                "For widgets: timeline entry fields as { fieldName: 'type' }. " +
                "Widgets only.",
              additionalProperties: { type: "string" },
            },
            refreshInterval: {
              type: "number",
              description: "Widget refresh interval in minutes — widgets only",
            },
            scenes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: ["windowGroup", "window", "documentGroup", "settings"],
                    description: "Scene type",
                  },
                  view: { type: "string", description: "Root SwiftUI view name" },
                  title: { type: "string", description: "Window title" },
                  name: { type: "string", description: "Scene identifier" },
                  platform: {
                    type: "string",
                    enum: ["macOS", "iOS", "visionOS"],
                    description: "Platform guard (#if os(...))",
                  },
                },
                required: ["kind", "view"],
              },
              description: "For apps: scene definitions — apps only",
            },
          },
          required: ["type", "name"],
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

      if (name === "axint_compile_from_schema") {
        return handleCompileFromSchema(args as unknown as SchemaCompileArgs);
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

  return server;
}

export async function startMCPServer(): Promise<void> {
  const server = createAxintServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
