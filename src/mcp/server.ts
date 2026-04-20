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
 *   - axint.fix-packet: Read the latest emitted Fix Packet / AI repair prompt
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
import { compileAnySource } from "../core/compiler.js";
import { scaffoldIntent } from "./scaffold.js";
import { generateFeature, type FeatureInput, type Surface } from "./feature.js";
import { suggestFeatures, type SuggestInput } from "./suggest.js";
import { TEMPLATES, getTemplate } from "../templates/index.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import { fixSwiftSource } from "../core/swift-fixer.js";
import { TOOL_MANIFEST } from "./manifest.js";
import { PROMPT_MANIFEST, getPromptMessages } from "./prompts.js";
import { handleCompileFromSchema, type SchemaCompileArgs } from "./schema-compile.js";
import {
  readLatestFixPacket,
  renderFixPacketMarkdown,
  type FixPacketFormat,
} from "../repair/fix-packet.js";

// Read version from package.json so it stays in sync
let pkg = { version: "0.3.9" };
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
type FixPacketArgs = {
  cwd?: string;
  packetDir?: string;
  format?: FixPacketFormat;
};
type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

function diagnosticsText(text: string): ToolResult {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function errorText(text: string): ToolResult {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

export async function handleToolCall(name: string, args: unknown): Promise<ToolResult> {
  if (name === "axint.feature") {
    const a = args as FeatureInput;
    if (!a.description) {
      return errorText("Error: 'description' is required for axint.feature");
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
    const a = args as SuggestInput;
    if (!a.appDescription) {
      return errorText("Error: 'appDescription' is required for axint.suggest");
    }
    const suggestions = suggestFeatures(a);
    const output = suggestions
      .map((s, i) => {
        const surfaces = s.surfaces.join(", ");
        return `${i + 1}. ${s.name}\n   ${s.description}\n   Surfaces: ${surfaces} | Complexity: ${s.complexity}\n   Prompt: "${s.featurePrompt}"`;
      })
      .join("\n\n");

    return diagnosticsText(
      suggestions.length > 0
        ? `Suggested Apple-native features:\n\n${output}\n\nUse axint.feature with any prompt above to generate the full feature package.`
        : "No specific suggestions for this app description. Try providing more detail about the app's purpose."
    );
  }

  if (name === "axint.scaffold") {
    const a = args as ScaffoldArgs;
    const source = scaffoldIntent({
      name: a.name,
      description: a.description,
      domain: a.domain,
      params: a.params,
    });
    return diagnosticsText(source);
  }

  if (name === "axint.compile") {
    const a = args as CompileArgs;
    const result = compileAnySource(a.source, a.fileName || "<mcp>", {
      emitInfoPlist: a.emitInfoPlist,
      emitEntitlements: a.emitEntitlements,
    });

    if (result.success && result.output) {
      const parts: string[] = [
        "// ─── Swift ──────────────────────────",
        result.output.swiftCode,
      ];
      if (result.surface === "intent" && result.output.infoPlistFragment) {
        parts.push("// ─── Info.plist fragment ────────────");
        parts.push(result.output.infoPlistFragment);
      }
      if (result.surface === "intent" && result.output.entitlementsFragment) {
        parts.push("// ─── .entitlements fragment ─────────");
        parts.push(result.output.entitlementsFragment);
      }
      return diagnosticsText(parts.join("\n"));
    }

    const errorTextValue = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return errorText(errorTextValue);
  }

  if (name === "axint.fix-packet") {
    const a = args as FixPacketArgs;
    const packet = readLatestFixPacket({
      cwd: a.cwd,
      packetDir: a.packetDir,
    });
    if (!packet) {
      return errorText(
        "No Fix Packet found. Run `axint compile` or `axint watch` first so Axint can emit .axint/fix/latest.json."
      );
    }

    const format = a.format ?? "json";
    if (format === "prompt") {
      return diagnosticsText(packet.ai.prompt);
    }
    if (format === "markdown") {
      return diagnosticsText(renderFixPacketMarkdown(packet));
    }
    return diagnosticsText(JSON.stringify(packet, null, 2));
  }
  if (name === "axint.validate") {
    const a = args as { source: string; fileName?: string };
    const result = compileAnySource(a.source, a.fileName || "<validate>");
    const text =
      result.diagnostics.length > 0
        ? result.diagnostics
            .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
            .join("\n")
        : "Valid Axint definition. No issues found.";
    return diagnosticsText(text);
  }

  if (name === "axint.schema.compile") {
    return handleCompileFromSchema(args as SchemaCompileArgs);
  }

  if (name === "axint.swift.validate") {
    const a = args as { source: string; file?: string };
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
    return diagnosticsText(text);
  }

  if (name === "axint.swift.fix") {
    const a = args as { source: string; file?: string };
    const result = fixSwiftSource(a.source, a.file ?? "<input>");
    const summary =
      result.fixed.length === 0
        ? "No mechanical fixes applied."
        : `Applied ${result.fixed.length} fix${result.fixed.length === 1 ? "" : "es"}: ${result.fixed.map((d) => d.code).join(", ")}`;
    const remaining =
      result.remaining.length > 0
        ? `\nRemaining: ${result.remaining.map((d) => `[${d.code}] ${d.message}`).join("; ")}`
        : "";
    return diagnosticsText(`${summary}${remaining}\n\n${result.source}`);
  }

  if (name === "axint.templates.list") {
    const list = TEMPLATES.map(
      (t) => `${t.id}  —  ${t.title}${t.domain ? ` [${t.domain}]` : ""}`
    ).join("\n");
    return diagnosticsText(list || "No templates registered.");
  }

  if (name === "axint.templates.get") {
    const a = args as TemplateArgs;
    const tpl = getTemplate(a.id);
    if (!tpl) {
      return errorText(
        `Unknown template id: ${a.id}. Use axint.templates.list to see available ids.`
      );
    }
    return diagnosticsText(tpl.source);
  }

  return errorText(`Unknown tool: ${name}`);
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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_MANIFEST,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      return await handleToolCall(name, args);
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

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPT_MANIFEST,
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return getPromptMessages(name, args);
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
