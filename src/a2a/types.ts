import type { Message } from "@a2a-js/sdk";

export const AXINT_A2A_REQUEST_SCHEMA =
  "https://axint.ai/schemas/a2a-request.v1.json" as const;
export const AXINT_A2A_RESULT_SCHEMA =
  "https://axint.ai/schemas/a2a-result.v1.json" as const;
export const AXINT_A2A_INPUT_MEDIA_TYPE =
  "application/vnd.axint.a2a-request+json" as const;
export const AXINT_A2A_RESULT_MEDIA_TYPE =
  "application/vnd.axint.a2a-result+json" as const;

export const AXINT_A2A_SKILL_IDS = [
  "check_apple_code",
  "diagnose_apple_failure",
  "prove_apple_project",
  "plan_apple_repair",
] as const;

export type AxintA2ASkillId = (typeof AXINT_A2A_SKILL_IDS)[number];

export interface AxintA2ARequestInput {
  projectPath?: string;
  source?: string;
  sourcePath?: string;
  fileName?: string;
  issue?: string;
  platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "all";
  scheme?: string;
  workspace?: string;
  project?: string;
  destination?: string;
  configuration?: string;
  testPlan?: string;
  onlyTesting?: string[];
  modifiedFiles?: string[];
  skipBuild?: boolean;
  skipTests?: boolean;
  runtime?: boolean;
  timeoutSeconds?: number;
  xcodeBuildLog?: string;
  testFailure?: string;
  runtimeFailure?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
}

export interface AxintA2ARequest {
  schema: typeof AXINT_A2A_REQUEST_SCHEMA;
  skill: AxintA2ASkillId;
  input: AxintA2ARequestInput;
}

export type AxintA2AVerdict = "pass" | "needs_review" | "fail";

export interface AxintA2AResult {
  schema: typeof AXINT_A2A_RESULT_SCHEMA;
  skill: AxintA2ASkillId;
  verdict: AxintA2AVerdict;
  summary: string;
  createdAt: string;
  data: Record<string, unknown>;
  privacy: {
    sourceIncluded: false;
    absolutePathsIncluded: false;
    rawLogsIncluded: false;
  };
}

export interface ParsedAxintA2ARequest extends AxintA2ARequest {
  projectRoot: string;
  projectDirectory: string;
}

export interface ParseAxintA2ARequestOptions {
  projectRoot: string;
}

export class AxintA2AInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AxintA2AInputError";
  }
}

export class AxintA2APolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AxintA2APolicyError";
  }
}

export interface AxintA2AExecutionRequest {
  request: ParsedAxintA2ARequest;
  signal: AbortSignal;
}

export interface AxintA2AExecutionResult {
  result: AxintA2AResult;
  markdown: string;
}

export type AxintA2ARunner = (
  input: AxintA2AExecutionRequest
) => Promise<AxintA2AExecutionResult>;

export function isAxintA2ASkillId(value: unknown): value is AxintA2ASkillId {
  return (
    typeof value === "string" &&
    (AXINT_A2A_SKILL_IDS as readonly string[]).includes(value)
  );
}

export function messageText(message: Message): string {
  return message.parts
    .filter((part) => part.content?.$case === "text")
    .map((part) => (part.content?.$case === "text" ? part.content.value : ""))
    .join("\n")
    .trim();
}
