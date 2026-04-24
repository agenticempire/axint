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
 *   - axint.cloud.check:      Run inline Swift validation in HTTP MCP
 *   - axint.tokens.ingest:    Ingest inline JSON/CSS token source in HTTP MCP
 *   - axint.schema.compile:   Compile JSON schema → Swift (recommended)
 *   - axint.swift.validate:   Validate Swift source against 150 Apple rules
 *   - axint.swift.fix:        Auto-fix mechanical Swift errors
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
import {
  buildSmartViewBody,
  reservedViewPropertyName,
} from "../../../src/mcp/view-blueprints.js";
import type { FeatureInput, Surface } from "../../../src/mcp/feature.js";
import type { SuggestInput } from "../../../src/mcp/suggest.js";
import { TEMPLATES, getTemplate } from "../../../src/templates/index.js";
import { validateSwiftSource } from "../../../src/core/swift-validator.js";
import { fixSwiftSource } from "../../../src/core/swift-fixer.js";
import { TOOL_MANIFEST } from "../../../src/mcp/manifest.js";
import { PROMPT_MANIFEST, getPromptMessages } from "../../../src/mcp/prompts.js";
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

const VERSION = "0.4.2";

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

type Env = {
  ALLOWED_ORIGINS?: string;
  MAX_BODY_BYTES?: string;
};

function resolveAllowedOrigin(origin: string | null, env: Env): string | null {
  const raw = env.ALLOWED_ORIGINS?.trim();
  if (!raw || raw === "*") return "*";
  const list = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origin && list.includes(origin)) return origin;
  return null;
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = resolveAllowedOrigin(origin, env);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    if (allowed !== "*") headers["Vary"] = "Origin";
  }
  return headers;
}

function resolveMaxBodyBytes(env: Env): number {
  const raw = env.MAX_BODY_BYTES;
  if (!raw) return DEFAULT_MAX_BODY_BYTES;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BODY_BYTES;
}

function json(data: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function jsonrpc(id: unknown, result: unknown, cors: Record<string, string>): Response {
  return json({ jsonrpc: "2.0", id, result }, cors);
}

function jsonrpcError(
  id: unknown,
  code: number,
  message: string,
  cors: Record<string, string>,
  status = 200
): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, cors, status);
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

function stripSurfaceSuffix(name: string, suffix: string): string {
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

function normalizeSwiftBody(body: string): string {
  return body.replace(/\\n/g, "\n").replace(/\\t/g, "    ");
}

function humanizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\bId\b/g, "ID")
    .replace(/\bUrl\b/g, "URL")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
  platform?: string;
  tokenNamespace?: string;
  componentKind?: string;
};

function inferLanguage(fileName: string | undefined, source: string): "swift" | "typescript" | "unknown" {
  if (fileName && /\.swift$/i.test(fileName)) return "swift";
  if (fileName && /\.(ts|tsx|mts|cts)$/i.test(fileName)) return "typescript";
  if (/\b(import\s+SwiftUI|import\s+AppIntents|:\s*AppIntent\b|:\s*View\b)/.test(source)) {
    return "swift";
  }
  if (/\bdefine(Intent|View|Widget|App)\s*\(/.test(source)) return "typescript";
  return "unknown";
}

function runWorkerCloudCheck(args: Record<string, unknown>) {
  const source = typeof args.source === "string" ? args.source : "";
  const fileName = typeof args.fileName === "string" ? args.fileName : "<cloud-check>";
  const format = typeof args.format === "string" ? args.format : "markdown";
  if (!source) {
    return textResult(
      "HTTP MCP Cloud Check requires inline `source`. Use the local MCP server for sourcePath support.",
      true
    );
  }

  const language = inferLanguage(fileName, source);
  if (language !== "swift") {
    return textResult(
      "HTTP MCP Cloud Check currently validates inline Swift source. Use the local MCP server for TypeScript compilation checks.",
      true
    );
  }

  const diagnostics = validateSwiftSource(source, fileName).diagnostics;
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const status = errors > 0 ? "fail" : warnings > 0 ? "needs_review" : "pass";
  const repairPrompt =
    diagnostics.length === 0
      ? `Review ${fileName}. Axint Cloud Check did not find blocking Apple-facing issues.`
      : [
          `Fix the Apple-facing issues in ${fileName} without changing the user's intended feature behavior.`,
          "",
          "Address these findings:",
          ...diagnostics
            .filter((d) => d.severity !== "info")
            .slice(0, 4)
            .map((d) => `- ${d.code}: ${d.message}${d.suggestion ? ` Fix: ${d.suggestion}` : ""}`),
        ].join("\n");

  const payload = {
    status,
    fileName,
    language,
    diagnostics,
    errors,
    warnings,
    repairPrompt,
  };

  if (format === "json") return textResult(JSON.stringify(payload, null, 2), status === "fail");
  if (format === "prompt") return textResult(repairPrompt, status === "fail");
  return textResult(
    [
      `# Axint Cloud Check: ${status}`,
      "",
      `- Input: ${fileName}`,
      `- Diagnostics: ${errors} errors, ${warnings} warnings`,
      "",
      "## Findings",
      ...(diagnostics.length
        ? diagnostics.map((d) => `- ${d.code} ${d.severity}: ${d.message}`)
        : ["- No blocking Apple-facing issues were found."]),
      "",
      "## Agent Repair Prompt",
      "```text",
      repairPrompt,
      "```",
    ].join("\n"),
    status === "fail"
  );
}

function runWorkerTokenIngest(args: Record<string, unknown>) {
  const source = typeof args.source === "string" ? args.source : "";
  const namespace = sanitizeTypeName(
    typeof args.namespace === "string" ? args.namespace : "AxintDesignTokens"
  );
  if (!source) {
    return textResult(
      "HTTP MCP token ingestion requires inline `source`. Use the local MCP server for sourcePath and JS/TS token files.",
      true
    );
  }

  const tokens = parseInlineWorkerTokens(source);
  if (Object.keys(tokens).length === 0) {
    return textResult("Could not parse inline JSON or CSS custom-property tokens.", true);
  }

  const colors = Object.entries(tokens).filter(([, v]) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(v)));
  const layout = Object.entries(tokens).filter(([k]) => /(sidebar|rail|column|width|height|layout)/i.test(k));
  const lines = ["// Generated by Axint tokens ingest.", "import SwiftUI", "", `enum ${namespace} {`];
  if (colors.length) {
    lines.push("    enum Colors {");
    for (const [k, v] of colors) lines.push(`        static let ${swiftIdentifier(k)} = Color(hex: "${String(v)}")`);
    lines.push("    }", "");
  }
  if (layout.length) {
    lines.push("    enum Layout {");
    for (const [k, v] of layout) lines.push(`        static let ${swiftIdentifier(k)} = CGFloat(${String(v).replace(/px$/, "")})`);
    lines.push("    }", "");
  }
  lines.push("}");
  return textResult(lines.join("\n"));
}

function parseInlineWorkerTokens(source: string): Record<string, string | number | boolean> {
  try {
    const parsed = JSON.parse(source) as unknown;
    return flattenWorkerTokens(parsed);
  } catch {
    const out: Record<string, string> = {};
    const re = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
    for (const match of source.matchAll(re)) out[match[1]!] = match[2]!.trim();
    return out;
  }
}

function flattenWorkerTokens(value: unknown, prefix = ""): Record<string, string | number | boolean> {
  if (value === null || value === undefined) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, child]) => ({ ...acc, ...flattenWorkerTokens(child, prefix ? `${prefix}-${key}` : key) }),
      {} as Record<string, string | number | boolean>
    );
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { [prefix]: value };
  }
  return { [prefix]: String(value) };
}

function swiftIdentifier(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const result = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join("");
  return /^[A-Za-z_]/.test(result) ? result : `token${result}`;
}

function sanitizeTypeName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "");
  const safe = cleaned.length > 0 ? cleaned : "AxintDesignTokens";
  const first = /^[A-Za-z_]/.test(safe) ? safe : `Tokens${safe}`;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function compileFromSchema(args: SchemaArgs) {
  const inputTokens = Math.ceil(JSON.stringify(args).length / 4);

  if (args.type === "intent") {
    if (!args.name) return textResult("[AX002] error: requires 'name'", true);
    const parameters: IRParameter[] = args.params
      ? Object.entries(args.params).map(([name, t]) => ({
          name,
          type: schemaTypeToIRType(t),
          title: humanizeIdentifier(name),
          description: humanizeIdentifier(name),
          isOptional: false,
        }))
      : [];
    const ir: IRIntent = {
      name: args.name,
      title: args.title || humanizeIdentifier(args.name),
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

  if (args.type === "view" || args.type === "component") {
    if (!args.name) return textResult("[AX301] error: requires 'name'", true);
    const props: IRViewProp[] = args.props
      ? Object.entries(args.props).map(([name, t]) => ({
          name: reservedViewPropertyName(name),
          type: schemaTypeToIRType(t),
          isOptional: false,
        }))
      : args.type === "component"
        ? [
            {
              name: "title",
              type: { kind: "primitive", value: "string" },
              isOptional: false,
              defaultValue: "Mission",
            },
          ]
        : [];
    const state: IRViewState[] = args.state
      ? Object.entries(args.state).map(([name, cfg]) => ({
          name: reservedViewPropertyName(name),
          type: schemaTypeToIRType(cfg.type || "string"),
          kind: "state" as const,
          defaultValue: cfg.default,
        }))
      : [];
    const ir: IRView = {
      name: args.type === "component" ? stripSurfaceSuffix(args.name, "View") : args.name,
      props,
      state,
      body: args.body
        ? [{ kind: "raw", swift: normalizeSwiftBody(args.body) }]
        : [
            {
              kind: "raw",
              swift:
                buildSmartViewBody({
                  name: args.name,
                  description: args.description,
                  props,
                  state,
                  platform: args.platform as "iOS" | "macOS" | "visionOS" | "all" | undefined,
                  tokenNamespace: args.tokenNamespace,
                  componentKind: args.componentKind,
                }) ?? "VStack {}",
            },
          ],
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
        ? Object.entries(args.entry)
            .filter(([name]) => name !== "date")
            .map(([name, t]) => ({
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
      name: stripSurfaceSuffix(args.name, "Widget"),
      displayName: args.displayName,
      description: args.description || "",
      families,
      entry: entries,
      body: args.body
        ? [{ kind: "raw", swift: normalizeSwiftBody(args.body) }]
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
    const ir: IRApp = { name: stripSurfaceSuffix(args.name, "App"), scenes, sourceFile: "<schema>" };
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
      platform: a.platform,
      tokenNamespace: a.tokenNamespace,
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
      "Full TypeScript compilation requires the local MCP server (`npx -y -p @axint/compiler axint-mcp`). " +
        "Use axint.schema.compile instead — it accepts a minimal JSON schema and produces identical Swift output with fewer tokens.",
      true
    );
  }

  if (name === "axint.schema.compile") {
    return compileFromSchema(args as unknown as SchemaArgs);
  }

  if (name === "axint.cloud.check") {
    return runWorkerCloudCheck(args);
  }

  if (name === "axint.tokens.ingest") {
    return runWorkerTokenIngest(args);
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

  if (name === "axint.swift.validate") {
    const source = (args as { source: string; file?: string }).source;
    const file = (args as { file?: string }).file || "input.swift";
    if (!source) return textResult("Error: 'source' is required", true);
    const result = validateSwiftSource(source, file);
    const diagnostics = result.diagnostics;
    if (diagnostics.length === 0) return textResult("No issues found. Swift source is clean.");
    const output = diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}${d.line ? ` (line ${d.line})` : ""}${d.suggestion ? `\n   fix: ${d.suggestion}` : ""}`)
      .join("\n");
    return textResult(output);
  }

  if (name === "axint.swift.fix") {
    const source = (args as { source: string; file?: string }).source;
    const file = (args as { file?: string }).file || "input.swift";
    if (!source) return textResult("Error: 'source' is required", true);
    const result = fixSwiftSource(source, file);
    const parts: string[] = [];
    if (result.fixed.length > 0) {
      parts.push(`Applied ${result.fixed.length} fix(es):\n${result.fixed.map((f) => `  - [${f.code}] ${f.message}`).join("\n")}`);
    }
    if (result.remaining.length > 0) {
      parts.push(`\nRemaining issues (${result.remaining.length}):\n${result.remaining.map((d) => `  - [${d.code}] ${d.message}`).join("\n")}`);
    }
    parts.push("\n// ─── Fixed source ───\n" + result.source);
    return textResult(parts.join("\n"));
  }

  return textResult(`Unknown tool: ${name}`, true);
}

// --- Fetch handler ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);
    const originAllowed = resolveAllowedOrigin(origin, env) !== null;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: originAllowed ? 204 : 403, headers: cors });
    }

    // Reject disallowed cross-origin requests before doing any work.
    if (origin && !originAllowed) {
      return jsonrpcError(null, -32000, "Origin not allowed", cors, 403);
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, server: "axint-mcp", version: VERSION }, cors);
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404, headers: cors });
    }

    if (request.method !== "POST") {
      return jsonrpcError(null, -32000, "POST only", cors);
    }

    // Reject oversized bodies before parsing. Workers already caps at 100MB
    // per request, but this lets us declare a tighter per-deploy limit.
    const maxBytes = resolveMaxBodyBytes(env);
    const declaredLength = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (declaredLength > maxBytes) {
      return jsonrpcError(null, -32000, "Payload too large", cors, 413);
    }

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return jsonrpcError(null, -32700, "Parse error", cors);
    }

    // `request.json()` succeeds on valid JSON that isn't an object — e.g.
    // `"null"`, `42`, `[]`. Destructuring those would throw at runtime.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonrpcError(null, -32600, "Invalid Request", cors);
    }
    const body = parsed as { id?: unknown; method?: string; params?: Record<string, unknown> };
    const { id, method, params } = body;

    if (method === "initialize") {
      return jsonrpc(
        id,
        {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {}, prompts: {} },
          serverInfo: { name: "axint", version: VERSION },
        },
        cors
      );
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (method === "tools/list") {
      return jsonrpc(id, { tools: TOOL_MANIFEST }, cors);
    }

    if (method === "tools/call") {
      const toolName = (params as { name?: string })?.name;
      const toolArgs = ((params as { arguments?: Record<string, unknown> })?.arguments ||
        {}) as Record<string, unknown>;
      if (!toolName) return jsonrpcError(id, -32602, "Missing tool name", cors);
      try {
        return jsonrpc(id, handleTool(toolName, toolArgs), cors);
      } catch (err) {
        return jsonrpc(
          id,
          textResult(
            `Tool error: ${err instanceof Error ? err.message : String(err)}`,
            true
          ),
          cors
        );
      }
    }

    if (method === "prompts/list") {
      return jsonrpc(id, { prompts: PROMPT_MANIFEST }, cors);
    }

    if (method === "prompts/get") {
      const promptName = (params as { name?: string })?.name;
      const promptArgs = (params as { arguments?: Record<string, string> })?.arguments;
      if (!promptName) return jsonrpcError(id, -32602, "Missing prompt name", cors);
      return jsonrpc(id, getPromptMessages(promptName, promptArgs), cors);
    }

    return jsonrpcError(id, -32601, `Unknown method: ${method}`, cors);
  },
};
