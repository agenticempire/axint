import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { buildAxintDocsContext } from "./docs-context.js";
import { buildAxintOperatingMemory } from "./operating-memory.js";

export type AxintSessionAgent = "claude" | "codex" | "cursor" | "xcode" | "all";
export type AxintSessionFormat = "markdown" | "json";

export interface AxintSessionStartInput {
  targetDir?: string;
  projectName?: string;
  expectedVersion?: string;
  platform?: string;
  agent?: AxintSessionAgent;
  ttlMinutes?: number;
  format?: AxintSessionFormat;
}

export interface AxintSessionRecord {
  schema: "https://axint.ai/schemas/session.v1.json";
  token: string;
  projectName: string;
  targetDir: string;
  expectedVersion: string;
  platform: string;
  agent: AxintSessionAgent;
  startedAt: string;
  expiresAt: string;
  memoryHash: string;
  docsHash: string;
  requiredFiles: string[];
  requiredNextChecks: Array<{
    stage: string;
    required: string[];
  }>;
}

export interface AxintSessionStartResult {
  session: AxintSessionRecord;
  sessionPath: string;
  memory: string;
  docsContext: string;
  recoveryPrompt: string;
  workflowCheckArgs: Record<string, unknown>;
}

export function startAxintSession(
  input: AxintSessionStartInput = {}
): AxintSessionStartResult {
  const targetDir = resolve(input.targetDir ?? process.cwd());
  const projectName = input.projectName ?? basename(targetDir) ?? "AppleApp";
  const expectedVersion = input.expectedVersion ?? "unknown";
  const platform = input.platform ?? "the target Apple platform";
  const agent = input.agent ?? "all";
  const ttlMinutes = input.ttlMinutes ?? 720;
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + ttlMinutes * 60_000);
  const memory = buildAxintOperatingMemory({
    projectName,
    expectedVersion,
    platform,
  });
  const docsContext = buildAxintDocsContext({
    projectName,
    expectedVersion,
    platform,
  });
  const token = `axsess_${randomUUID()}`;
  const session: AxintSessionRecord = {
    schema: "https://axint.ai/schemas/session.v1.json",
    token,
    projectName,
    targetDir,
    expectedVersion,
    platform,
    agent,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    memoryHash: hashText(memory),
    docsHash: hashText(docsContext),
    requiredFiles: [
      ".axint/AXINT_MEMORY.md",
      ".axint/AXINT_DOCS_CONTEXT.md",
      ".axint/project.json",
      "AGENTS.md",
      "CLAUDE.md",
    ],
    requiredNextChecks: [
      {
        stage: "context-recovery",
        required: [
          "readAgentInstructions=true",
          "readDocsContext=true",
          "ranStatus=true",
          "sessionToken=<token>",
        ],
      },
      {
        stage: "planning",
        required: ["sessionToken=<token>", "ranSuggest=true"],
      },
      {
        stage: "pre-build",
        required: [
          "sessionToken=<token>",
          "ranSwiftValidate=true",
          "ranCloudCheck=true",
          "Xcode evidence when applicable",
        ],
      },
    ],
  };
  const sessionPath = sessionFilePath(targetDir);
  mkdirSync(dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf-8");

  return {
    session,
    sessionPath,
    memory,
    docsContext,
    recoveryPrompt: buildSessionRecoveryPrompt(session),
    workflowCheckArgs: {
      cwd: targetDir,
      stage: "context-recovery",
      sessionStarted: true,
      sessionToken: token,
      readAgentInstructions: true,
      readDocsContext: true,
      ranStatus: true,
    },
  };
}

export function readCurrentAxintSession(
  targetDir: string = process.cwd()
): AxintSessionRecord | undefined {
  const path = sessionFilePath(resolve(targetDir));
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as AxintSessionRecord;
    return parsed?.token ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function isAxintSessionFresh(session: AxintSessionRecord): boolean {
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function validateAxintSessionToken(
  input: {
    cwd?: string;
    sessionToken?: string;
    sessionStarted?: boolean;
  } = {}
): { ok: boolean; detail: string; session?: AxintSessionRecord } {
  const session = readCurrentAxintSession(input.cwd);
  if (!session) {
    return {
      ok: false,
      detail:
        "No Axint session token found. Start the project session before continuing.",
    };
  }
  if (!isAxintSessionFresh(session)) {
    return {
      ok: false,
      detail: "Axint session token is expired.",
      session,
    };
  }
  if (!input.sessionToken) {
    return {
      ok: false,
      detail:
        "Axint session file exists, but sessionToken was not supplied to the workflow gate.",
      session,
    };
  }
  if (input.sessionToken && input.sessionToken !== session.token) {
    return {
      ok: false,
      detail: "supplied sessionToken does not match .axint/session/current.json.",
      session,
    };
  }
  return { ok: true, detail: "Axint session token is valid.", session };
}

export function renderAxintSessionStart(
  result: AxintSessionStartResult,
  format: AxintSessionFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(result, null, 2);

  return [
    "# Axint Session Started",
    "",
    `- Project: ${result.session.projectName}`,
    `- Target: ${result.session.targetDir}`,
    `- Agent: ${result.session.agent}`,
    `- Platform: ${result.session.platform}`,
    `- Expected Axint: ${result.session.expectedVersion}`,
    `- Token: ${result.session.token}`,
    `- Session file: ${result.sessionPath}`,
    `- Expires: ${result.session.expiresAt}`,
    "",
    "## Required Next Call",
    "",
    "Call `axint.workflow.check` with:",
    "",
    "```json",
    JSON.stringify(result.workflowCheckArgs, null, 2),
    "```",
    "",
    "## Recovery Prompt",
    "",
    "```text",
    result.recoveryPrompt,
    "```",
    "",
    "## Operating Memory",
    "",
    result.memory,
    "",
    "## Docs Context",
    "",
    result.docsContext,
  ].join("\n");
}

function sessionFilePath(targetDir: string): string {
  return resolve(targetDir, ".axint/session/current.json");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildSessionRecoveryPrompt(session: AxintSessionRecord): string {
  return [
    `Axint session is active for ${session.projectName}.`,
    `Session token: ${session.token}`,
    "",
    "Read .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, and .axint/project.json.",
    "If either Axint context file is missing, call axint.context.memory and axint.context.docs.",
    "Then call axint.status and axint.workflow.check with stage context-recovery, readAgentInstructions=true, readDocsContext=true, ranStatus=true, and this sessionToken.",
    "Do not edit Apple-native code until that workflow check is ready.",
  ].join("\n");
}
