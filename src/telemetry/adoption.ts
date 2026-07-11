import type { Command } from "commander";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { dirname, join } from "node:path";

export type AdoptionTelemetrySource = "cli" | "mcp" | "mcp-http";
export type AdoptionTelemetryFormat = "markdown" | "json";
export type AdoptionSharingLevel = "standard" | "enhanced";

const TELEMETRY_CONSENT_VERSION = "2026-07";

type TelemetryConfig = {
  anonymousId: string;
  optedOut?: boolean;
  createdAt: string;
  updatedAt: string;
  initializedAt?: string;
  activatedAt?: string;
  sharingLevel?: AdoptionSharingLevel;
  consentAt?: string;
  consentVersion?: string;
};

type ProjectTelemetryConfig = {
  projectId: string;
  createdAt: string;
  updatedAt: string;
  firstValueAt?: string;
  lastValueAt?: string;
};

export type RecordAdoptionEventInput = {
  source: AdoptionTelemetrySource;
  eventName: string;
  version: string;
  command?: string;
  toolName?: string;
  host?: string;
  transport?: string;
  result?: string;
  failureEvent?: string;
  insightKind?: string;
  projectCategory?: string;
  projectGoal?: string;
  appleSurfaces?: string[];
  featureAreas?: string[];
  projectLifecycle?: string;
  deliveryTarget?: string;
  complexityBucket?: string;
  queryLengthBucket?: string;
  resultBucket?: string;
  querySource?: string;
  targetPlatform?: string;
  taxonomyVersion?: string;
};

type ProjectTelemetryState = {
  config: ProjectTelemetryConfig;
  createdNow: boolean;
};

type AdoptionValueStage =
  "setup" | "value" | "repeat" | "rehydration" | "repair" | "health" | "error";

export type AdoptionTelemetryStatus = {
  enabled: boolean;
  reason: string;
  endpoint: string;
  configPath: string;
  anonymousIdSuffix: string | null;
  projectConfigPath: string;
  projectIdSuffix: string | null;
  sharingLevel: "off" | AdoptionSharingLevel;
  explicitConsent: boolean;
  consentAt: string | null;
  consentVersion: string | null;
  dogfood: boolean;
  sends: string[];
  enhancedSends: string[];
  neverSends: string[];
};

const DEFAULT_PROD_ENDPOINT =
  "https://axint-registry.nima-672.workers.dev/api/v1/adoption/events";
const DEFAULT_DEV_ENDPOINT = "http://127.0.0.1:8787/api/v1/adoption/events";
const processSessionId = `axs_${randomUUID()}`;

const NEVER_SENDS = [
  "source code",
  "full generation prompts",
  "raw search queries or full app descriptions in standard telemetry",
  "project names",
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
  "anonymous per-project id plus first-value, repeat-value, and remembered-agent markers",
  "allowlisted project category, lifecycle, delivery target, feature areas, Apple surfaces, complexity, and search-result buckets",
  "source-free failure markers when a command or MCP tool returns an error",
  "coarse host hint, such as terminal, Codex, Claude, Cursor, or Xcode when detectable",
  "operating system family, architecture, Node major version, and CI flag",
  "anonymous random install id that can be reset or disabled",
];

const ENHANCED_SENDS = [
  "source-free issue class, priority, status, and diagnostic codes",
  "project shape counts and target platform",
  "redacted and truncated issue, expected/actual behavior, and failure excerpts",
  "repair hypotheses and suggested Axint product action",
  "proof decision plus build, test, runtime, and deterministic-repair outcomes",
  "explicit internal dogfood marker when AXINT_DOGFOOD=1",
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

const REHYDRATION_CLI_COMMANDS = new Set([
  "activate",
  "context docs",
  "context memory",
  "session start",
  "workflow check",
]);

const REHYDRATION_MCP_TOOLS = new Set([
  "axint.activate",
  "axint.context.docs",
  "axint.context.memory",
  "axint.session.start",
  "axint.status",
  "axint.workflow.check",
]);

const REPAIR_LOOP_CLI_COMMANDS = new Set([
  "cloud check",
  "repair",
  "run",
  "validate",
  "validate-swift",
]);

const REPAIR_LOOP_MCP_TOOLS = new Set([
  "axint.cloud.check",
  "axint.repair",
  "axint.run",
  "axint.swift.fix",
  "axint.swift.validate",
  "axint.validate",
]);

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

function projectTelemetryConfigPath(cwd = process.cwd()): string {
  if (process.env.AXINT_PROJECT_TELEMETRY_CONFIG) {
    return process.env.AXINT_PROJECT_TELEMETRY_CONFIG;
  }
  return join(cwd, ".axint", "telemetry-project.json");
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

function readProjectTelemetryConfig(cwd = process.cwd()): ProjectTelemetryConfig | null {
  const path = projectTelemetryConfigPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ProjectTelemetryConfig;
    if (typeof parsed.projectId === "string" && parsed.projectId.startsWith("axp_")) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function writeProjectTelemetryConfig(
  config: ProjectTelemetryConfig,
  cwd = process.cwd()
): void {
  const path = projectTelemetryConfigPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function readOrCreateProjectTelemetry(
  now = new Date().toISOString(),
  cwd = process.cwd()
): ProjectTelemetryState | null {
  try {
    const existing = readProjectTelemetryConfig(cwd);
    if (existing) return { config: existing, createdNow: false };

    const created: ProjectTelemetryConfig = {
      projectId: `axp_${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    writeProjectTelemetryConfig(created, cwd);
    return { config: created, createdNow: true };
  } catch {
    return null;
  }
}

export function getOrCreateAnonymousProjectId(cwd = process.cwd()): string | undefined {
  return readOrCreateProjectTelemetry(new Date().toISOString(), cwd)?.config.projectId;
}

function createTelemetryConfig(now = new Date().toISOString()): TelemetryConfig {
  const environmentLevel = environmentSharingLevel();
  return {
    anonymousId: `axa_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    ...(environmentLevel || envFlagOn(process.env.AXINT_DOGFOOD)
      ? {
          sharingLevel: envFlagOn(process.env.AXINT_DOGFOOD)
            ? ("enhanced" as const)
            : environmentLevel,
          consentAt: now,
          consentVersion: TELEMETRY_CONSENT_VERSION,
        }
      : {}),
  };
}

function environmentSharingLevel(): AdoptionSharingLevel | undefined {
  const value = process.env.AXINT_TELEMETRY?.trim().toLowerCase();
  if (value === "enhanced") return "enhanced";
  if (value && ["1", "true", "on", "yes", "standard"].includes(value)) {
    return "standard";
  }
  return undefined;
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
  if (
    !config?.consentAt &&
    !environmentSharingLevel() &&
    !envFlagOn(process.env.AXINT_DOGFOOD)
  ) {
    return "explicit telemetry consent is not recorded";
  }
  return null;
}

export function setAdoptionTelemetryOptOut(optedOut: boolean): TelemetryConfig {
  if (!optedOut) return setAdoptionTelemetrySharingLevel("standard");
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

export function setAdoptionTelemetrySharingLevel(
  sharingLevel: AdoptionSharingLevel
): TelemetryConfig {
  const current = readTelemetryConfig();
  const now = new Date().toISOString();
  const next: TelemetryConfig = {
    anonymousId: current?.anonymousId ?? `axa_${randomUUID()}`,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    initializedAt: current?.initializedAt,
    activatedAt: current?.activatedAt,
    optedOut: false,
    sharingLevel,
    consentAt: now,
    consentVersion: TELEMETRY_CONSENT_VERSION,
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

function projectAgeBucket(
  project: ProjectTelemetryConfig | null,
  now: string
): string | undefined {
  if (!project?.createdAt) return undefined;
  const created = Date.parse(project.createdAt);
  const current = Date.parse(now);
  if (!Number.isFinite(created) || !Number.isFinite(current)) return undefined;
  const ageHours = Math.max(0, (current - created) / 3_600_000);
  if (ageHours < 1) return "new";
  if (ageHours < 24) return "same-day";
  if (ageHours < 24 * 7) return "week-one";
  if (ageHours < 24 * 30) return "month-one";
  return "retained";
}

function metadataFor(
  input: RecordAdoptionEventInput,
  project: ProjectTelemetryConfig | null,
  now: string,
  valueStage?: AdoptionValueStage
): Record<string, string | boolean> {
  return {
    version: safeValue(input.version, 32) ?? "unknown",
    ...(input.command ? { command: safeValue(input.command, 96) ?? "unknown" } : {}),
    ...(input.toolName ? { tool_name: safeValue(input.toolName, 96) ?? "unknown" } : {}),
    host: safeValue(input.host, 48) ?? inferAxintHost(),
    ...(input.transport
      ? { transport: safeValue(input.transport, 32) ?? "unknown" }
      : {}),
    ...(input.result ? { result: safeValue(input.result, 32) ?? "unknown" } : {}),
    ...(input.failureEvent
      ? { failure_event: safeValue(input.failureEvent, 96) ?? "unknown" }
      : {}),
    ...(project?.projectId
      ? {
          project_id: project.projectId,
          project_age_bucket: projectAgeBucket(project, now) ?? "unknown",
          project_repeat: Boolean(project.firstValueAt || project.lastValueAt),
        }
      : {}),
    ...(valueStage ? { value_stage: valueStage } : {}),
    ...(input.insightKind
      ? { insight_kind: safeValue(input.insightKind, 32) ?? "unknown" }
      : {}),
    ...(input.projectCategory
      ? { project_category: safeValue(input.projectCategory, 48) ?? "unknown" }
      : {}),
    ...(input.projectGoal
      ? { project_goal: safeValue(input.projectGoal, 48) ?? "unknown" }
      : {}),
    ...(input.appleSurfaces?.length
      ? {
          apple_surfaces:
            safeValue(input.appleSurfaces.slice(0, 4).join(","), 128) ?? "unknown",
        }
      : {}),
    ...(input.featureAreas?.length
      ? {
          feature_areas:
            safeValue(input.featureAreas.slice(0, 6).join(","), 192) ?? "unknown",
        }
      : {}),
    ...(input.projectLifecycle
      ? { project_lifecycle: safeValue(input.projectLifecycle, 24) ?? "unknown" }
      : {}),
    ...(input.deliveryTarget
      ? { delivery_target: safeValue(input.deliveryTarget, 32) ?? "unknown" }
      : {}),
    ...(input.complexityBucket
      ? { complexity_bucket: safeValue(input.complexityBucket, 24) ?? "unknown" }
      : {}),
    ...(input.queryLengthBucket
      ? {
          query_length_bucket: safeValue(input.queryLengthBucket, 16) ?? "unknown",
        }
      : {}),
    ...(input.resultBucket
      ? { result_bucket: safeValue(input.resultBucket, 16) ?? "unknown" }
      : {}),
    ...(input.querySource
      ? { query_source: safeValue(input.querySource, 48) ?? "unknown" }
      : {}),
    ...(input.targetPlatform
      ? { target_platform: safeValue(input.targetPlatform, 16) ?? "unknown" }
      : {}),
    ...(input.taxonomyVersion
      ? { taxonomy_version: safeValue(input.taxonomyVersion, 24) ?? "unknown" }
      : {}),
    os: platform(),
    arch: arch(),
    node: process.versions.node.split(".")[0] ?? "unknown",
    package_manager: packageManagerHint(),
    ci: Boolean(process.env.CI),
    sharing_level: inputSharingLevel(),
    dogfood: envFlagOn(process.env.AXINT_DOGFOOD),
  };
}

function inputSharingLevel(): AdoptionSharingLevel {
  if (envFlagOn(process.env.AXINT_DOGFOOD)) return "enhanced";
  return environmentSharingLevel() ?? readTelemetryConfig()?.sharingLevel ?? "standard";
}

function isAgentRehydrationEvent(input: RecordAdoptionEventInput): boolean {
  if (input.result && input.result !== "ok") return false;
  if (
    input.eventName !== "cli_command_completed" &&
    input.eventName !== "mcp_tool_completed"
  ) {
    return false;
  }
  if (input.command) return REHYDRATION_CLI_COMMANDS.has(input.command.trim());
  if (input.toolName) return REHYDRATION_MCP_TOOLS.has(input.toolName.trim());
  return false;
}

function isRepairLoopEvent(input: RecordAdoptionEventInput): boolean {
  if (input.result && input.result !== "ok") return false;
  if (
    input.eventName !== "cli_command_completed" &&
    input.eventName !== "mcp_tool_completed"
  ) {
    return false;
  }
  if (input.command) return REPAIR_LOOP_CLI_COMMANDS.has(input.command.trim());
  if (input.toolName) return REPAIR_LOOP_MCP_TOOLS.has(input.toolName.trim());
  return false;
}

function shouldMarkRepeatValue(
  project: ProjectTelemetryConfig | null,
  now: string
): boolean {
  if (!project?.firstValueAt) return false;
  const previous = Date.parse(project.lastValueAt ?? project.firstValueAt);
  const current = Date.parse(now);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
  return current - previous >= 60 * 60 * 1000;
}

function shouldRecordFailureEvent(input: RecordAdoptionEventInput): boolean {
  if (input.eventName === "axint_error_observed") return false;
  if (input.result && input.result !== "ok") return true;
  return ["cli_command_failed", "mcp_tool_failed"].includes(input.eventName);
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
  eventName: string,
  project: ProjectTelemetryConfig | null,
  now: string,
  valueStage?: AdoptionValueStage
) {
  return {
    schema: "https://axint.ai/schemas/adoption-telemetry.v1.json",
    source: input.source,
    event_name: eventName,
    event_type: "adoption",
    anonymous_id: config.anonymousId,
    session_id: processSessionId,
    metadata: metadataFor(input, project, now, valueStage),
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

  const now = new Date().toISOString();
  const projectState = readOrCreateProjectTelemetry(now);
  const project = projectState?.config ?? null;
  const shouldMarkInitialized = !config.initializedAt;
  const shouldMarkActivated =
    !config.activatedAt &&
    input.eventName !== "axint_activated" &&
    isActivationProofEvent(input);
  const shouldMarkFailure = shouldRecordFailureEvent(input);
  const shouldMarkValue = isActivationProofEvent(input);
  const shouldMarkProjectFirstValue = shouldMarkValue && !project?.firstValueAt;
  const shouldMarkProjectRepeatValue =
    shouldMarkValue && shouldMarkRepeatValue(project, now);
  const shouldMarkRehydration = isAgentRehydrationEvent(input);
  const shouldMarkRepair = isRepairLoopEvent(input);
  const events = [
    ...(projectState?.createdNow
      ? [
          adoptionEventPayload(
            input,
            config,
            "axint_project_initialized",
            project,
            now,
            "setup"
          ),
        ]
      : []),
    ...(shouldMarkInitialized
      ? [
          adoptionEventPayload(
            input,
            config,
            "axint_install_initialized",
            project,
            now,
            "setup"
          ),
        ]
      : []),
    adoptionEventPayload(input, config, input.eventName, project, now),
    ...(shouldMarkFailure
      ? [
          adoptionEventPayload(
            { ...input, failureEvent: input.failureEvent ?? input.eventName },
            config,
            "axint_error_observed",
            project,
            now,
            "error"
          ),
        ]
      : []),
    ...(shouldMarkProjectFirstValue
      ? [adoptionEventPayload(input, config, "axint_first_value", project, now, "value")]
      : []),
    ...(shouldMarkProjectRepeatValue
      ? [
          adoptionEventPayload(
            input,
            config,
            "axint_repeat_value",
            project,
            now,
            "repeat"
          ),
        ]
      : []),
    ...(shouldMarkRehydration
      ? [
          adoptionEventPayload(
            input,
            config,
            "axint_agent_rehydrated",
            project,
            now,
            "rehydration"
          ),
        ]
      : []),
    ...(shouldMarkRepair
      ? [
          adoptionEventPayload(
            input,
            config,
            "axint_repair_loop_completed",
            project,
            now,
            "repair"
          ),
        ]
      : []),
    ...(shouldMarkActivated
      ? [adoptionEventPayload(input, config, "axint_activated", project, now, "value")]
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
      writeTelemetryConfig({
        ...config,
        initializedAt: config.initializedAt ?? now,
        activatedAt: shouldMarkActivated ? now : config.activatedAt,
        updatedAt: now,
      });
    }
    if (project && shouldMarkValue) {
      writeProjectTelemetryConfig({
        ...project,
        firstValueAt: project.firstValueAt ?? now,
        lastValueAt: now,
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
  const project = readProjectTelemetryConfig();
  const disabled = telemetryDisabledReason(config);
  const environmentLevel = environmentSharingLevel();
  const dogfood = envFlagOn(process.env.AXINT_DOGFOOD);
  return {
    enabled: !disabled,
    reason: disabled ?? "source-free adoption telemetry is enabled",
    endpoint: adoptionTelemetryEndpoint(),
    configPath: telemetryConfigPath(),
    anonymousIdSuffix: config?.anonymousId ? config.anonymousId.slice(-8) : null,
    projectConfigPath: projectTelemetryConfigPath(),
    projectIdSuffix: project?.projectId ? project.projectId.slice(-8) : null,
    sharingLevel: disabled
      ? "off"
      : dogfood
        ? "enhanced"
        : (environmentLevel ?? config?.sharingLevel ?? "standard"),
    explicitConsent: Boolean(config?.consentAt || environmentLevel || dogfood),
    consentAt: config?.consentAt ?? null,
    consentVersion:
      config?.consentVersion ??
      (environmentLevel || dogfood ? TELEMETRY_CONSENT_VERSION : null),
    dogfood,
    sends: SENDS,
    enhancedSends: ENHANCED_SENDS,
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
    `Project config: ${status.projectConfigPath}`,
    `Anonymous project id: ${status.projectIdSuffix ? `...${status.projectIdSuffix}` : "not created yet"}`,
    `Sharing level: ${status.sharingLevel}`,
    `Explicit consent: ${
      status.explicitConsent
        ? status.consentAt
          ? `yes (${status.consentAt})`
          : "yes (environment)"
        : "not recorded"
    }`,
    `Internal dogfood marker: ${status.dogfood ? "on" : "off"}`,
    ``,
    `## Sent`,
    ...status.sends.map((item) => `- ${item}`),
    ``,
    `## Enhanced Diagnostics`,
    ...status.enhancedSends.map((item) => `- ${item}`),
    ``,
    `## Never Sent`,
    ...status.neverSends.map((item) => `- ${item}`),
    ``,
    `Choose \`axint telemetry standard\`, \`axint telemetry enhanced\`, or \`axint telemetry opt-out\`.`,
  ].join("\n");
}
