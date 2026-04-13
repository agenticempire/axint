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
let pkg = { version: "0.3.3" };
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));
} catch {
  // fallback version used when bundled outside repo (e.g. Smithery scan)
}

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
          "Generate a starter TypeScript intent file from a name and description. " +
          "Returns a complete defineIntent() source string ready to save as a .ts " +
          "file — no files are written, no network requests made. On invalid " +
          "domain values, returns an error string. The output compiles directly " +
          "with axint_compile. Use this when creating a new intent from scratch; " +
          "use axint_template for a working reference example, or " +
          "axint_compile_from_schema to generate Swift without writing TypeScript.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description:
                "PascalCase intent name, e.g., 'SendMessage' or 'CreateEvent'. " +
                "Must start with an uppercase letter and contain no spaces.",
            },
            description: {
              type: "string",
              description:
                "Human-readable description of what the intent does, shown to " +
                "users in Shortcuts and Spotlight, e.g., 'Send a message to a contact'",
            },
            domain: {
              type: "string",
              description:
                "Apple App Intent domain. One of: messaging, productivity, health, " +
                "finance, commerce, media, navigation, smart-home. Omit if none apply.",
            },
            params: {
              type: "array",
              description:
                "Initial parameters for the intent. Each item needs name (camelCase), " +
                "type (string | int | double | float | boolean | date | duration | url), " +
                "and description. Example: { name: 'recipient', type: 'string', " +
                "description: 'Contact to message' }.",
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
          "Compile TypeScript source (defineIntent() call) into native Swift " +
          "App Intent code. Returns { swift, infoPlist?, entitlements? } as a " +
          "string — no files written, no network requests. On validation " +
          "failure, returns diagnostics (severity, AX error code, position, " +
          "fix suggestion) instead of Swift. Use axint_validate for cheaper " +
          "pre-flight checks without compilation output; use " +
          "axint_compile_from_schema to compile from JSON without writing " +
          "TypeScript; use axint_scaffold to generate the TypeScript input.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            source: {
              type: "string",
              description:
                "Full TypeScript source code containing a defineIntent() call. " +
                "Must be a complete file starting with an axint import, not a fragment.",
            },
            fileName: {
              type: "string",
              description:
                "Optional file name used in diagnostic messages, e.g., 'SendMessage.intent.ts'. " +
                "Defaults to 'input.ts' if omitted.",
            },
            emitInfoPlist: {
              type: "boolean",
              description:
                "When true, returns an Info.plist XML fragment declaring the intent's " +
                "infoPlistKeys. Only relevant for intents that use restricted APIs. " +
                "Defaults to false.",
            },
            emitEntitlements: {
              type: "boolean",
              description:
                "When true, returns an .entitlements XML fragment for the intent's " +
                "declared entitlements. Only relevant for intents requiring special " +
                "capabilities. Defaults to false.",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint_validate",
        description:
          "Validate a TypeScript intent definition without generating Swift " +
          "output. Returns an array of diagnostics, each with severity " +
          "(error | warning), error code (AXnnn), line/column position, and " +
          "a suggested fix. Returns an empty array when validation passes. " +
          "No files written, no network requests, no side effects. Use this " +
          "for cheap pre-flight checks before calling axint_compile, or to " +
          "surface errors in an editor. Prefer axint_compile directly when " +
          "you need the Swift output and can handle inline diagnostics.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            source: {
              type: "string",
              description:
                "Full TypeScript source code containing a defineIntent() call. " +
                "Must be a complete file starting with an axint import, not a " +
                "code fragment. Same format accepted by axint_compile.",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint_compile_from_schema",
        description:
          "Compile a minimal JSON schema directly to Swift, bypassing the " +
          "TypeScript DSL entirely. Supports intents, views, widgets, and " +
          "full apps via the 'type' parameter. Uses ~20 input tokens vs " +
          "hundreds for TypeScript — ideal for LLM agents optimizing token " +
          "budgets. Returns Swift source with token usage stats; no files " +
          "written, no network requests. On invalid input, returns an error " +
          "message describing the issue. Use this for quick Swift generation " +
          "without writing TypeScript; use axint_compile when you need the " +
          "full DSL for complex intents with custom perform() logic.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              enum: ["intent", "view", "widget", "app"],
              description:
                "What to compile. Determines which other parameters are relevant: " +
                "intent uses params/domain/title; view uses props/state/body; " +
                "widget uses entry/families/body/displayName; app uses scenes.",
            },
            name: {
              type: "string",
              description:
                "PascalCase name, e.g., 'CreateEvent' for intents, 'EventListView' " +
                "for views, 'StepsWidget' for widgets. Used as the Swift struct name.",
            },
            title: {
              type: "string",
              description:
                "Human-readable title shown in Shortcuts/Spotlight. Intent only. " +
                "E.g., 'Create Event'. Defaults to a space-separated version of name.",
            },
            description: {
              type: "string",
              description:
                "Description of what this intent/view/widget does. Shown to users " +
                "in system UI for intents. Optional but recommended.",
            },
            domain: {
              type: "string",
              description:
                "Apple App Intent domain. Intent only. One of: messaging, " +
                "productivity, health, finance, commerce, media, navigation, " +
                "smart-home. Omit if no standard domain applies.",
            },
            params: {
              type: "object",
              description:
                "Intent only. Parameter definitions as { fieldName: typeString }. " +
                "E.g., { recipient: 'string', amount: 'double' }. Supported types: " +
                "string, int, double, float, boolean, date, duration, url.",
              additionalProperties: { type: "string" },
            },
            props: {
              type: "object",
              description:
                "View only. Prop definitions as { fieldName: typeString }. " +
                "E.g., { title: 'string', count: 'int' }. Same type set as params.",
              additionalProperties: { type: "string" },
            },
            state: {
              type: "object",
              description:
                "View only. State variable definitions as " +
                "{ fieldName: { type: 'string', default?: value } }. " +
                "Generates @State properties in the SwiftUI view.",
            },
            body: {
              type: "string",
              description:
                "View/widget only. Raw SwiftUI code for the body, e.g., " +
                "'VStack { Text(\"Hello\") }'. Wrapped in the struct automatically. " +
                "Can reference props, state, and entry fields by name.",
            },
            displayName: {
              type: "string",
              description:
                "Widget only. Human-readable name shown in the widget gallery. " +
                "E.g., 'Daily Steps'. Defaults to a spaced version of name.",
            },
            families: {
              type: "array",
              items: { type: "string" },
              description:
                "Widget only. Supported widget sizes: systemSmall, systemMedium, " +
                "systemLarge, systemExtraLarge, accessoryCircular, " +
                "accessoryRectangular, accessoryInline. Defaults to [systemSmall].",
            },
            entry: {
              type: "object",
              description:
                "Widget only. Timeline entry fields as { fieldName: typeString }. " +
                "E.g., { steps: 'int', date: 'date' }. Available in the body template.",
              additionalProperties: { type: "string" },
            },
            refreshInterval: {
              type: "number",
              description:
                "Widget only. Timeline refresh interval in minutes. " +
                "E.g., 30 for half-hourly updates. Defaults to 60.",
            },
            scenes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: ["windowGroup", "window", "documentGroup", "settings"],
                    description:
                      "Scene type. windowGroup is most common for single-window apps.",
                  },
                  view: {
                    type: "string",
                    description:
                      "Root SwiftUI view name, e.g., 'ContentView'. Must be defined elsewhere.",
                  },
                  title: {
                    type: "string",
                    description: "Window title shown in the title bar",
                  },
                  name: {
                    type: "string",
                    description: "Unique scene identifier for programmatic access",
                  },
                  platform: {
                    type: "string",
                    enum: ["macOS", "iOS", "visionOS"],
                    description:
                      "Platform guard — wraps scene in #if os(...). Omit for cross-platform.",
                  },
                },
                required: ["kind", "view"],
              },
              description:
                "App only. Scene definitions for the @main App struct. " +
                "At least one scene with kind 'windowGroup' is typically required.",
            },
          },
          required: ["type", "name"],
        },
      },
      {
        name: "axint_list_templates",
        description:
          "List all bundled reference templates available in the axint SDK. " +
          "Returns an array of { id, name, description } objects — one per " +
          "template. No parameters, no files written, no network requests, " +
          "no side effects. Use this to discover template ids, then call " +
          "axint_template with a specific id to retrieve the full source. " +
          "Unlike axint_scaffold which generates from parameters, templates " +
          "are complete working examples with perform() logic included.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "axint_template",
        description:
          "Return the full TypeScript source code of a bundled reference " +
          "template by id. Returns a complete defineIntent() file that " +
          "compiles with axint_compile — no files written, no network " +
          "requests. Returns an error message if the id is not found. " +
          "Call axint_list_templates first to discover valid ids. Unlike " +
          "axint_scaffold which generates a skeleton, templates include " +
          "complete perform() logic and are ready to use as-is.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description:
                "Template id from axint_list_templates, e.g., 'send-message' " +
                "or 'create-event'. Case-sensitive, kebab-case format.",
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

/**
 * Sandbox server for Smithery scanning — returns a configured server
 * without connecting a transport, so Smithery can discover tools.
 */
export function createSandboxServer(): Server {
  return createAxintServer();
}

export async function startMCPServer(): Promise<void> {
  const server = createAxintServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
