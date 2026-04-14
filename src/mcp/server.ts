/**
 * Axint MCP Server
 *
 * Exposes Axint capabilities as MCP tools that AI coding assistants
 * (Claude Code, Cursor, Windsurf, Zed, any MCP client) can call
 * automatically.
 *
 * Tools:
 *   - axint.feature:          Generate a complete Apple-native feature package
 *   - axint.suggest:          Suggest Apple-native features for an app domain
 *   - axint.scaffold:         Generate a starter TypeScript intent file
 *   - axint.compile:          Compile TypeScript intent → Swift App Intent
 *   - axint.validate:         Validate an intent definition without codegen
 *   - axint.schema.compile:   Compile minimal JSON schema → Swift (token saver)
 *   - axint.swift.validate:   Validate an existing Swift source against AX700+ rules
 *   - axint.swift.fix:        Auto-fix mechanical Swift validator errors
 *   - axint.templates.list:   List bundled reference templates
 *   - axint.templates.get:    Return the source of a specific template
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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
import { generateFeature, type FeatureInput, type Surface } from "./feature.js";
import { suggestFeatures, type SuggestInput } from "./suggest.js";
import { TEMPLATES, getTemplate } from "../templates/index.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import { fixSwiftSource } from "../core/swift-fixer.js";
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
let pkg = { version: "0.3.8" };
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
    { capabilities: { tools: {}, prompts: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "axint.feature",
        description:
          "Generate a complete Apple-native feature package from a description. " +
          "Returns multiple files: validated Swift source, companion widget/view, " +
          "Info.plist fragments, entitlements, and XCTest scaffolds — all structured " +
          "file-by-file so an Xcode agent can write each file directly into the " +
          "project. Designed for composition with Xcode MCP tools: call " +
          "axint.feature to generate the package, then use XcodeWrite to place " +
          "each file. No files written, no network requests, no side effects.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            description: {
              type: "string",
              description:
                "What the feature does, in natural language. E.g., " +
                "'Let users log water intake via Siri' or " +
                "'Add a Spotlight-searchable recipe entity'. The description " +
                "is used to infer the feature name, domain, and parameters.",
            },
            surfaces: {
              type: "array",
              items: {
                type: "string",
                enum: ["intent", "view", "widget"],
              },
              description:
                "Which Apple surfaces to generate. 'intent' produces an App Intent " +
                "struct for Siri/Shortcuts/Spotlight. 'widget' produces a WidgetKit " +
                "widget with timeline provider. 'view' produces a SwiftUI view. " +
                "Defaults to ['intent'] if omitted. Combine surfaces to generate " +
                "a complete feature: ['intent', 'widget'] for a Siri action + " +
                "home screen widget.",
            },
            name: {
              type: "string",
              description:
                "PascalCase feature name, e.g., 'LogWaterIntake'. If omitted, " +
                "inferred from the description. Used as the base name for all " +
                "generated Swift structs.",
            },
            appName: {
              type: "string",
              description:
                "The target app name, used in generated comments and test " +
                "references. E.g., 'HealthTracker'. Optional.",
            },
            domain: {
              type: "string",
              description:
                "Apple App Intent domain. One of: messaging, productivity, health, " +
                "finance, commerce, media, navigation, smart-home. If omitted, " +
                "inferred from the description. Determines default entitlements, " +
                "Info.plist keys, and parameter suggestions.",
            },
            params: {
              type: "object",
              description:
                "Explicit parameter definitions as { fieldName: typeString }. " +
                "E.g., { amount: 'double', unit: 'string' }. If omitted, " +
                "inferred from the domain and description. Types: string, int, " +
                "double, float, boolean, date, duration, url.",
              additionalProperties: {
                type: "string",
                description: "Swift type for this parameter",
              },
            },
          },
          required: ["description"],
        },
      },
      {
        name: "axint.suggest",
        description:
          "Suggest Apple-native features for an app based on its domain or " +
          "description. Returns a ranked list of features with recommended " +
          "surfaces (intent, widget, view), estimated complexity, and a " +
          "one-line description for each. Use this to discover what Axint " +
          "can generate for an app before calling axint.feature. No files " +
          "written, no network requests, no side effects.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            appDescription: {
              type: "string",
              description:
                "What the app does, in natural language. E.g., " +
                "'A fitness tracking app that logs workouts and counts steps' or " +
                "'A recipe app for discovering and saving meals'. Used to " +
                "suggest relevant Apple-native features.",
            },
            domain: {
              type: "string",
              description:
                "Primary app domain. One of: messaging, productivity, health, " +
                "finance, commerce, media, navigation, smart-home. If provided, " +
                "suggestions are tailored to this domain.",
            },
            limit: {
              type: "number",
              description:
                "Maximum number of suggestions to return. Defaults to 5. " +
                "Suggestions are ordered by estimated user impact.",
            },
          },
          required: ["appDescription"],
        },
      },
      {
        name: "axint.scaffold",
        description:
          "Generate a starter TypeScript intent file from a name and description. " +
          "Returns a complete defineIntent() source string ready to save as a .ts " +
          "file — no files are written, no network requests made. On invalid " +
          "domain values, returns an error string. The output compiles directly " +
          "with axint.compile. Use this when creating a new intent from scratch; " +
          "use axint.templates.get for a working reference example, or " +
          "axint.schema.compile to generate Swift without writing TypeScript.",
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
                description: "Parameter definition with name, type, and description",
                properties: {
                  name: {
                    type: "string",
                    description:
                      "camelCase parameter name, e.g., 'recipient' or 'messageBody'. " +
                      "Used as the Swift property name in the generated AppIntent struct.",
                  },
                  type: {
                    type: "string",
                    description:
                      "Parameter type. One of: string, int, double, float, boolean, " +
                      "date, duration, url. Maps to the corresponding Swift type.",
                  },
                  description: {
                    type: "string",
                    description:
                      "Human-readable description shown in Shortcuts and Spotlight " +
                      "when users configure the intent parameter.",
                  },
                },
                required: ["name", "type", "description"],
              },
            },
          },
          required: ["name", "description"],
        },
      },
      {
        name: "axint.compile",
        description:
          "Compile TypeScript source (defineIntent() call) into native Swift " +
          "App Intent code. Returns { swift, infoPlist?, entitlements? } as a " +
          "string — no files written, no network requests. On validation " +
          "failure, returns diagnostics (severity, AX error code, position, " +
          "fix suggestion) instead of Swift. Use axint.validate for cheaper " +
          "pre-flight checks without compilation output; use " +
          "axint.schema.compile to compile from JSON without writing " +
          "TypeScript; use axint.scaffold to generate the TypeScript input.",
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
        name: "axint.validate",
        description:
          "Validate a TypeScript intent definition without generating Swift. " +
          "Runs the full Axint validation pipeline (150 diagnostic rules) and " +
          "returns a JSON array of diagnostics: { severity: 'error'|'warning', " +
          "code: 'AXnnn', line: number, column: number, message: string, " +
          "suggestion?: string }. Returns an empty array [] when validation " +
          "passes. Checks intent names (PascalCase), parameter types, domain " +
          "values, entity queries, widget families, view props, and app scenes. " +
          "No files written, no network requests, no side effects. Use for " +
          "cheap pre-flight checks before calling axint.compile. Prefer " +
          "axint.compile directly when you need Swift output — it includes " +
          "inline diagnostics. For Swift source validation use axint.swift.validate.",
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
                "code fragment. Same format accepted by axint.compile.",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint.schema.compile",
        description:
          "Compile a minimal JSON schema directly to Swift, bypassing the " +
          "TypeScript DSL entirely. Supports intents, views, widgets, and " +
          "full apps via the 'type' parameter. Uses ~20 input tokens vs " +
          "hundreds for TypeScript — ideal for LLM agents optimizing token " +
          "budgets. Returns Swift source with token usage stats; no files " +
          "written, no network requests. On invalid input, returns an error " +
          "message describing the issue. Use this for quick Swift generation " +
          "without writing TypeScript; use axint.compile when you need the " +
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
              additionalProperties: {
                type: "string",
                description:
                  "Swift type for this parameter: string, int, double, float, boolean, date, duration, or url",
              },
            },
            props: {
              type: "object",
              description:
                "View only. Prop definitions as { fieldName: typeString }. " +
                "E.g., { title: 'string', count: 'int' }. Same type set as params.",
              additionalProperties: {
                type: "string",
                description:
                  "Swift type for this prop: string, int, double, float, boolean, date, duration, or url",
              },
            },
            state: {
              type: "object",
              description:
                "View only. State variable definitions as " +
                "{ fieldName: { type: 'string', default?: value } }. " +
                "Generates @State properties in the SwiftUI view.",
              additionalProperties: {
                type: "object",
                description: "State variable config with type and optional default value",
                properties: {
                  type: {
                    type: "string",
                    description:
                      "Swift type: string, int, double, float, boolean, date, duration, or url",
                  },
                  default: {
                    type: "string",
                    description: "Optional default value for the @State property",
                  },
                },
                required: ["type"],
              },
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
              items: {
                type: "string",
                description:
                  "Widget family: systemSmall, systemMedium, systemLarge, systemExtraLarge, accessoryCircular, accessoryRectangular, or accessoryInline",
              },
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
              additionalProperties: {
                type: "string",
                description:
                  "Swift type for this entry field: string, int, double, float, boolean, date, duration, or url",
              },
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
                description:
                  "Scene definition with kind, view, and optional title/platform",
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
        name: "axint.swift.validate",
        description:
          "Validate existing Swift source against 150 build-time rules " +
          "(AX700–AX749) including Swift 6 concurrency and Live Activities. " +
          "Catches bugs Xcode buries behind generic 'type does not conform' " +
          "errors: missing perform() on AppIntent, missing var body on Widget, " +
          "@State let instead of var, Sendable violations, @MainActor misuse on " +
          "actors, missing ActivityAttributes ContentState, and 140+ more. " +
          "Returns JSON array of { code, severity, message, line, suggestion }. " +
          "Empty array means the source is clean. Read-only, no files written, " +
          "no network requests, no side effects. Call this on any Swift source " +
          "before building — especially LLM-generated code. Pair with " +
          "axint.swift.fix to auto-repair mechanical issues.",
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
              description: "Full Swift source code to validate.",
            },
            file: {
              type: "string",
              description:
                "Optional file name to attach to diagnostics for editor integration.",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint.swift.fix",
        description:
          "Auto-fix mechanical Swift errors detected by axint.swift.validate. " +
          "Handles 20+ fix rules: rewrites @State let → @State var, injects " +
          "perform() into AppIntents, drops var body stubs into Widgets and " +
          "Apps, adds let date: Date to TimelineEntry, fixes DispatchQueue.main " +
          "→ Task { @MainActor in }, converts nonisolated var → let, strips " +
          "redundant @MainActor from actors, adds Codable+Hashable to " +
          "ActivityAttributes ContentState, and more. Returns JSON with " +
          "{ source: fixedSwift, fixes: [...applied], remaining: [...unfixed] }. " +
          "Non-mechanical issues (empty descriptions, missing copy) are left " +
          "for the developer. Read-only output, no files written, no network " +
          "requests, no side effects. Call axint.swift.validate first to " +
          "preview diagnostics, then axint.swift.fix to apply repairs.",
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
              description: "Full Swift source code to fix.",
            },
            file: {
              type: "string",
              description: "Optional file name to attach to diagnostics.",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "axint.templates.list",
        description:
          "List all 25 bundled reference templates in the Axint SDK. Returns " +
          "a JSON array of { id, name, description } objects — one per template. " +
          "Templates cover messaging, productivity, health, finance, commerce, " +
          "media, navigation, smart-home, and entity/query patterns. No input " +
          "parameters required, no files written, no network requests, no side " +
          "effects. Call this to discover template ids, then call " +
          "axint.templates.get with a specific id to retrieve the full source. " +
          "Unlike axint.scaffold (which generates a skeleton from parameters), " +
          "templates are complete working examples with perform() logic, " +
          "entity queries, and best-practice patterns included.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object" as const,
        },
      },
      {
        name: "axint.templates.get",
        description:
          "Retrieve the full TypeScript source code of a specific bundled " +
          "template by id. Returns a complete, compilable defineIntent() file " +
          "as a string — ready to save as .ts and compile with axint.compile. " +
          "Includes perform() logic, parameter definitions, and domain-specific " +
          "patterns. Returns an error message if the id is not found (call " +
          "axint.templates.list first to discover valid ids). No files written, " +
          "no network requests, no side effects. Use templates as starting " +
          "points — edit the returned source to match your app, then compile.",
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
                "Template id from axint.templates.list, e.g., 'send-message' " +
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
      if (name === "axint.feature") {
        const a = args as unknown as FeatureInput;
        if (!a.description) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: 'description' is required for axint.feature",
              },
            ],
            isError: true,
          };
        }
        const result = generateFeature({
          description: a.description,
          surfaces: a.surfaces as Surface[] | undefined,
          name: a.name,
          appName: a.appName,
          domain: a.domain,
          params: a.params,
        });

        const output: string[] = [result.summary, ""];

        for (const file of result.files) {
          output.push(`// ─── ${file.path} ───`);
          output.push(file.content);
          output.push("");
        }

        if (result.diagnostics.length > 0) {
          output.push("// ─── Diagnostics ───");
          output.push(result.diagnostics.join("\n"));
        }

        return {
          content: [{ type: "text" as const, text: output.join("\n") }],
          isError: !result.success,
        };
      }

      if (name === "axint.suggest") {
        const a = args as unknown as SuggestInput;
        if (!a.appDescription) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: 'appDescription' is required for axint.suggest",
              },
            ],
            isError: true,
          };
        }
        const suggestions = suggestFeatures(a);
        const output = suggestions
          .map((s, i) => {
            const surfaces = s.surfaces.join(", ");
            return `${i + 1}. ${s.name}\n   ${s.description}\n   Surfaces: ${surfaces} | Complexity: ${s.complexity}\n   Prompt: "${s.featurePrompt}"`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text:
                suggestions.length > 0
                  ? `Suggested Apple-native features:\n\n${output}\n\nUse axint.feature with any prompt above to generate the full feature package.`
                  : "No specific suggestions for this app description. Try providing more detail about the app's purpose.",
            },
          ],
        };
      }

      if (name === "axint.scaffold") {
        const a = args as unknown as ScaffoldArgs;
        const source = scaffoldIntent({
          name: a.name,
          description: a.description,
          domain: a.domain,
          params: a.params,
        });
        return { content: [{ type: "text" as const, text: source }] };
      }

      if (name === "axint.compile") {
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

      if (name === "axint.validate") {
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

      if (name === "axint.schema.compile") {
        return handleCompileFromSchema(args as unknown as SchemaCompileArgs);
      }

      if (name === "axint.swift.validate") {
        const a = args as unknown as { source: string; file?: string };
        const result = validateSwiftSource(a.source, a.file ?? "<input>");
        const text =
          result.diagnostics.length > 0
            ? result.diagnostics
                .map(
                  (d) =>
                    `[${d.code}] ${d.severity}${d.line ? ` line ${d.line}` : ""}: ${d.message}` +
                    (d.suggestion ? `\n  help: ${d.suggestion}` : "")
                )
                .join("\n")
            : "Swift source passes axint validation. No issues found.";
        return { content: [{ type: "text" as const, text }] };
      }

      if (name === "axint.swift.fix") {
        const a = args as unknown as { source: string; file?: string };
        const result = fixSwiftSource(a.source, a.file ?? "<input>");
        const summary =
          result.fixed.length === 0
            ? "No mechanical fixes applied."
            : `Applied ${result.fixed.length} fix${result.fixed.length === 1 ? "" : "es"}: ${result.fixed.map((d) => d.code).join(", ")}`;
        const remaining =
          result.remaining.length > 0
            ? `\nRemaining: ${result.remaining.map((d) => `[${d.code}] ${d.message}`).join("; ")}`
            : "";
        return {
          content: [
            { type: "text" as const, text: `${summary}${remaining}\n\n${result.source}` },
          ],
        };
      }

      if (name === "axint.templates.list") {
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

      if (name === "axint.templates.get") {
        const a = args as unknown as TemplateArgs;
        const tpl = getTemplate(a.id);
        if (!tpl) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown template id: ${a.id}. Use axint.templates.list to see available ids.`,
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

  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "axint.quick-start",
        description:
          "Step-by-step guide to compile your first TypeScript intent into " +
          "Swift using Axint. Walks through scaffold → compile → integrate.",
      },
      {
        name: "axint.create-widget",
        description:
          "Generate a SwiftUI widget from a description. Produces a complete " +
          "widget with timeline provider, entry type, and view body.",
        arguments: [
          {
            name: "widgetName",
            description: "PascalCase widget name, e.g., 'StepsWidget'",
            required: true,
          },
          {
            name: "widgetDescription",
            description:
              "What the widget displays, e.g., 'daily step count from HealthKit'",
            required: true,
          },
        ],
      },
      {
        name: "axint.create-intent",
        description:
          "Generate a complete App Intent from a natural language description. " +
          "Produces TypeScript source and compiles it to Swift in one step.",
        arguments: [
          {
            name: "intentName",
            description: "PascalCase intent name, e.g., 'SendMessage'",
            required: true,
          },
          {
            name: "intentDescription",
            description: "What the intent does, e.g., 'Send a message to a contact'",
            required: true,
          },
          {
            name: "domain",
            description:
              "Apple domain: messaging, productivity, health, finance, " +
              "commerce, media, navigation, smart-home. Omit if none apply.",
            required: false,
          },
        ],
      },
    ],
  }));

  // Handle prompt retrieval
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "axint.quick-start") {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                "I want to create my first Apple App Intent using Axint. " +
                "Walk me through the process step by step:\n\n" +
                "1. First, use axint.templates.list to show me available templates\n" +
                "2. Pick a simple one and show me its source with axint.templates.get\n" +
                "3. Compile it to Swift with axint.compile\n" +
                "4. Explain what each part of the Swift output does",
            },
          },
        ],
      };
    }

    if (name === "axint.create-widget") {
      const widgetName = args?.widgetName || "MyWidget";
      const widgetDescription = args?.widgetDescription || "a simple widget";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Create a SwiftUI widget called "${widgetName}" that shows ${widgetDescription}. ` +
                "Use axint.schema.compile with type 'widget' to generate the Swift code. " +
                "Include appropriate families, entry fields, and a clean SwiftUI body. " +
                "Show the final Swift output ready to drop into an Xcode project.",
            },
          },
        ],
      };
    }

    if (name === "axint.create-intent") {
      const intentName = args?.intentName || "MyIntent";
      const intentDescription = args?.intentDescription || "a custom action";
      const domain = args?.domain ? ` in the ${args.domain} domain` : "";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Create an App Intent called "${intentName}" that ${intentDescription}${domain}. ` +
                "Use axint.scaffold to generate the TypeScript source with appropriate parameters, " +
                "then compile it to Swift with axint.compile. Show both the TypeScript input and " +
                "the Swift output so I can see the full pipeline.",
            },
          },
        ],
      };
    }

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Unknown prompt: ${name}. Use axint.quick-start, axint.create-widget, or axint.create-intent.`,
          },
        },
      ],
    };
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
