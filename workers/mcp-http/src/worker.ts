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
 * Endpoint: POST /mcp
 * Health:   GET /health
 */

// Import generators + validators directly — avoids pulling in the TS parser
import { generateSwift, generateInfoPlistFragment, generateEntitlementsFragment } from "../../../src/core/generator.js";
import { generateSwiftUIView } from "../../../src/core/view-generator.js";
import { generateSwiftWidget } from "../../../src/core/widget-generator.js";
import { generateSwiftApp } from "../../../src/core/app-generator.js";
import { validateIntent } from "../../../src/core/validator.js";
import { validateView } from "../../../src/core/view-validator.js";
import { validateWidget } from "../../../src/core/widget-validator.js";
import { validateApp } from "../../../src/core/app-validator.js";
import { scaffoldIntent } from "../../../src/mcp/scaffold.js";
import { TEMPLATES, getTemplate } from "../../../src/templates/index.js";
import type {
  IRIntent, IRView, IRWidget, IRWidgetEntry, IRApp, IRScene,
  IRViewState, IRViewProp, IRParameter, IRType,
  WidgetFamily, WidgetRefreshPolicy, SceneKind, Diagnostic,
} from "../../../src/core/types.js";
import { isPrimitiveType, isSceneKind } from "../../../src/core/types.js";

const VERSION = "0.3.3";

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
  return { content: [{ type: "text", text: `// In: ~${inputTokens}  Out: ~${out}  Ratio: ${ratio}x  Saved: ${saved > 0 ? `+${saved}` : saved}\n\n${swift}` }] };
}

function textResult(text: string, isError = false) {
  return isError
    ? { content: [{ type: "text", text }], isError: true }
    : { content: [{ type: "text", text }] };
}

// --- Tool definitions ---

const TOOLS = [
  {
    name: "axint_scaffold",
    description: "Generate a starter TypeScript intent file. Pass PascalCase name, description, optional domain and params.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "PascalCase intent name" },
        description: { type: "string", description: "What the intent does" },
        domain: { type: "string", description: "Apple App Intent domain" },
        params: { type: "array", description: "Parameters: { name, type, description }", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, description: { type: "string" } }, required: ["name", "type", "description"] } },
      },
      required: ["name", "description"],
    },
  },
  {
    name: "axint_compile",
    description: "Compile TypeScript intent → Swift. Note: on this remote endpoint, use axint_compile_from_schema for best results. Full TS compilation is available via the CLI (`npx @axintai/compiler axint-mcp`).",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: { type: "string", description: "TypeScript source" },
        fileName: { type: "string" },
        emitInfoPlist: { type: "boolean" },
        emitEntitlements: { type: "boolean" },
      },
      required: ["source"],
    },
  },
  {
    name: "axint_validate",
    description: "Validate a TypeScript intent definition. Note: on this remote endpoint, use axint_compile_from_schema for validation. Full TS validation available via CLI.",
    inputSchema: {
      type: "object" as const,
      properties: { source: { type: "string" } },
      required: ["source"],
    },
  },
  {
    name: "axint_compile_from_schema",
    description: "Compile minimal JSON schema → Swift. Supports intents, views, widgets, apps. ~20 tokens input vs hundreds for full TS. Recommended for remote usage.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", enum: ["intent", "view", "widget", "app"] },
        name: { type: "string", description: "PascalCase name" },
        title: { type: "string" },
        description: { type: "string" },
        domain: { type: "string" },
        params: { type: "object", additionalProperties: { type: "string" } },
        props: { type: "object", additionalProperties: { type: "string" } },
        state: { type: "object" },
        body: { type: "string" },
        displayName: { type: "string" },
        families: { type: "array", items: { type: "string" } },
        entry: { type: "object", additionalProperties: { type: "string" } },
        refreshInterval: { type: "number" },
        scenes: { type: "array", items: { type: "object", properties: { kind: { type: "string" }, view: { type: "string" }, title: { type: "string" }, name: { type: "string" }, platform: { type: "string" } }, required: ["kind", "view"] } },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "axint_list_templates",
    description: "List bundled reference templates.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "axint_template",
    description: "Return the full source of a bundled template by id.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

// --- Tool dispatch ---

type SchemaArgs = {
  type: string; name: string; title?: string; description?: string; domain?: string;
  params?: Record<string, string>; props?: Record<string, string>;
  state?: Record<string, { type: string; default?: unknown }>; body?: string;
  displayName?: string; families?: string[]; entry?: Record<string, string>;
  refreshInterval?: number;
  scenes?: Array<{ kind: string; view: string; title?: string; name?: string; platform?: string }>;
};

function compileFromSchema(args: SchemaArgs) {
  const inputTokens = Math.ceil(JSON.stringify(args).length / 4);

  if (args.type === "intent") {
    if (!args.name) return textResult("[AX002] error: requires 'name'", true);
    const parameters: IRParameter[] = args.params
      ? Object.entries(args.params).map(([name, t]) => ({ name, type: schemaTypeToIRType(t), title: name.replace(/([A-Z])/g, " $1").trim(), description: "", isOptional: false }))
      : [];
    const ir: IRIntent = { name: args.name, title: args.title || args.name.replace(/([A-Z])/g, " $1").trim(), description: args.description || "", domain: args.domain, parameters, returnType: { kind: "primitive", value: "string" }, sourceFile: "<schema>" };
    const diags = validateIntent(ir);
    if (diags.some((d) => d.severity === "error")) return textResult(diagText(diags), true);
    const swift = generateSwift(ir);
    return formatOutput(swift, inputTokens);
  }

  if (args.type === "view") {
    if (!args.name) return textResult("[AX301] error: requires 'name'", true);
    const props: IRViewProp[] = args.props ? Object.entries(args.props).map(([name, t]) => ({ name, type: schemaTypeToIRType(t), isOptional: false })) : [];
    const state: IRViewState[] = args.state ? Object.entries(args.state).map(([name, cfg]) => ({ name, type: schemaTypeToIRType(cfg.type || "string"), kind: "state" as const, defaultValue: cfg.default })) : [];
    const ir: IRView = { name: args.name, props, state, body: args.body ? [{ kind: "raw", swift: args.body }] : [{ kind: "text", content: "VStack {}" }], sourceFile: "<schema>" };
    const diags = validateView(ir);
    if (diags.some((d) => d.severity === "error")) return textResult(diagText(diags), true);
    const swift = generateSwiftUIView(ir);
    return formatOutput(swift, inputTokens);
  }

  if (args.type === "widget") {
    if (!args.name) return textResult("[AX402] error: requires 'name'", true);
    if (!args.displayName) return textResult("[AX403] error: requires 'displayName'", true);
    const entries: IRWidgetEntry[] = args.entry ? Object.entries(args.entry).map(([name, t]) => ({ name, type: schemaTypeToIRType(t) })) : [];
    const validFamilies = new Set(["systemSmall", "systemMedium", "systemLarge", "systemExtraLarge", "accessoryCircular", "accessoryRectangular", "accessoryInline"]);
    const families = (args.families || ["systemSmall"]).filter((f): f is WidgetFamily => validFamilies.has(f));
    const refreshPolicy: WidgetRefreshPolicy = args.refreshInterval ? "after" : "atEnd";
    const ir: IRWidget = { name: args.name, displayName: args.displayName, description: args.description || "", families, entry: entries, body: args.body ? [{ kind: "raw", swift: args.body }] : [{ kind: "text", content: "Hello" }], refreshInterval: args.refreshInterval, refreshPolicy, sourceFile: "<schema>" };
    const diags = validateWidget(ir);
    if (diags.some((d) => d.severity === "error")) return textResult(diagText(diags), true);
    const swift = generateSwiftWidget(ir);
    return formatOutput(swift, inputTokens);
  }

  if (args.type === "app") {
    if (!args.name) return textResult("[AX502] error: requires 'name'", true);
    if (!args.scenes?.length) return textResult("[AX503] error: requires at least one scene", true);
    const scenes: IRScene[] = (args.scenes || []).map((s, i) => ({ sceneKind: toSceneKind(s.kind), rootView: s.view, title: s.title, name: s.name, platformGuard: toPlatformGuard(s.platform), isDefault: i === 0 && (s.kind || "windowGroup") === "windowGroup" }));
    const ir: IRApp = { name: args.name, scenes, sourceFile: "<schema>" };
    const diags = validateApp(ir);
    if (diags.some((d) => d.severity === "error")) return textResult(diagText(diags), true);
    const swift = generateSwiftApp(ir);
    return formatOutput(swift, inputTokens);
  }

  return textResult(`Invalid type: ${args.type}`, true);
}

function handleTool(name: string, args: Record<string, unknown>) {
  if (name === "axint_scaffold") {
    const a = args as { name: string; description: string; domain?: string; params?: Array<{ name: string; type: string; description: string }> };
    return textResult(scaffoldIntent(a));
  }

  if (name === "axint_compile" || name === "axint_validate") {
    return textResult(
      "Full TypeScript compilation requires the local MCP server (`npx @axintai/compiler axint-mcp`). " +
      "Use axint_compile_from_schema instead — it accepts a minimal JSON schema and produces identical Swift output with fewer tokens.",
      true
    );
  }

  if (name === "axint_compile_from_schema") {
    return compileFromSchema(args as unknown as SchemaArgs);
  }

  if (name === "axint_list_templates") {
    const list = TEMPLATES.map((t) => `${t.id}  —  ${t.title}${t.domain ? ` [${t.domain}]` : ""}`).join("\n");
    return textResult(list || "No templates registered.");
  }

  if (name === "axint_template") {
    const tpl = getTemplate((args as { id: string }).id);
    if (!tpl) return textResult(`Unknown template id: ${(args as { id: string }).id}`, true);
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
        capabilities: { tools: {} },
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
      const toolArgs = ((params as { arguments?: Record<string, unknown> })?.arguments || {}) as Record<string, unknown>;
      if (!toolName) return jsonrpcError(id, -32602, "Missing tool name");
      try {
        return jsonrpc(id, handleTool(toolName, toolArgs));
      } catch (err) {
        return jsonrpc(id, textResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`, true));
      }
    }

    return jsonrpcError(id, -32601, `Unknown method: ${method}`);
  },
};
