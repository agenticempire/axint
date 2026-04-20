import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic } from "../core/types.js";

export type FixPacketVerdict = "pass" | "needs_review" | "fail";
export type FixPacketSurface = "intent" | "view" | "widget" | "app" | "swift";
export type FixPacketFormat = "json" | "markdown" | "prompt";
export type FixPacketCommand = "compile" | "watch" | "mcp" | "validate_swift";

export interface FixPacketDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface FixPacket {
  schemaVersion: 1;
  createdAt: string;
  compilerVersion: string;
  command: FixPacketCommand;
  source: {
    surface: FixPacketSurface;
    language: "typescript" | "json" | "swift";
    fileName: string;
    filePath?: string;
    sourceLines: number | null;
  };
  outcome: {
    success: boolean;
    verdict: FixPacketVerdict;
    headline: string;
    detail: string;
    errors: number;
    warnings: number;
    infos: number;
  };
  artifacts: {
    outputPath: string | null;
    infoPlistPath: string | null;
    entitlementsPath: string | null;
    packetJsonPath: string;
    packetMarkdownPath: string;
  };
  topFindings: FixPacketDiagnostic[];
  diagnostics: FixPacketDiagnostic[];
  nextSteps: string[];
  ai: {
    summary: string;
    prompt: string;
  };
  xcode: {
    summary: string;
    checklist: string[];
  };
}

export interface FixPacketInput {
  success: boolean;
  surface: FixPacketSurface;
  diagnostics: Diagnostic[];
  source?: string;
  fileName?: string;
  filePath?: string;
  language?: "typescript" | "json" | "swift";
  outputPath?: string;
  infoPlistPath?: string;
  entitlementsPath?: string;
  compilerVersion?: string;
  packetDir?: string;
  command?: FixPacketCommand;
}

export interface FixPacketArtifacts {
  packet: FixPacket;
  packetDir: string;
  jsonPath: string;
  markdownPath: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
let compilerVersion = "0.3.9";
try {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, "../../package.json"), "utf-8")
  ) as {
    version?: string;
  };
  if (typeof pkg.version === "string" && pkg.version.length > 0) {
    compilerVersion = pkg.version;
  }
} catch {
  // Fallback version is fine when bundled or tested outside the repo.
}

function countNonBlankLines(source?: string): number | null {
  if (!source) return null;
  return source.split("\n").filter((line) => line.trim().length > 0).length;
}

function severityWeight(severity: FixPacketDiagnostic["severity"]): number {
  switch (severity) {
    case "error":
      return 0;
    case "warning":
      return 1;
    default:
      return 2;
  }
}

function serializeDiagnostic(diagnostic: Diagnostic): FixPacketDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    file: diagnostic.file,
    line: diagnostic.line,
    suggestion: diagnostic.suggestion,
  };
}

function getVerdict(
  success: boolean,
  errors: number,
  warnings: number
): FixPacketVerdict {
  if (!success || errors > 0) return "fail";
  if (warnings > 0) return "needs_review";
  return "pass";
}

function buildOutcomeCopy(verdict: FixPacketVerdict): {
  headline: string;
  detail: string;
} {
  switch (verdict) {
    case "fail":
      return {
        headline: "Axint check failed",
        detail:
          "Blocking Apple-platform issues were found. Fix the failing findings below, then rerun the check.",
      };
    case "needs_review":
      return {
        headline: "Axint check needs review",
        detail:
          "The code compiled, but Apple-facing warnings still need attention before you trust the result.",
      };
    case "pass":
      return {
        headline: "Axint check passed",
        detail:
          "No blocking or warning diagnostics were emitted for this run. You can keep moving or save the result as a baseline.",
      };
  }
}

function buildNextSteps(verdict: FixPacketVerdict, sourceLabel: string): string[] {
  switch (verdict) {
    case "fail":
      return [
        `Copy the AI fix prompt and repair ${sourceLabel}.`,
        "Rerun Axint after the fix lands.",
        "Only keep shipping once the blocking findings are gone.",
      ];
    case "needs_review":
      return [
        `Review the warning set for ${sourceLabel} and decide what actually needs a fix.`,
        "Use the AI fix prompt if you want help making the Apple-specific changes quickly.",
        "Rerun Axint so the warning set drops to zero before you ship.",
      ];
    case "pass":
      return [
        `Keep ${sourceLabel} as the current clean baseline.`,
        "If you touch the code again, rerun Axint before you go back to Xcode or commit.",
        "Share the markdown packet with an AI tool or teammate only when you want a durable record.",
      ];
  }
}

function buildAiPrompt(packet: FixPacket): string {
  const lines: string[] = [
    "You are fixing Apple-platform code after an Axint validation run.",
    "",
    "AX codes are Axint diagnostic IDs in the report. They are labels for the findings only; you do not need Axint installed to use them.",
    "",
    `Verdict: ${packet.outcome.verdict}`,
    `Headline: ${packet.outcome.headline}`,
    `Source file: ${packet.source.filePath ?? packet.source.fileName}`,
    `Surface: ${packet.source.surface}`,
    `Compiler version: ${packet.compilerVersion}`,
    "",
  ];

  if (packet.topFindings.length > 0) {
    lines.push("Findings to address:");
    for (const finding of packet.topFindings) {
      lines.push(`- ${finding.code} [${finding.severity}] ${finding.message}`);
      if (finding.file || finding.line) {
        lines.push(
          `  Location: ${finding.file ?? packet.source.fileName}${finding.line ? `:${finding.line}` : ""}`
        );
      }
      if (finding.suggestion) {
        lines.push(`  Suggested direction: ${finding.suggestion}`);
      }
    }
    lines.push("");
  } else {
    lines.push("No findings were emitted in this run.");
    lines.push("");
  }

  lines.push(
    "Please update the source so the failing or warning findings are resolved, preserve the intended Apple behavior, and explain the concrete changes you made."
  );

  return lines.join("\n");
}

function buildXcodeChecklist(packet: FixPacket): string[] {
  if (packet.outcome.verdict === "pass") {
    return [
      "Open the generated file or project in Xcode.",
      "Run your normal build or simulator pass.",
      "Rerun Axint if you make another Apple-facing change.",
    ];
  }

  return [
    "Open the affected file in Xcode or your AI editor.",
    "Apply the AI fix prompt or make the Apple-specific edits manually.",
    "Rerun Axint so the result updates before you continue.",
  ];
}

function renderFindingLines(finding: FixPacketDiagnostic): string[] {
  const lines = [`- ${finding.code} [${finding.severity}] ${finding.message}`];
  if (finding.file || finding.line) {
    lines.push(
      `  Location: ${finding.file ?? "unknown"}${finding.line ? `:${finding.line}` : ""}`
    );
  }
  if (finding.suggestion) {
    lines.push(`  Suggestion: ${finding.suggestion}`);
  }
  return lines;
}

export function resolveFixPacketDir(
  cwd: string = process.cwd(),
  packetDir: string = ".axint/fix"
): string {
  return resolve(cwd, packetDir);
}

export function buildFixPacket(
  input: FixPacketInput & {
    packetJsonPath: string;
    packetMarkdownPath: string;
  }
): FixPacket {
  const diagnostics = input.diagnostics.map(serializeDiagnostic);
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const infos = diagnostics.filter((d) => d.severity === "info").length;
  const verdict = getVerdict(input.success, errors, warnings);
  const outcomeCopy = buildOutcomeCopy(verdict);
  const orderedFindings = [...diagnostics].sort((left, right) => {
    const severityDelta = severityWeight(left.severity) - severityWeight(right.severity);
    if (severityDelta !== 0) return severityDelta;
    return left.code.localeCompare(right.code);
  });
  const fileName =
    input.fileName ??
    (input.filePath
      ? basename(input.filePath)
      : input.language === "json"
        ? "input.json"
        : input.language === "swift"
          ? "input.swift"
          : "input.ts");

  const packet: FixPacket = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    compilerVersion: input.compilerVersion ?? compilerVersion,
    command: input.command ?? "compile",
    source: {
      surface: input.surface,
      language: input.language ?? "typescript",
      fileName,
      filePath: input.filePath,
      sourceLines: countNonBlankLines(input.source),
    },
    outcome: {
      success: input.success,
      verdict,
      headline: outcomeCopy.headline,
      detail: outcomeCopy.detail,
      errors,
      warnings,
      infos,
    },
    artifacts: {
      outputPath: input.outputPath ?? null,
      infoPlistPath: input.infoPlistPath ?? null,
      entitlementsPath: input.entitlementsPath ?? null,
      packetJsonPath: input.packetJsonPath,
      packetMarkdownPath: input.packetMarkdownPath,
    },
    topFindings: orderedFindings.slice(0, 3),
    diagnostics,
    nextSteps: buildNextSteps(verdict, fileName),
    ai: {
      summary:
        verdict === "pass"
          ? "No fixes are required right now."
          : "Copy the prompt below into your AI tool to fix the Apple-specific issues quickly.",
      prompt: "",
    },
    xcode: {
      summary:
        verdict === "pass"
          ? "This result is clean enough to carry back into Xcode."
          : "Use this packet as the repair checklist before you go back to Xcode.",
      checklist: [],
    },
  };

  packet.ai.prompt = buildAiPrompt(packet);
  packet.xcode.checklist = buildXcodeChecklist(packet);

  return packet;
}

export function renderFixPacketMarkdown(packet: FixPacket): string {
  const lines: string[] = [
    `# Axint Fix Packet`,
    "",
    `- Verdict: **${packet.outcome.verdict}**`,
    `- Headline: ${packet.outcome.headline}`,
    `- Source: ${packet.source.filePath ?? packet.source.fileName}`,
    `- Surface: ${packet.source.surface}`,
    `- Compiler: ${packet.compilerVersion}`,
    `- Generated: ${packet.createdAt}`,
    "",
    "## What happened",
    "",
    packet.outcome.detail,
    "",
    `- Errors: ${packet.outcome.errors}`,
    `- Warnings: ${packet.outcome.warnings}`,
    `- Infos: ${packet.outcome.infos}`,
    "",
  ];

  if (packet.topFindings.length > 0) {
    lines.push("## Top findings", "");
    for (const finding of packet.topFindings) {
      lines.push(...renderFindingLines(finding), "");
    }
  } else {
    lines.push("## Top findings", "", "No findings were emitted in this run.", "");
  }

  lines.push("## Next steps", "");
  for (const step of packet.nextSteps) {
    lines.push(`- ${step}`);
  }
  lines.push("", "## Copy this into your AI", "", "```text", packet.ai.prompt, "```", "");

  return lines.join("\n");
}

export function emitFixPacketArtifacts(
  input: FixPacketInput,
  cwd: string = process.cwd()
): FixPacketArtifacts {
  const packetDir = resolveFixPacketDir(cwd, input.packetDir);
  const jsonPath = resolve(packetDir, "latest.json");
  const markdownPath = resolve(packetDir, "latest.md");

  const packet = buildFixPacket({
    ...input,
    packetJsonPath: jsonPath,
    packetMarkdownPath: markdownPath,
  });

  mkdirSync(packetDir, { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`, "utf-8");
  writeFileSync(markdownPath, `${renderFixPacketMarkdown(packet)}\n`, "utf-8");

  return { packet, packetDir, jsonPath, markdownPath };
}

export function findLatestFixPacketPath(options?: {
  cwd?: string;
  packetDir?: string;
}): string | null {
  const cwd = resolve(options?.cwd ?? process.cwd());
  if (options?.packetDir) {
    const candidate = resolveFixPacketDir(cwd, options.packetDir);
    const jsonPath = resolve(candidate, "latest.json");
    return existsSync(jsonPath) ? jsonPath : null;
  }

  let current = cwd;
  for (;;) {
    const candidate = resolve(current, ".axint/fix/latest.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function readLatestFixPacket(options?: {
  cwd?: string;
  packetDir?: string;
}): FixPacket | null {
  const packetPath = findLatestFixPacketPath(options);
  if (!packetPath) return null;
  return JSON.parse(readFileSync(packetPath, "utf-8")) as FixPacket;
}
