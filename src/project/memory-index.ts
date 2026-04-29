import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  buildProjectContextIndex,
  readProjectContextIndex,
  type ProjectContextIndex,
} from "./context-index.js";

export type AxintProjectMemoryFormat = "markdown" | "json";

export interface AxintProjectMemoryInput {
  cwd?: string;
  projectName?: string;
  changedFiles?: string[];
  write?: boolean;
}

export interface AxintProjectMemoryIndex {
  schema: "https://axint.ai/schemas/project-memory.v1.json";
  createdAt: string;
  cwd: string;
  projectName: string;
  summary: string[];
  context: {
    swiftFiles: number;
    swiftUIFiles: number;
    inputCapableFiles: number;
    changedFiles: string[];
    riskyFiles: Array<{
      path: string;
      riskScore: number;
      reasons: string[];
    }>;
  };
  latestRun?: {
    path: string;
    status?: string;
    gate?: string;
    runId?: string;
    failedTests: Array<{
      testName?: string;
      message?: string;
      file?: string;
      line?: number;
      repairHint?: string;
    }>;
    nextSteps: string[];
  };
  latestRepair?: {
    path: string;
    status?: string;
    issueClass?: string;
    filesToInspect: string[];
    proofCommands: string[];
  };
  learningPackets: Array<{
    path: string;
    fingerprint?: string;
    priority?: string;
    owner?: string;
    title?: string;
    diagnosticCodes: string[];
    redaction?: string;
  }>;
  nextCommands: string[];
}

export interface WriteAxintProjectMemoryResult {
  index: AxintProjectMemoryIndex;
  jsonPath: string;
  markdownPath: string;
  written: string[];
}

export function buildProjectMemoryIndex(
  input: AxintProjectMemoryInput = {}
): AxintProjectMemoryIndex {
  const cwd = resolve(input.cwd ?? process.cwd());
  const context = loadContext(cwd, input);
  const latestRun = readLatestRunMemory(cwd);
  const latestRepair = readLatestRepairMemory(cwd);
  const learningPackets = readLearningPackets(cwd);
  const projectName = input.projectName ?? context.projectName ?? basename(cwd);

  const summary = [
    `${projectName}: ${context.files.swift} Swift files, ${context.files.swiftUI} SwiftUI files, ${context.files.inputCapable} input-capable files.`,
    latestRun
      ? `Latest run: ${latestRun.status ?? "unknown"}${latestRun.gate ? ` · ${latestRun.gate}` : ""}.`
      : "No Axint run proof found yet.",
    latestRepair
      ? `Latest repair: ${latestRepair.issueClass ?? latestRepair.status ?? "available"}.`
      : "No Axint repair packet found yet.",
    learningPackets.length > 0
      ? `${learningPackets.length} privacy-safe learning packet${learningPackets.length === 1 ? "" : "s"} available.`
      : "No privacy-safe learning packets found yet.",
  ];

  return {
    schema: "https://axint.ai/schemas/project-memory.v1.json",
    createdAt: new Date().toISOString(),
    cwd,
    projectName,
    summary,
    context: {
      swiftFiles: context.files.swift,
      swiftUIFiles: context.files.swiftUI,
      inputCapableFiles: context.files.inputCapable,
      changedFiles: context.git.changedFiles,
      riskyFiles: context.topInteractionRiskFiles.slice(0, 10).map((file) => ({
        path: file.path,
        riskScore: file.riskScore,
        reasons: file.reasons,
      })),
    },
    latestRun,
    latestRepair,
    learningPackets,
    nextCommands: [
      `axint agent advice --dir ${shellQuote(cwd)}`,
      `axint project index --dir ${shellQuote(cwd)}`,
      `axint run --dir ${shellQuote(cwd)} --agent codex --dry-run`,
    ],
  };
}

export function writeProjectMemoryIndex(
  input: AxintProjectMemoryInput = {}
): WriteAxintProjectMemoryResult {
  const index = buildProjectMemoryIndex(input);
  const jsonPath = resolve(index.cwd, ".axint/memory/latest.json");
  const markdownPath = resolve(index.cwd, ".axint/memory/latest.md");
  const written: string[] = [];

  if (input.write !== false) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
    writeFileSync(markdownPath, renderProjectMemoryIndex(index), "utf-8");
    written.push(".axint/memory/latest.json", ".axint/memory/latest.md");
  }

  return { index, jsonPath, markdownPath, written };
}

export function renderProjectMemoryIndex(
  index: AxintProjectMemoryIndex,
  format: AxintProjectMemoryFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(index, null, 2);

  const lines = [
    "# Axint Project Memory",
    "",
    `- Project: ${index.projectName}`,
    `- Root: ${index.cwd}`,
    `- Created: ${index.createdAt}`,
    "",
    "## Summary",
    ...index.summary.map((item) => `- ${item}`),
    "",
    "## Risky Files",
    ...(index.context.riskyFiles.length > 0
      ? index.context.riskyFiles.map(
          (file) =>
            `- ${file.path}: score ${file.riskScore}${file.reasons.length > 0 ? ` — ${file.reasons.join(", ")}` : ""}`
        )
      : ["- None detected yet."]),
    "",
    "## Latest Run",
    ...(index.latestRun
      ? [
          `- Status: ${index.latestRun.status ?? "unknown"}`,
          `- Gate: ${index.latestRun.gate ?? "unknown"}`,
          `- Path: ${index.latestRun.path}`,
          ...(index.latestRun.failedTests.length > 0
            ? [
                "- Failed tests:",
                ...index.latestRun.failedTests.map(
                  (failure) =>
                    `  - ${failure.testName ?? "unknown test"}${failure.file ? ` (${failure.file}${failure.line ? `:${failure.line}` : ""})` : ""}: ${failure.message ?? "no message"}${failure.repairHint ? ` Repair: ${failure.repairHint}` : ""}`
                ),
              ]
            : ["- Failed tests: none recorded."]),
        ]
      : ["- No run found."]),
    "",
    "## Latest Repair",
    ...(index.latestRepair
      ? [
          `- Status: ${index.latestRepair.status ?? "unknown"}`,
          `- Issue class: ${index.latestRepair.issueClass ?? "unknown"}`,
          `- Path: ${index.latestRepair.path}`,
          ...(index.latestRepair.filesToInspect.length > 0
            ? [
                "- Files to inspect:",
                ...index.latestRepair.filesToInspect.map((file) => `  - ${file}`),
              ]
            : []),
        ]
      : ["- No repair packet found."]),
    "",
    "## Privacy-Safe Learning Packets",
    ...(index.learningPackets.length > 0
      ? index.learningPackets.map(
          (packet) =>
            `- ${packet.fingerprint ?? basename(packet.path)}: ${packet.priority ?? "p?"} · ${packet.owner ?? "unknown owner"} · ${packet.diagnosticCodes.join(", ") || "no codes"} · ${packet.redaction ?? "source_not_included"}`
        )
      : ["- None yet."]),
    "",
    "## Next Commands",
    ...index.nextCommands.map((command) => `- \`${command}\``),
    "",
  ];

  return lines.join("\n");
}

function loadContext(cwd: string, input: AxintProjectMemoryInput): ProjectContextIndex {
  const contextPath = join(cwd, ".axint/context/latest.json");
  return (
    readProjectContextIndex(contextPath) ??
    buildProjectContextIndex({
      targetDir: cwd,
      projectName: input.projectName,
      changedFiles: input.changedFiles,
      includeGit: true,
    })
  );
}

function readLatestRunMemory(cwd: string): AxintProjectMemoryIndex["latestRun"] {
  const path = join(cwd, ".axint/run/latest.json");
  const json = readJson(path);
  if (!json) return undefined;
  const failedTests = Array.isArray(json.xcodeTestFailures)
    ? json.xcodeTestFailures.slice(0, 8).map((failure: Record<string, unknown>) => ({
        testName: stringValue(failure.testName),
        message: stringValue(failure.message),
        file: stringValue(failure.file),
        line: numberValue(failure.line),
        repairHint: stringValue(failure.repairHint),
      }))
    : [];

  return {
    path,
    status: stringValue(json.status),
    gate:
      typeof json.gate === "object" && json.gate
        ? stringValue((json.gate as Record<string, unknown>).decision)
        : undefined,
    runId: stringValue(json.id),
    failedTests,
    nextSteps: Array.isArray(json.nextSteps)
      ? json.nextSteps.map(String).slice(0, 8)
      : [],
  };
}

function readLatestRepairMemory(cwd: string): AxintProjectMemoryIndex["latestRepair"] {
  const path = join(cwd, ".axint/repair/latest.json");
  const json = readJson(path);
  if (!json) return undefined;
  const filesToInspect = Array.isArray(json.filesToInspect)
    ? json.filesToInspect.map(String).slice(0, 12)
    : Array.isArray(json.candidateFiles)
      ? json.candidateFiles
          .map((file: unknown) =>
            typeof file === "string"
              ? file
              : String((file as Record<string, unknown>).path ?? "")
          )
          .filter(Boolean)
          .slice(0, 12)
      : [];
  const proofCommands = Array.isArray(json.proofCommands)
    ? json.proofCommands.map(String).slice(0, 8)
    : [];

  return {
    path,
    status: stringValue(json.status),
    issueClass:
      stringValue(json.issueClass) ??
      (typeof json.repairIntelligence === "object" && json.repairIntelligence
        ? stringValue((json.repairIntelligence as Record<string, unknown>).issueClass)
        : undefined),
    filesToInspect,
    proofCommands,
  };
}

function readLearningPackets(cwd: string): AxintProjectMemoryIndex["learningPackets"] {
  const dir = join(cwd, ".axint/feedback");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort((a, b) => mtimeMs(b) - mtimeMs(a))
    .slice(0, 12)
    .flatMap((path) => {
      const json = readJson(path);
      if (!json) return [];
      return [
        {
          path,
          fingerprint: stringValue(json.fingerprint),
          priority: stringValue(json.priority),
          owner: stringValue(json.suggestedOwner),
          title: stringValue(json.title),
          diagnosticCodes: Array.isArray(json.diagnosticCodes)
            ? json.diagnosticCodes.map(String).slice(0, 8)
            : [],
          redaction:
            stringValue(json.redaction) ??
            (typeof json.privacy === "object" && json.privacy
              ? stringValue((json.privacy as Record<string, unknown>).redaction)
              : undefined),
        },
      ];
    });
}

function readJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function mtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function relativeOrAbsolute(root: string, file: string): string {
  const rel = relative(root, file);
  return rel && !rel.startsWith("..") && !resolve(file).startsWith("..") ? rel : file;
}
