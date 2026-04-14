/**
 * Axint MCP Server — Cloudflare Worker
 *
 * Implements the MCP JSON-RPC protocol over HTTP using the Fetch API.
 * Stateless — each request is self-contained.
 *
 * The TS parser can't run in Workers (depends on the `typescript` package
 * which uses __filename), so compileSource/validate are handled by falling
 * back to the IR-based tools. The FromIR tools and scaffold/templates work
 * natively since generators and validators are pure functions.
 *
 * Tools:
 *   - axint.feature:          Generate a complete Apple-native feature package
 *   - axint.suggest:          Suggest Apple-native features for an app domain
 *   - axint.scaffold:         Generate a starter TypeScript intent file
 *   - axint.compile:          Compile TypeScript intent → Swift (local only)
 *   - axint.validate:         Validate intent definition (local only)
 *   - axint.schema.compile:   Compile JSON schema → Swift (recommended)
 *   - axint.templates.list:   List bundled reference templates
 *   - axint.templates.get:    Return template source by id
 *
 * Endpoint: POST /mcp
 * Health:   GET /health
 */

// Import generators + validators directly — avoids pulling in the TS parser
import { generateSwift } from "../../../src/core/generator.js";
import { generateSwiftUIView } from "../../../src/core/view-generator.js";
import { generateSwiftWidget } from "../../../src/core/widget-generator.js";
import { generateSwiftApp } from "../../../src/core/app-generator.js";
import { validateIntent } from "../../../src/core/validator.js";
import { validateView } from "../../../src/core/view-validator.js";
import { validateWidget } from "../../../src/core/widget-validator.js";
import { validateApp } from "../../../src/core/app-validator.js";
import { scaffoldIntent } from "../../../src/mcp/scaffold.js";
import { generateFeature } from "../../../src/mcp/feature.js";
import { suggestFeatures } from "../../../src/mcp/suggest.js";
import type { FeatureInput, Surface } from "../../../src/mcp/feature.js";
import type { SuggestInput } from "../../../src/mcp/suggest.js";
import { TEMPLATES, getTemplate } from "../../../src/templates/index.js";
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
  Diagnostic,
} from "../../../src/core/types.js";
import { isPrimitiveType, isSceneKind } from "../../../src/core/types.js";

const VERSION = "0.3.8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function jsonrpc(id: unknown, result: unknown): Response {
  return json({ jsonrpc: "2.0", id, result });
}

function jsonrpcError(id: unknown, code: number, message: string): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } });
}

// --- Helpers ---

const VALID_PLATFORMS = new Set(["macOS", "iOS", "visionOS"]);
type Platform = "macOS" | "iOS" | "visionOS";

function schemaTypeToIRType(typeStr: string): IRType {
  const normalized = typeStr === "number" ? "int" : typeStr;
  return isPrimitiveType(normalized)
    ? { kind: "primitive", value: normalized }
    : { kind: "primitive", value: "string" };
}

function toSceneKind(kind: string | undefined): SceneKind {
  const k = kind || "windowGroup";
  return isSceneKind(k) ? k : "windowGroup";
}

function toPlatformGuard(p: string | undefined): Platform | undefined {
  return p && VALID_PLATFORMS.has(p) ? (p as Platform) : undefined;
}

function diagText(ds: Diagnostic[]) {
  return ds.map((d) => `[${d.code}] ${d.severity}: ${d.message}`).join("\n");
}

function formatOutput(swift: string, inputTokens: number) {
  const out = Math.ceil(swift.length / 4);
  const ratio = inputTokens > 0 ? (out / inputTokens).toFixed(2) : "0.00";
  const saved = inputTokens - out;
  return {
    content: [
      {
        type: "text",
        text: `// In: ~${inputTokens}  Out: ~${out}  Ratio: ${ratio}x  Saved: ${saved > 0 ? `+${saved}` : saved}\n\n${swift}`,
      },
    ],
  };
}

function textResult(text: string, isError = false) {
  return isError
    ? { content: [{ type: "text", text }], isError: true }
    : { content: [{ type: "text", text }] };
}

// --- Tool definitions ---

const TOOLS = [
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
          items: { type: "string", enum: ["intent", "view", "widget"] },
          description:
            "Which Apple surfaces to generate. 'intent' produces an App Intent " +
            "struct for Siri/Shortcuts/Spotlight. 'widget' produces a WidgetKit " +
            "widget with timeline provider. 'view' produces a SwiftUI view. " +
            "Defaults to ['intent'] if omitted.",
        },
        name: {
          type: "string",
          description:
            "PascalCase feature name, e.g., 'LogWaterIntake'. If omitted, " +
            "inferred from the description.",
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
            "inferred from the description.",
        },
        params: {
          type: "object",
          description:
            "Explicit parameter definitions as { fieldName: typeString }. " +
            "E.g., { amount: 'double', unit: 'string' }. If omitted, " +
            "inferred from the domain and description.",
          additionalProperties: { type: "string" },
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
            "'A fitness tracking app that logs workouts and counts steps'. " +
            "Used to suggest relevant Apple-native features.",
        },
        domain: {
          type: "string",
          description:
            "Primary app domain. One of: messaging, productivity, health, " +
            "finance, commerce, media, navigation, smart-home.",
        },
        limit: {
          type: "number",
          description: "Maximum number of suggestions to return. Defaults to 5.",
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
      "App Intent code. Note: on this remote endpoint, full TS compilation " +
      "is not available — use axint.schema.compile for best results. Full " +
      "TS compilation is available via the CLI (npx @axint/compiler axint-mcp).",
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
      "Validate a TypeScript intent definition without generating Swift " +
      "output. Note: on this remote endpoint, use axint.schema.compile " +
      "for validation. Full TS validation available via CLI.",
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
            description: "Scene definition with kind, view, and optional title/platform",
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
    name: "axint.templates.list",
    description:
      "List all bundled reference templates available in the axint SDK. " +
      "Returns an array of { id, name, description } objects — one per " +
      "template. No parameters, no files written, no network requests, " +
      "no side effects. Use this to discover template ids, then call " +
      "axint.templates.get with a specific id to retrieve the full source. " +
      "Unlike axint.scaffold which generates from parameters, templates " +
      "are complete working examples with perform() logic included.",
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
      "Return the full TypeScript source code of a bundled reference " +
      "template by id. Returns a complete defineIntent() file that " +
      "compiles with axint.compile — no files written, no network " +
      "requests. Returns an error message if the id is not found. " +
      "Call axint.templates.list first to discover valid ids. Unlike " +
      "axint.scaffold which generates a skeleton, templates include " +
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
            "Template id from axint.templates.list, e.g., 'send-message' " +
            "or 'create-event'. Case-sensitive, kebab-case format.",
        },
      },
      required: ["id"],
    },
  },
];

// --- Prompts ---

const PROMPTS = [
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
        description: "What the widget displays, e.g., 'daily step count from HealthKit'",
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
];

function getPromptMessages(name: string, args?: Record<string, string>) {
  if (name === "axint.quick-start") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
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
          role: "user",
          content: {
            type: "text",
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
          role: "user",
          content: {
            type: "text",
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
        role: "user",
        content: {
          type: "text",
          text: `Unknown prompt: ${name}. Use axint.quick-start, axint.create-widget, or axint.create-intent.`,
        },
      },
    ],
  };
}

// --- Tool dispatch ---

type SchemaArgs = {
  type: string;
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

function compileFromSchema(args: SchemaArgs) {
  const inputTokens = Math.ceil(JSON.stringify(args).length / 4);

  if (args.type === "intent") {
    if (!args.name) return textResult("[AX002] error: requires 'name'", true);
    const parameters: IRParameter[] = args.params
      ? Object.entries(args.params).map(([name, t]) => ({
          name,
          type: schemaTypeToIRType(t),
          title: name.replace(/([A-Z])/g, " $1").trim(),
          description: "",
          isOptional: false,
        }))
      : [];
    const ir: IRIntent = {
      name: args.name,
      title: args.title || args.name.replace(/([A-Z])/g, " $1").trim(),
      description: args.description || "",
      domain: args.domain,
      parameters,
      returnType: { kind: "primitive", value: "string" },
      sourceFile: "<schema>",
    };
    const diags = validateIntent(ir);
    if (diags.some((d) => d.severity === "error"))
      return textResult(diagText(diags), true);
    const swift = generateSwift(ir);
    return formatOutput(swift, inputTokens);
  }

  if (args.type === "view") {
    if (!args.name) return textResult("[AX301] error: requires 'name'", true);
    const props: IRViewProp[] = args.props
      ? Object.entries(args.props).map(([name, t]) => ({
          name,
          type: schemaTypeToIRType(t),
          isOptional: false,
        }))
      : [];
    const state: IRViewState[] = args.state
      ? Object.entries(args.state).map(([name, cfg]) => ({
          name,
          type: schemaTypeToIRType(cfg.type || "string"),
          kind: "state" as const,
          defaultValue: cfg.default,
        }))
      : [];
    const ir: IRView = {
      name: args.name,
      props,
      state,
      body: args.body
        ? [{ kind: "raw", swift: args.body }]
        : [{ kind: "text", content: "VStack {}" }],
      sourceFile: "<schema>",
    };
    const diags = validateView(ir);
    if (diags.some((d) => d.severity === "error"))
      return textResult(diagText(diags), true);
    const swift = generateSwiftUIView(ir);
    return formatOutput(swift, inputTokens);
  }

  if (args.type === "widget") {
    if (!args.name) return textResult("[AX402] error: requires 'name'", true);
    if (!args.displayName)
      return textResult("[AX403] error: requires 'displayName'", true);
    const entries: IRWidgetEntry[] = args.entry
      ? Object.entries(args.entry).map(([name, t]) => ({
          name,
          type: schemaTypeToIRType(t),
        }))
      : [];
    const validFamilies = new Set([
      "systemSmall",
      "systemMedium",
      "systemLarge",
      "systemExtraLarge",
      "accessoryCircular",
      "accessoryRectangular",
      "accessoryInline",
    ]);
    const families = (args.families || ["systemSmall"]).filter((f): f is WidgetFamily =>
      validFamilies.has(f)
    );
    const refreshPolicy: WidgetRefreshPolicy = args.refreshInterval ? "after" : "atEnd";
    const ir: IRWidget = {
      name: args.name,
      displayName: args.displayName,
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
    const diags = validateWidget(ir);
    if (diags.some((d) => d.severity === "error"))
      return textResult(diagText(diags), true);
    const swift = generateSwiftWidget(ir);
    return formatOutput(swift, inputTokens);
  }

  if (args.type === "app") {
    if (!args.name) return textResult("[AX502] error: requires 'name'", true);
    if (!args.scenes?.length)
      return textResult("[AX503] error: requires at least one scene", true);
    const scenes: IRScene[] = (args.scenes || []).map((s, i) => ({
      sceneKind: toSceneKind(s.kind),
      rootView: s.view,
      title: s.title,
      name: s.name,
      platformGuard: toPlatformGuard(s.platform),
      isDefault: i === 0 && (s.kind || "windowGroup") === "windowGroup",
    }));
    const ir: IRApp = { name: args.name, scenes, sourceFile: "<schema>" };
    const diags = validateApp(ir);
    if (diags.some((d) => d.severity === "error"))
      return textResult(diagText(diags), true);
    const swift = generateSwiftApp(ir);
    return formatOutput(swift, inputTokens);
  }

  return textResult(`Invalid type: ${args.type}`, true);
}

function handleTool(name: string, args: Record<string, unknown>) {
  if (name === "axint.feature") {
    const a = args as unknown as FeatureInput;
    if (!a.description)
      return textResult("Error: 'description' is required for axint.feature", true);
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
      content: [{ type: "text", text: output.join("\n") }],
      isError: !result.success,
    };
  }

  if (name === "axint.suggest") {
    const a = args as unknown as SuggestInput;
    if (!a.appDescription)
      return textResult("Error: 'appDescription' is required for axint.suggest", true);
    const suggestions = suggestFeatures(a);
    const output = suggestions
      .map((s, i) => {
        const surfaces = s.surfaces.join(", ");
        return `${i + 1}. ${s.name}\n   ${s.description}\n   Surfaces: ${surfaces} | Complexity: ${s.complexity}\n   Prompt: "${s.featurePrompt}"`;
      })
      .join("\n\n");
    return textResult(
      suggestions.length > 0
        ? `Suggested Apple-native features:\n\n${output}\n\nUse axint.feature with any prompt above to generate the full feature package.`
        : "No specific suggestions for this app description. Try providing more detail about the app's purpose."
    );
  }

  if (name === "axint.scaffold") {
    const a = args as {
      name: string;
      description: string;
      domain?: string;
      params?: Array<{ name: string; type: string; description: string }>;
    };
    return textResult(scaffoldIntent(a));
  }

  if (name === "axint.compile" || name === "axint.validate") {
    return textResult(
      "Full TypeScript compilation requires the local MCP server (`npx @axint/compiler axint-mcp`). " +
        "Use axint.schema.compile instead — it accepts a minimal JSON schema and produces identical Swift output with fewer tokens.",
      true
    );
  }

  if (name === "axint.schema.compile") {
    return compileFromSchema(args as unknown as SchemaArgs);
  }

  if (name === "axint.templates.list") {
    const list = TEMPLATES.map(
      (t) => `${t.id}  —  ${t.title}${t.domain ? ` [${t.domain}]` : ""}`
    ).join("\n");
    return textResult(list || "No templates registered.");
  }

  if (name === "axint.templates.get") {
    const tpl = getTemplate((args as { id: string }).id);
    if (!tpl)
      return textResult(`Unknown template id: ${(args as { id: string }).id}`, true);
    return textResult(tpl.source);
  }

  return textResult(`Unknown tool: ${name}`, true);
}

// --- Fetch handler ---

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, server: "axint-mcp", version: VERSION });
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    if (request.method !== "POST") {
      return jsonrpcError(null, -32000, "POST only");
    }

    let body: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return jsonrpcError(null, -32700, "Parse error");
    }

    const { id, method, params } = body;

    if (method === "initialize") {
      return jsonrpc(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "axint", version: VERSION },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (method === "tools/list") {
      return jsonrpc(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const toolName = (params as { name?: string })?.name;
      const toolArgs = ((params as { arguments?: Record<string, unknown> })?.arguments ||
        {}) as Record<string, unknown>;
      if (!toolName) return jsonrpcError(id, -32602, "Missing tool name");
      try {
        return jsonrpc(id, handleTool(toolName, toolArgs));
      } catch (err) {
        return jsonrpc(
          id,
          textResult(
            `Tool error: ${err instanceof Error ? err.message : String(err)}`,
            true
          )
        );
      }
    }

    if (method === "prompts/list") {
      return jsonrpc(id, { prompts: PROMPTS });
    }

    if (method === "prompts/get") {
      const promptName = (params as { name?: string })?.name;
      const promptArgs = (params as { arguments?: Record<string, string> })?.arguments;
      if (!promptName) return jsonrpcError(id, -32602, "Missing prompt name");
      return jsonrpc(id, getPromptMessages(promptName, promptArgs));
    }

    return jsonrpcError(id, -32601, `Unknown method: ${method}`);
  },
};
