import type { Command } from "commander";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { dirname, join } from "node:path";

export type AdoptionTelemetrySource = "cli" | "mcp" | "mcp-http";
export type AdoptionTelemetryFormat = "markdown" | "json";

type TelemetryConfig = {
  anonymousId: string;
  optedOut?: boolean;
  createdAt: string;
  updatedAt: string;
  initializedAt?: string;
  activatedAt?: string;
};

type RecordAdoptionEventInput = {
  source: AdoptionTelemetrySource;
  eventName: string;
  version: string;
  command?: string;
  toolName?: string;
  host?: string;
  transport?: string;
  result?: string;
};

export type AdoptionTelemetryStatus = {
  enabled: boolean;
  reason: string;
  endpoint: string;
  configPath: string;
  anonymousIdSuffix: string | null;
  sends: string[];
  neverSends: string[];
};

const DEFAULT_PROD_ENDPOINT =
  "https://axint-registry.nima-672.workers.dev/api/v1/adoption/events";
const DEFAULT_DEV_ENDPOINT = "http://127.0.0.1:8787/api/v1/adoption/events";
const processSessionId = `axs_${randomUUID()}`;

const NEVER_SENDS = [
  "source code",
  "prompts",
  "generated Swift bodies",
  "local file paths",
  "command arguments",
  "credentials",
  "machine identifiers",
];

const SENDS = [
  "Axint version",
  "command class, such as cloud check or run",
  "MCP tool name",
  "first install and first activation lifecycle markers",
  "coarse host hint, such as terminal, Codex, Claude, Cursor, or Xcode when detectable",
  "operating system family, architecture, Node major version, and CI flag",
  "anonymous random install id that can be reset or disabled",
];

const SETUP_ONLY_CLI_COMMANDS = new Set([
  "status",
  "doctor",
  "upgrade",
  "mcp",
  "mcp status",
  "mcp recover",
  "telemetry",
]);

const SETUP_ONLY_MCP_TOOLS = new Set(["axint.status", "axint.doctor", "axint.upgrade"]);

function envFlagOff(value: string | undefined): boolean {
  if (!value) return false;
  return ["0", "false", "off", "no", "disabled"].includes(value.trim().toLowerCase());
}

function envFlagOn(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}

export function adoptionTelemetryEndpoint(): string {
  if (process.env.AXINT_TELEMETRY_ENDPOINT) {
    return process.env.AXINT_TELEMETRY_ENDPOINT;
  }
  if ((process.env.AXINT_ENV ?? "").trim().toLowerCase() === "dev") {
    return DEFAULT_DEV_ENDPOINT;
  }
  return DEFAULT_PROD_ENDPOINT;
}

function telemetryConfigPath(): string {
  if (process.env.AXINT_TELEMETRY_CONFIG) {
    return process.env.AXINT_TELEMETRY_CONFIG;
  }
  return join(homedir(), ".axint", "telemetry.json");
}

function readTelemetryConfig(): TelemetryConfig | null {
  const path = telemetryConfigPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as TelemetryConfig;
    if (typeof parsed.anonymousId === "string" && parsed.anonymousId) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function writeTelemetryConfig(config: TelemetryConfig): void {
  const path = telemetryConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function createTelemetryConfig(now = new Date().toISOString()): TelemetryConfig {
  return {
    anonymousId: `axa_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
}

function telemetryDisabledReason(config?: TelemetryConfig | null): string | null {
  if (envFlagOn(process.env.AXINT_DISABLE_TELEMETRY)) {
    return "AXINT_DISABLE_TELEMETRY is enabled";
  }
  if (envFlagOn(process.env.DO_NOT_TRACK)) {
    return "DO_NOT_TRACK is enabled";
  }
  if (envFlagOff(process.env.AXINT_TELEMETRY)) {
    return "AXINT_TELEMETRY is off";
  }
  if (config?.optedOut) {
    return "local telemetry opt-out is enabled";
  }
  return null;
}

export function setAdoptionTelemetryOptOut(optedOut: boolean): TelemetryConfig {
  const current = readTelemetryConfig();
  const now = new Date().toISOString();
  const next: TelemetryConfig = {
    anonymousId: current?.anonymousId ?? `axa_${randomUUID()}`,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    initializedAt: current?.initializedAt ?? now,
    activatedAt: current?.activatedAt,
    optedOut,
  };
  writeTelemetryConfig(next);
  return next;
}

function safeValue(value: string | undefined, maxLength = 160): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ").slice(0, maxLength);
  if (!trimmed || /[{}\n\r]/.test(trimmed)) return undefined;
  return trimmed;
}

export function commandPathFor(actionCommand: Command): string {
  const names: string[] = [];
  let current: Command | null | undefined = actionCommand;
  while (current && current.name() !== "axint") {
    const name = current.name();
    if (name) names.unshift(name);
    current = current.parent;
  }
  return names.join(" ");
}

export function inferAxintHost(options?: Record<string, unknown>): string {
  const optionAgent = typeof options?.agent === "string" ? options.agent : undefined;
  const explicit =
    optionAgent ??
    process.env.AXINT_AGENT_HOST ??
    process.env.AXINT_HOST ??
    process.env.AXINT_AGENT;
  if (explicit) return safeValue(explicit, 48) ?? "terminal";

  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_AGENT) return "cursor";
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) return "claude";
  if (process.env.CODEX_SANDBOX || process.env.CODEX_CLI || process.env.OPENAI_AGENT) {
    return "codex";
  }
  if (process.env.XCODE_VERSION_ACTUAL || process.env.__XCODE_BUILT_PRODUCTS_DIR_PATHS) {
    return "xcode";
  }

  const term = process.env.TERM_PROGRAM?.toLowerCase();
  if (term?.includes("vscode")) return "vscode";
  if (term?.includes("apple_terminal")) return "terminal";
  if (term?.includes("iterm")) return "terminal";
  return "terminal";
}

function packageManagerHint(): string {
  const execPath = process.env.npm_execpath?.toLowerCase() ?? "";
  if (execPath.includes("pnpm")) return "pnpm";
  if (execPath.includes("yarn")) return "yarn";
  if (execPath.includes("bun")) return "bun";
  if (execPath.includes("npm")) return "npm";
  return "unknown";
}

function metadataFor(input: RecordAdoptionEventInput): Record<string, string | boolean> {
  return {
    version: safeValue(input.version, 32) ?? "unknown",
    ...(input.command ? { command: safeValue(input.command, 96) ?? "unknown" } : {}),
    ...(input.toolName ? { tool_name: safeValue(input.toolName, 96) ?? "unknown" } : {}),
    host: safeValue(input.host, 48) ?? inferAxintHost(),
    ...(input.transport
      ? { transport: safeValue(input.transport, 32) ?? "unknown" }
      : {}),
    ...(input.result ? { result: safeValue(input.result, 32) ?? "unknown" } : {}),
    os: platform(),
    arch: arch(),
    node: process.versions.node.split(".")[0] ?? "unknown",
    package_manager: packageManagerHint(),
    ci: Boolean(process.env.CI),
  };
}

function isActivationProofEvent(input: RecordAdoptionEventInput): boolean {
  if (input.result && input.result !== "ok") return false;

  if (input.eventName === "mcp_tool_completed") {
    return Boolean(input.toolName && !SETUP_ONLY_MCP_TOOLS.has(input.toolName));
  }

  if (input.eventName === "cli_command_completed") {
    const command = input.command?.trim();
    if (!command) return true;
    return !SETUP_ONLY_CLI_COMMANDS.has(command);
  }

  return [
    "axint_first_value",
    "cloud_first_check_completed",
    "cloud_repeat_check_completed",
    "cloud_report_saved",
  ].includes(input.eventName);
}

function adoptionEventPayload(
  input: RecordAdoptionEventInput,
  config: TelemetryConfig,
  eventName: string
) {
  return {
    schema: "https://axint.ai/schemas/adoption-telemetry.v1.json",
    source: input.source,
    event_name: eventName,
    event_type: "adoption",
    anonymous_id: config.anonymousId,
    session_id: processSessionId,
    metadata: metadataFor(input),
  };
}

export async function recordAdoptionEvent(
  input: RecordAdoptionEventInput
): Promise<{ sent: boolean; reason?: string }> {
  const existing = readTelemetryConfig();
  const disabled = telemetryDisabledReason(existing);
  if (disabled) return { sent: false, reason: disabled };

  const createdNow = !existing;
  const config = existing ?? createTelemetryConfig();
  if (createdNow) writeTelemetryConfig(config);

  const shouldMarkInitialized = !config.initializedAt;
  const shouldMarkActivated =
    !config.activatedAt &&
    input.eventName !== "axint_activated" &&
    isActivationProofEvent(input);
  const events = [
    ...(shouldMarkInitialized
      ? [adoptionEventPayload(input, config, "axint_install_initialized")]
      : []),
    adoptionEventPayload(input, config, input.eventName),
    ...(shouldMarkActivated
      ? [adoptionEventPayload(input, config, "axint_activated")]
      : []),
  ];
  const endpoint = adoptionTelemetryEndpoint();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 450);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `axint/${safeValue(input.version, 32) ?? "unknown"} adoption`,
        "X-Axint-Version": safeValue(input.version, 32) ?? "unknown",
      },
      signal: controller.signal,
      body: JSON.stringify(events.length === 1 ? events[0] : { events }),
    });

    if (!response.ok) {
      return { sent: false, reason: `telemetry endpoint returned ${response.status}` };
    }
    if (shouldMarkInitialized || shouldMarkActivated) {
      const now = new Date().toISOString();
      writeTelemetryConfig({
        ...config,
        initializedAt: config.initializedAt ?? now,
        activatedAt: shouldMarkActivated ? now : config.activatedAt,
        updatedAt: now,
      });
    }
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "telemetry request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function recordAdoptionEventSoon(input: RecordAdoptionEventInput): void {
  void recordAdoptionEvent(input);
}

export function getAdoptionTelemetryStatus(): AdoptionTelemetryStatus {
  const config = readTelemetryConfig();
  const disabled = telemetryDisabledReason(config);
  return {
    enabled: !disabled,
    reason: disabled ?? "source-free adoption telemetry is enabled",
    endpoint: adoptionTelemetryEndpoint(),
    configPath: telemetryConfigPath(),
    anonymousIdSuffix: config?.anonymousId ? config.anonymousId.slice(-8) : null,
    sends: SENDS,
    neverSends: NEVER_SENDS,
  };
}

export function renderAdoptionTelemetryStatus(
  status: AdoptionTelemetryStatus,
  format: AdoptionTelemetryFormat
): string {
  if (format === "json") {
    return JSON.stringify(status, null, 2);
  }

  return [
    `# Axint Telemetry`,
    ``,
    `Status: ${status.enabled ? "on" : "off"}`,
    `Reason: ${status.reason}`,
    `Endpoint: ${status.endpoint}`,
    `Config: ${status.configPath}`,
    `Anonymous install id: ${status.anonymousIdSuffix ? `...${status.anonymousIdSuffix}` : "not created yet"}`,
    ``,
    `## Sent`,
    ...status.sends.map((item) => `- ${item}`),
    ``,
    `## Never Sent`,
    ...status.neverSends.map((item) => `- ${item}`),
    ``,
    `Opt out with \`axint telemetry opt-out\`, \`AXINT_TELEMETRY=off\`, or \`AXINT_DISABLE_TELEMETRY=1\`.`,
  ].join("\n");
}
