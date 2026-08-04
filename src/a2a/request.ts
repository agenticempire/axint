import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Message } from "@a2a-js/sdk";
import {
  AXINT_A2A_REQUEST_SCHEMA,
  AxintA2AInputError,
  AxintA2APolicyError,
  isAxintA2ASkillId,
  messageText,
  type AxintA2ARequest,
  type AxintA2ARequestInput,
  type AxintA2ASkillId,
  type ParseAxintA2ARequestOptions,
  type ParsedAxintA2ARequest,
} from "./types.js";

const MAX_SOURCE_CHARS = 256 * 1024;
const MAX_EVIDENCE_CHARS = 128 * 1024;
const MAX_ISSUE_CHARS = 16 * 1024;
const MAX_LIST_ITEMS = 100;

export function parseAxintA2ARequest(
  message: Message,
  options: ParseAxintA2ARequestOptions
): ParsedAxintA2ARequest {
  const payload = structuredPayload(message) ?? textPayload(messageText(message));
  if (!payload) {
    throw new AxintA2AInputError(
      "Send structured data with { skill, input }. Supported skills: check_apple_code, diagnose_apple_failure, prove_apple_project, plan_apple_repair."
    );
  }
  if (!isAxintA2ASkillId(payload.skill)) {
    throw new AxintA2AInputError(`Unsupported Axint skill: ${String(payload.skill)}.`);
  }

  const projectRoot = canonicalDirectory(options.projectRoot, "Configured project root");
  const rawInput = plainObject(payload.input) ? payload.input : {};
  const input = normalizeInput(rawInput);
  const projectDirectory = input.projectPath
    ? confinedDirectory(projectRoot, input.projectPath, "projectPath")
    : projectRoot;

  if (input.sourcePath) {
    input.sourcePath = confinedFile(projectDirectory, input.sourcePath, "sourcePath");
  }
  input.workspace = optionalConfinedExistingRelativePath(
    projectDirectory,
    input.workspace,
    "workspace"
  );
  input.project = optionalConfinedExistingRelativePath(
    projectDirectory,
    input.project,
    "project"
  );
  input.modifiedFiles = input.modifiedFiles?.map((path) =>
    confinedPossiblyMissingRelativePath(projectDirectory, path, "modifiedFiles")
  );

  validateSkillInput(payload.skill, input);
  return {
    schema: AXINT_A2A_REQUEST_SCHEMA,
    skill: payload.skill,
    input,
    projectRoot,
    projectDirectory,
  };
}

function structuredPayload(message: Message): Partial<AxintA2ARequest> | undefined {
  for (const part of message.parts) {
    if (part.content?.$case !== "data" || !plainObject(part.content.value)) continue;
    const value = part.content.value;
    if ("skill" in value || value.schema === AXINT_A2A_REQUEST_SCHEMA) {
      return value as Partial<AxintA2ARequest>;
    }
  }
  return undefined;
}

function textPayload(text: string): Partial<AxintA2ARequest> | undefined {
  if (!text) return undefined;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (plainObject(parsed)) return parsed as Partial<AxintA2ARequest>;
    } catch {
      throw new AxintA2AInputError(
        "The text part looks like JSON but is not valid JSON."
      );
    }
  }

  const command = /^(check|diagnose|prove|repair)\b\s*(.*)$/is.exec(text);
  if (!command) return undefined;
  const skill = commandSkill(command[1].toLowerCase());
  const value = command[2].trim();
  if (skill === "check_apple_code") {
    return { skill, input: value ? { sourcePath: value } : {} };
  }
  if (skill === "prove_apple_project") {
    return { skill, input: value ? { projectPath: value } : {} };
  }
  return { skill, input: value ? { issue: value } : {} };
}

function commandSkill(command: string): AxintA2ASkillId {
  if (command === "check") return "check_apple_code";
  if (command === "diagnose") return "diagnose_apple_failure";
  if (command === "prove") return "prove_apple_project";
  return "plan_apple_repair";
}

function normalizeInput(value: Record<string, unknown>): AxintA2ARequestInput {
  const input: AxintA2ARequestInput = {
    projectPath: optionalString(value.projectPath, "projectPath", 4_096),
    source: optionalString(value.source, "source", MAX_SOURCE_CHARS),
    sourcePath: optionalString(value.sourcePath, "sourcePath", 4_096),
    fileName: optionalString(value.fileName, "fileName", 1_024),
    issue: optionalString(value.issue, "issue", MAX_ISSUE_CHARS),
    platform: optionalPlatform(value.platform),
    scheme: optionalString(value.scheme, "scheme", 512),
    workspace: optionalString(value.workspace, "workspace", 4_096),
    project: optionalString(value.project, "project", 4_096),
    destination: optionalString(value.destination, "destination", 2_048),
    configuration: optionalString(value.configuration, "configuration", 512),
    testPlan: optionalString(value.testPlan, "testPlan", 512),
    onlyTesting: optionalStringArray(value.onlyTesting, "onlyTesting"),
    modifiedFiles: optionalStringArray(value.modifiedFiles, "modifiedFiles"),
    skipBuild: optionalBoolean(value.skipBuild, "skipBuild"),
    skipTests: optionalBoolean(value.skipTests, "skipTests"),
    runtime: optionalBoolean(value.runtime, "runtime"),
    timeoutSeconds: optionalTimeout(value.timeoutSeconds),
    xcodeBuildLog: optionalString(
      value.xcodeBuildLog,
      "xcodeBuildLog",
      MAX_EVIDENCE_CHARS
    ),
    testFailure: optionalString(value.testFailure, "testFailure", MAX_EVIDENCE_CHARS),
    runtimeFailure: optionalString(
      value.runtimeFailure,
      "runtimeFailure",
      MAX_EVIDENCE_CHARS
    ),
    expectedBehavior: optionalString(
      value.expectedBehavior,
      "expectedBehavior",
      MAX_EVIDENCE_CHARS
    ),
    actualBehavior: optionalString(
      value.actualBehavior,
      "actualBehavior",
      MAX_EVIDENCE_CHARS
    ),
  };
  return Object.fromEntries(
    Object.entries(input).filter(([, item]) => item !== undefined)
  ) as AxintA2ARequestInput;
}

function validateSkillInput(skill: AxintA2ASkillId, input: AxintA2ARequestInput): void {
  if (skill === "check_apple_code" && !input.source && !input.sourcePath) {
    throw new AxintA2AInputError(
      "check_apple_code requires input.source or a sourcePath inside the configured project root."
    );
  }
  if (
    (skill === "diagnose_apple_failure" || skill === "plan_apple_repair") &&
    !input.issue &&
    !input.xcodeBuildLog &&
    !input.testFailure &&
    !input.runtimeFailure
  ) {
    throw new AxintA2AInputError(
      `${skill} requires an issue description or build, test, or runtime failure evidence.`
    );
  }
}

function canonicalDirectory(path: string, label: string): string {
  try {
    const canonical = realpathSync(resolve(path));
    if (!statSync(canonical).isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch {
    throw new AxintA2APolicyError(`${label} must be an existing directory.`);
  }
}

function confinedDirectory(root: string, path: string, label: string): string {
  const candidate = canonicalDirectory(resolve(root, path), label);
  assertContained(root, candidate, label);
  return candidate;
}

function confinedFile(root: string, path: string, label: string): string {
  try {
    const candidate = realpathSync(resolve(root, path));
    assertContained(root, candidate, label);
    if (!statSync(candidate).isFile()) throw new Error("not a file");
    return candidate;
  } catch (error) {
    if (error instanceof AxintA2APolicyError) throw error;
    throw new AxintA2APolicyError(
      `${label} must be an existing file inside the project.`
    );
  }
}

function optionalConfinedExistingRelativePath(
  root: string,
  path: string | undefined,
  label: string
): string | undefined {
  if (!path) return undefined;
  try {
    const candidate = realpathSync(resolve(root, path));
    assertContained(root, candidate, label);
    return relative(root, candidate) || ".";
  } catch (error) {
    if (error instanceof AxintA2APolicyError) throw error;
    throw new AxintA2APolicyError(`${label} must exist inside the project.`);
  }
}

function confinedPossiblyMissingRelativePath(
  root: string,
  path: string,
  label: string
): string {
  if (path.includes("\0"))
    throw new AxintA2APolicyError(`${label} contains invalid data.`);
  const resolved = resolve(root, path);
  let candidate = resolved;
  try {
    candidate = realpathSync(resolved);
  } catch {
    // Deleted changed files cannot be resolved; the lexical boundary still applies.
  }
  assertContained(root, candidate, label);
  return relative(root, resolved) || ".";
}

function assertContained(root: string, candidate: string, label: string): void {
  const rel = relative(root, candidate);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new AxintA2APolicyError(`${label} must stay inside the configured project root.`);
}

function optionalString(
  value: unknown,
  label: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string")
    throw new AxintA2AInputError(`${label} must be a string.`);
  if (value.length > maxLength) {
    throw new AxintA2AInputError(`${label} exceeds the ${maxLength}-character limit.`);
  }
  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean")
    throw new AxintA2AInputError(`${label} must be boolean.`);
  return value;
}

function optionalTimeout(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 3_600) {
    throw new AxintA2AInputError(
      "timeoutSeconds must be an integer from 1 through 3600."
    );
  }
  return Number(value);
}

function optionalPlatform(value: unknown): AxintA2ARequestInput["platform"] {
  if (value === undefined || value === null || value === "") return undefined;
  if (!["iOS", "macOS", "watchOS", "visionOS", "all"].includes(String(value))) {
    throw new AxintA2AInputError(
      "platform must be iOS, macOS, watchOS, visionOS, or all."
    );
  }
  return value as AxintA2ARequestInput["platform"];
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    throw new AxintA2AInputError(
      `${label} must be an array of at most ${MAX_LIST_ITEMS} strings.`
    );
  }
  if (value.some((item) => typeof item !== "string" || item.length > 4_096)) {
    throw new AxintA2AInputError(`${label} contains an invalid item.`);
  }
  return value as string[];
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
