import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { CloudLearningSignal } from "../cloud/check.js";
import type { AxintRepairFeedbackPacket } from "../repair/project-repair.js";

export type AxintAutoFeedbackMode = "on" | "off" | "local_only";
export type AxintAutoFeedbackPacketType = "cloud" | "repair";

export interface AxintAutoFeedbackPolicy {
  mode: AxintAutoFeedbackMode;
  endpoint: string;
  reason: string;
  sourceSharing: "never_by_default";
  redaction: "source_not_included";
}

export interface AxintAutoFeedbackEnvelope {
  schema: "https://axint.ai/schemas/auto-feedback.v1.json";
  id: string;
  createdAt: string;
  packetType: AxintAutoFeedbackPacketType;
  compilerVersion?: string;
  privacy: {
    redaction: "source_not_included";
    sourceSharing: "never_by_default";
    optOut: "AXINT_FEEDBACK=off or axint feedback opt-out";
  };
  packet: AxintRepairFeedbackPacket | CloudLearningSignal;
}

export interface AxintAutoFeedbackQueueResult {
  policy: AxintAutoFeedbackPolicy;
  queued: boolean;
  queuePath?: string;
  submitted: "queued" | "disabled" | "local_only" | "attempted";
}

export const DEFAULT_AUTO_FEEDBACK_ENDPOINT = "https://registry.axint.ai/api/v1/feedback";

export function resolveAutoFeedbackPolicy(cwd = process.cwd()): AxintAutoFeedbackPolicy {
  const envMode = normalizeMode(
    process.env.AXINT_FEEDBACK ?? process.env.AXINT_TELEMETRY
  );
  if (isOptOutEnv()) {
    return policy("off", "opted out by environment");
  }
  if (envMode) {
    return policy(envMode, `configured by environment`);
  }

  const localPolicy = readLocalPolicy(cwd);
  if (localPolicy) return localPolicy;

  return policy("on", "default source-free diagnostics feedback");
}

export function writeAutoFeedbackPolicy(
  cwd: string,
  mode: AxintAutoFeedbackMode
): AxintAutoFeedbackPolicy {
  const root = resolve(cwd, ".axint/feedback");
  mkdirSync(root, { recursive: true });
  const current = policy(mode, "configured by local project policy");
  writeFileSync(
    join(root, "policy.json"),
    `${JSON.stringify(
      {
        mode,
        endpoint: current.endpoint,
        privacy: {
          redaction: current.redaction,
          sourceSharing: current.sourceSharing,
        },
      },
      null,
      2
    )}\n`,
    "utf-8"
  );
  return current;
}

export function queueAutomaticFeedback(
  packet: AxintRepairFeedbackPacket | CloudLearningSignal,
  options: { cwd?: string; packetType: AxintAutoFeedbackPacketType } = {
    packetType: "cloud",
  }
): AxintAutoFeedbackQueueResult {
  const cwd = resolve(options.cwd ?? process.cwd());
  const currentPolicy = resolveAutoFeedbackPolicy(cwd);
  if (currentPolicy.mode === "off") {
    return {
      policy: currentPolicy,
      queued: false,
      submitted: "disabled",
    };
  }

  const envelope = buildAutoFeedbackEnvelope(packet, options.packetType);
  const outboxDir = resolve(cwd, ".axint/feedback/outbox");
  mkdirSync(outboxDir, { recursive: true });
  const queuePath = join(outboxDir, `${envelope.id}.json`);
  writeFileSync(queuePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf-8");

  if (currentPolicy.mode === "local_only" || isTestRuntime()) {
    return {
      policy: currentPolicy,
      queued: true,
      queuePath,
      submitted: currentPolicy.mode === "local_only" ? "local_only" : "queued",
    };
  }

  void submitFeedbackEnvelope(queuePath, currentPolicy).catch(() => {
    // Feedback must never break the user's build loop.
  });

  return {
    policy: currentPolicy,
    queued: true,
    queuePath,
    submitted: "attempted",
  };
}

export async function syncAutomaticFeedback(
  options: { cwd?: string; endpoint?: string } = {}
): Promise<{
  policy: AxintAutoFeedbackPolicy;
  attempted: number;
  sent: number;
  failed: number;
}> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const currentPolicy = {
    ...resolveAutoFeedbackPolicy(cwd),
    endpoint: options.endpoint ?? resolveAutoFeedbackPolicy(cwd).endpoint,
  };
  if (currentPolicy.mode === "off") {
    return { policy: currentPolicy, attempted: 0, sent: 0, failed: 0 };
  }
  const outboxDir = resolve(cwd, ".axint/feedback/outbox");
  if (!existsSync(outboxDir)) {
    return { policy: currentPolicy, attempted: 0, sent: 0, failed: 0 };
  }
  const files = readdirSync(outboxDir).filter(
    (file) => file.endsWith(".json") && !file.endsWith(".sent.json")
  );
  let sent = 0;
  let failed = 0;
  for (const file of files) {
    const ok = await submitFeedbackEnvelope(join(outboxDir, file), currentPolicy);
    if (ok) sent += 1;
    else failed += 1;
  }
  return { policy: currentPolicy, attempted: files.length, sent, failed };
}

function buildAutoFeedbackEnvelope(
  packet: AxintRepairFeedbackPacket | CloudLearningSignal,
  packetType: AxintAutoFeedbackPacketType
): AxintAutoFeedbackEnvelope {
  const createdAt = new Date().toISOString();
  const stable = "fingerprint" in packet ? packet.fingerprint : packet.id;
  return {
    schema: "https://axint.ai/schemas/auto-feedback.v1.json",
    id: `auto-feedback-${hashString([packetType, stable, createdAt].join(":"))}`,
    createdAt,
    packetType,
    compilerVersion: packet.compilerVersion,
    privacy: {
      redaction: "source_not_included",
      sourceSharing: "never_by_default",
      optOut: "AXINT_FEEDBACK=off or axint feedback opt-out",
    },
    packet,
  };
}

async function submitFeedbackEnvelope(
  path: string,
  currentPolicy: AxintAutoFeedbackPolicy
): Promise<boolean> {
  if (currentPolicy.mode !== "on") return false;
  let envelope: AxintAutoFeedbackEnvelope;
  try {
    envelope = JSON.parse(readFileSync(path, "utf-8")) as AxintAutoFeedbackEnvelope;
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(currentPolicy.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `axint-feedback/${envelope.compilerVersion ?? "unknown"}`,
      },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    renameSync(path, path.replace(/\.json$/, ".sent.json"));
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function readLocalPolicy(cwd: string): AxintAutoFeedbackPolicy | undefined {
  const path = resolve(cwd, ".axint/feedback/policy.json");
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      mode?: string;
      endpoint?: string;
    };
    const mode = normalizeMode(parsed.mode);
    if (!mode) return undefined;
    return policy(mode, "configured by local project policy", parsed.endpoint);
  } catch {
    return undefined;
  }
}

function policy(
  mode: AxintAutoFeedbackMode,
  reason: string,
  endpoint = process.env.AXINT_FEEDBACK_ENDPOINT ?? DEFAULT_AUTO_FEEDBACK_ENDPOINT
): AxintAutoFeedbackPolicy {
  return {
    mode,
    endpoint,
    reason,
    sourceSharing: "never_by_default",
    redaction: "source_not_included",
  };
}

function normalizeMode(value?: string): AxintAutoFeedbackMode | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return "off";
  if (["local", "local_only", "queue"].includes(normalized)) return "local_only";
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return "on";
  return undefined;
}

function isOptOutEnv(): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env.AXINT_DISABLE_FEEDBACK ?? "").trim().toLowerCase()
  );
}

function isTestRuntime(): boolean {
  return Boolean(
    process.env.VITEST ||
    process.env.NODE_ENV === "test" ||
    process.argv.some((arg) => /vitest|tsx/.test(arg))
  );
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
