/**
 * Axint MCP Server
 *
 * Exposes Axint capabilities as MCP tools that AI coding assistants
 * (Claude Code, Cursor, Windsurf, Zed, any MCP client) can call
 * automatically.
 *
 * Tools:
 *   - axint.doctor:           Audit version truth and project MCP wiring
 *   - axint.session.start:    Start enforced session token + recovery context
 *   - axint.feature:          Generate a scaffolded Apple-native feature package
 *   - axint.suggest:          Suggest Apple-native features for an app domain
 *   - axint.workflow.check:   Check whether an agent used the Axint workflow
 *   - axint.context.memory:   Return compact operating memory after context loss
 *   - axint.context.docs:     Return compact docs context after context loss
 *   - axint.scaffold:         Generate a starter TypeScript intent file
 *   - axint.compile:          Compile TypeScript intent → Swift App Intent
 *   - axint.fix-packet: Read the latest emitted Fix Packet / AI repair prompt
 *   - axint.cloud.check:     Run an agent-callable Cloud Check report
 *   - axint.tokens.ingest:    Convert design tokens into SwiftUI token enums
 *   - axint.validate:         Validate an intent definition without codegen
 *   - axint.schema.compile:   Compile minimal JSON schema → Swift (token saver)
 *   - axint.swift.validate:   Validate an existing Swift source against AX700+ rules
 *   - axint.swift.fix:        Auto-fix mechanical Swift validator errors
 *   - axint.templates.list:   List bundled reference templates
 *   - axint.templates.get:    Return the source of a specific template
 *   - axint.status:           Report the running MCP server version + restart help
 *   - axint.project.pack:     Generate first-try project-start files
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
import { formatSwift } from "../core/format.js";
import { scaffoldIntent } from "./scaffold.js";
import { generateFeature, type FeatureInput, type Surface } from "./feature.js";
import { suggestFeaturesSmart, type SuggestInput } from "./suggest.js";
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
import {
  renderCloudCheckReport,
  runCloudCheck,
  type CloudCheckFormat,
} from "../cloud/check.js";
import {
  handleTokenIngest,
  type TokenIngestArgs,
  type TokenOutputFormat,
} from "./tokens.js";
import {
  renderWorkflowCheckReport,
  runWorkflowCheck,
  type WorkflowCheckInput,
} from "./workflow-check.js";
import {
  renderMachineDoctorReport,
  runMachineDoctor,
  type DoctorFormat,
} from "./doctor.js";
import {
  buildProjectStartPack,
  renderProjectStartPack,
  type ProjectAgent,
  type ProjectMcpMode,
  type ProjectStartPackFormat,
} from "../project/start-pack.js";
import { buildAxintDocsContext } from "../project/docs-context.js";
import { buildAxintOperatingMemory } from "../project/operating-memory.js";
import {
  renderAxintSessionStart,
  startAxintSession,
  type AxintSessionAgent,
  type AxintSessionFormat,
} from "../project/session.js";

type PackageInfo = {
  name?: string;
  version: string;
  mcpName?: string;
};

type StatusArgs = {
  format?: "markdown" | "json" | "prompt";
};
type DoctorArgs = {
  cwd?: string;
  expectedVersion?: string;
  format?: DoctorFormat;
};
type SessionStartArgs = {
  targetDir?: string;
  projectName?: string;
  expectedVersion?: string;
  platform?: string;
  agent?: AxintSessionAgent;
  ttlMinutes?: number;
  format?: AxintSessionFormat;
};

// Read version from package.json so it stays in sync.
let pkg: PackageInfo = { version: "0.3.9" };
let packageJsonPath = "<bundled>";
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  packageJsonPath = resolve(__dirname, "../../package.json");
  pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageInfo;
} catch {
  // fallback version used when bundled outside repo (e.g. Smithery scan)
}

const serverStartedAt = new Date();

type CompileArgs = {
  source: string;
  fileName?: string;
  emitInfoPlist?: boolean;
  emitEntitlements?: boolean;
  format?: boolean;
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
type CloudCheckArgs = {
  source?: string;
  sourcePath?: string;
  fileName?: string;
  language?: "swift" | "typescript" | "unknown";
  platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
  xcodeBuildLog?: string;
  testFailure?: string;
  runtimeFailure?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  format?: CloudCheckFormat;
};
type TokensIngestArgs = TokenIngestArgs & {
  format?: TokenOutputFormat;
};
type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
type ProjectPackArgs = {
  projectName?: string;
  targetDir?: string;
  agent?: ProjectAgent;
  mode?: ProjectMcpMode;
  format?: ProjectStartPackFormat;
};

type ContextMemoryArgs = {
  projectName?: string;
  expectedVersion?: string;
  platform?: string;
};

type ContextDocsArgs = ContextMemoryArgs;

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

function renderStatus(format: StatusArgs["format"] = "markdown"): string {
  const uptimeSeconds = Math.max(
    0,
    Math.round((Date.now() - serverStartedAt.getTime()) / 1000)
  );
  const status = {
    server: "axint-mcp",
    packageName: pkg.name ?? "@axint/compiler",
    mcpName: pkg.mcpName ?? "io.github.agenticempire/axint",
    version: pkg.version,
    packageJsonPath,
    node: process.version,
    pid: process.pid,
    startedAt: serverStartedAt.toISOString(),
    uptimeSeconds,
    argv: process.argv,
    toolsRegistered: TOOL_MANIFEST.length,
    promptsRegistered: PROMPT_MANIFEST.length,
    restartRequiredAfterUpdate: true,
    updateCommand: "npm install -g @axint/compiler@latest",
    xcodeSetupCommand: "axint xcode setup --agent claude",
    doctorCommand: "axint doctor",
    projectInitCommand: "axint project init",
    xcodeRestartInstruction:
      "Restart the Xcode Claude Agent chat or MCP server after updating. MCP clients keep the old Node process alive until it is restarted.",
  };

  if (format === "json") return JSON.stringify(status, null, 2);

  if (format === "prompt") {
    return [
      `The running Axint MCP server is v${status.version}.`,
      "If this is older than the version the user expects, stop before editing code.",
      "Tell the user to update Axint, rerun `axint xcode setup --agent claude`, and restart the Xcode Claude Agent chat.",
    ].join("\n");
  }

  return [
    "# Axint MCP Status",
    "",
    `- Server: ${status.server}`,
    `- Running version: v${status.version}`,
    `- Package: ${status.packageName}`,
    `- Package path: ${status.packageJsonPath}`,
    `- Node: ${status.node}`,
    `- PID: ${status.pid}`,
    `- Started: ${status.startedAt}`,
    `- Uptime: ${status.uptimeSeconds}s`,
    `- Tools registered: ${status.toolsRegistered}`,
    `- Prompts registered: ${status.promptsRegistered}`,
    "",
    "## Updating Axint for Xcode",
    "",
    "MCP servers are long-running processes. Installing a newer package does not update the already-running server inside Xcode.",
    "",
    "1. Update Axint:",
    "",
    "```sh",
    status.updateCommand,
    "```",
    "",
    "2. Rewrite the Xcode Claude Agent MCP config with durable paths:",
    "",
    "```sh",
    status.xcodeSetupCommand,
    "```",
    "",
    "3. Restart the Xcode Claude Agent chat or MCP server.",
    "",
    "4. In the new chat, ask: `Call axint.status and tell me the running version.`",
    "",
    "For a brand-new project, run `axint project init` once, then `axint doctor` to confirm the machine is wired.",
  ].join("\n");
}

// Agents call axint.* through MCP stdio with no way to invoke swift-format
// themselves. Default-on here means every AI-generated Swift file matches
// Apple's house style without the caller having to know it exists.
async function maybeFormatSwift(source: string, enabled: boolean): Promise<string> {
  if (!enabled) return source;
  const { formatted } = await formatSwift(source);
  return formatted;
}

export async function handleToolCall(name: string, args: unknown): Promise<ToolResult> {
  if (name === "axint.status") {
    const a = args as StatusArgs | undefined;
    return diagnosticsText(renderStatus(a?.format ?? "markdown"));
  }

  if (name === "axint.doctor") {
    const a = args as DoctorArgs | undefined;
    const report = runMachineDoctor({
      cwd: a?.cwd,
      expectedVersion: a?.expectedVersion,
      runningVersion: pkg.version,
      toolsRegistered: TOOL_MANIFEST.length,
      promptsRegistered: PROMPT_MANIFEST.length,
      packageJsonPath,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: renderMachineDoctorReport(report, a?.format ?? "markdown"),
        },
      ],
      isError: report.status === "fail",
    };
  }

  if (name === "axint.session.start") {
    const a = args as SessionStartArgs | undefined;
    const result = startAxintSession({
      targetDir: a?.targetDir,
      projectName: a?.projectName,
      expectedVersion: a?.expectedVersion ?? pkg.version,
      platform: a?.platform,
      agent: a?.agent,
      ttlMinutes: a?.ttlMinutes,
    });
    return diagnosticsText(renderAxintSessionStart(result, a?.format ?? "markdown"));
  }

  if (name === "axint.feature") {
    const a = args as FeatureInput & { format?: boolean };
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
      platform: a.platform,
      tokenNamespace: a.tokenNamespace,
      componentKind: a.componentKind,
      context: a.context,
    });

    const shouldFormat = a.format !== false;
    const output: string[] = [result.summary, ""];

    for (const file of result.files) {
      const content =
        file.type === "swift" || file.type === "test"
          ? await maybeFormatSwift(file.content, shouldFormat)
          : file.content;
      output.push(`// ─── ${file.path} ───`);
      output.push(content);
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
    const suggestions = await suggestFeaturesSmart(a);
    const domainSummary = summarizeSuggestionDomains(suggestions);
    const output = suggestions
      .map((s, i) => {
        const surfaces = s.surfaces.join(", ");
        const rationale = s.rationale ? `\n   Why: ${s.rationale}` : "";
        const confidence = s.confidence ? ` | Confidence: ${s.confidence}` : "";
        const source = s.source ? ` | Source: ${s.source}` : "";
        const impact = s.impact ? `\n   Impact: ${s.impact}` : "";
        const loop = s.loop ? `\n   Loop: ${s.loop}` : "";
        const nextStep = s.nextStep ? `\n   Next: ${s.nextStep}` : "";
        const generateCommand = `axint.feature({ description: "${s.featurePrompt}", surfaces: ${JSON.stringify(s.surfaces)} })`;
        return `${i + 1}. ${s.name}\n   ${s.description}${rationale}${impact}${loop}${nextStep}\n   Surfaces: ${surfaces} | Complexity: ${s.complexity}${confidence}${source}\n   Generate: ${generateCommand}\n   Proof loop: write the generated files, run axint.cloud.check with platform/build/test evidence, then build in Xcode.`;
      })
      .join("\n\n");

    return diagnosticsText(
      suggestions.length > 0
        ? `Suggested Apple-native features:\n${domainSummary}\n\n${output}\n\nUse axint.feature with any prompt above to generate the full feature package.`
        : "No specific suggestions for this app description. Try providing more detail about the app's purpose."
    );
  }

  if (name === "axint.workflow.check") {
    const a = args as WorkflowCheckInput;
    const report = runWorkflowCheck(a);
    return diagnosticsText(
      a.format === "json"
        ? JSON.stringify(report, null, 2)
        : renderWorkflowCheckReport(report)
    );
  }

  if (name === "axint.project.pack") {
    const a = args as ProjectPackArgs | undefined;
    const pack = buildProjectStartPack({
      projectName: a?.projectName,
      targetDir: a?.targetDir,
      agent: a?.agent,
      mode: a?.mode,
      version: pkg.version,
    });
    return diagnosticsText(renderProjectStartPack(pack, a?.format ?? "markdown"));
  }

  if (name === "axint.context.memory") {
    const a = args as ContextMemoryArgs | undefined;
    return diagnosticsText(
      buildAxintOperatingMemory({
        projectName: a?.projectName,
        expectedVersion: a?.expectedVersion ?? pkg.version,
        platform: a?.platform,
      })
    );
  }

  if (name === "axint.context.docs") {
    const a = args as ContextDocsArgs | undefined;
    return diagnosticsText(
      buildAxintDocsContext({
        projectName: a?.projectName,
        expectedVersion: a?.expectedVersion ?? pkg.version,
        platform: a?.platform,
      })
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
      const swift = await maybeFormatSwift(result.output.swiftCode, a.format !== false);
      const parts: string[] = ["// ─── Swift ──────────────────────────", swift];
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

  if (name === "axint.cloud.check") {
    const a = args as CloudCheckArgs;
    if (!a.source && !a.sourcePath) {
      return errorText(
        "Error: 'source' or 'sourcePath' is required for axint.cloud.check"
      );
    }
    const report = runCloudCheck({
      source: a.source,
      sourcePath: a.sourcePath,
      fileName: a.fileName,
      language: a.language,
      platform: a.platform,
      xcodeBuildLog: a.xcodeBuildLog,
      testFailure: a.testFailure,
      runtimeFailure: a.runtimeFailure,
      expectedBehavior: a.expectedBehavior,
      actualBehavior: a.actualBehavior,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: renderCloudCheckReport(report, a.format ?? "markdown"),
        },
      ],
      isError: report.status === "fail",
    };
  }

  if (name === "axint.tokens.ingest") {
    const a = args as TokensIngestArgs;
    if (!a.source && !a.sourcePath) {
      return errorText(
        "Error: 'source' or 'sourcePath' is required for axint.tokens.ingest"
      );
    }
    return handleTokenIngest(a);
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
    const a = args as { source: string; file?: string; format?: boolean };
    const result = fixSwiftSource(a.source, a.file ?? "<input>");
    const summary =
      result.fixed.length === 0
        ? "No mechanical fixes applied."
        : `Applied ${result.fixed.length} fix${result.fixed.length === 1 ? "" : "es"}: ${result.fixed.map((d) => d.code).join(", ")}`;
    const remaining =
      result.remaining.length > 0
        ? `\nRemaining: ${result.remaining.map((d) => `[${d.code}] ${d.message}`).join("; ")}`
        : "";
    const swift = await maybeFormatSwift(result.source, a.format !== false);
    return diagnosticsText(`${summary}${remaining}\n\n${swift}`);
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

function summarizeSuggestionDomains(
  suggestions: Array<{ domain: string; confidence?: string }>
): string {
  if (suggestions.length === 0) return "";
  const domains = [...new Set(suggestions.map((s) => s.domain))];
  const confidence = suggestions[0]?.confidence ?? "unknown";
  return `Read: ${domains.join(", ")} workflow${domains.length === 1 ? "" : "s"} - top confidence: ${confidence}`;
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
