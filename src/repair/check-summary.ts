import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import type {
  FixPacket,
  FixPacketCommand,
  FixPacketConfidence,
  FixPacketDiagnostic,
  FixPacketSurface,
  FixPacketVerdict,
} from "./fix-packet.js";

export interface CheckSummary {
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
    verdict: FixPacketVerdict;
    headline: string;
    detail: string;
    errors: number;
    warnings: number;
    infos: number;
  };
  coverage: {
    confidence: FixPacketConfidence;
    summary: string;
  };
  topFindings: FixPacketDiagnostic[];
  nextAction: string;
  packet: {
    jsonPath: string;
    markdownPath: string;
  };
  ai: {
    summary: string;
    prompt: string;
  };
  xcode: {
    summary: string;
  };
}

export interface CheckSummaryArtifacts {
  summary: CheckSummary;
  jsonPath: string;
  markdownPath: string;
}

function findingLine(finding: FixPacketDiagnostic): string {
  const location =
    finding.file || finding.line
      ? ` (${finding.file ?? "unknown"}${finding.line ? `:${finding.line}` : ""})`
      : "";
  return `- ${finding.code} [${finding.severity}] ${finding.message}${location}`;
}

export function buildCheckSummary(packet: FixPacket): CheckSummary {
  return {
    schemaVersion: 1,
    createdAt: packet.createdAt,
    compilerVersion: packet.compilerVersion,
    command: packet.command,
    source: { ...packet.source },
    outcome: {
      verdict: packet.outcome.verdict,
      headline: packet.outcome.headline,
      detail: packet.outcome.detail,
      errors: packet.outcome.errors,
      warnings: packet.outcome.warnings,
      infos: packet.outcome.infos,
    },
    coverage: { ...packet.coverage },
    topFindings: packet.topFindings.map((finding) => ({ ...finding })),
    nextAction:
      packet.nextSteps[0] ??
      "Rerun Axint after the next Apple-facing change so the check stays current.",
    packet: {
      jsonPath: packet.artifacts.packetJsonPath,
      markdownPath: packet.artifacts.packetMarkdownPath,
    },
    ai: {
      summary: packet.ai.summary,
      prompt: packet.ai.prompt,
    },
    xcode: {
      summary: packet.xcode.summary,
    },
  };
}

export function renderCheckSummaryMarkdown(summary: CheckSummary): string {
  const lines: string[] = [
    "# Axint Check",
    "",
    `- Verdict: **${summary.outcome.verdict}**`,
    `- Headline: ${summary.outcome.headline}`,
    `- Source: ${summary.source.filePath ?? summary.source.fileName}`,
    `- Surface: ${summary.source.surface}`,
    `- Confidence: ${summary.coverage.confidence}`,
    `- Compiler: ${summary.compilerVersion}`,
    `- Generated: ${summary.createdAt}`,
    "",
    "## What happened",
    "",
    summary.outcome.detail,
    "",
    summary.coverage.summary,
    "",
    `- Errors: ${summary.outcome.errors}`,
    `- Warnings: ${summary.outcome.warnings}`,
    `- Infos: ${summary.outcome.infos}`,
    "",
  ];

  if (summary.topFindings.length > 0) {
    lines.push("## Top findings", "");
    for (const finding of summary.topFindings) {
      lines.push(findingLine(finding));
      if (finding.suggestion) {
        lines.push(`  Suggestion: ${finding.suggestion}`);
      }
    }
    lines.push("");
  } else {
    lines.push("## Top findings", "", "No findings were emitted in this run.", "");
  }

  lines.push(
    "## Next step",
    "",
    `- ${summary.nextAction}`,
    "",
    "## AI handoff",
    "",
    `- ${summary.ai.summary}`,
    `- Fix Packet JSON: ${summary.packet.jsonPath}`,
    `- Fix Packet Markdown: ${summary.packet.markdownPath}`,
    "",
    "## Xcode handoff",
    "",
    `- ${summary.xcode.summary}`
  );

  return lines.join("\n");
}

export function resolveCheckSummaryPaths(packet: FixPacket): {
  jsonPath: string;
  markdownPath: string;
} {
  const packetDir = dirname(packet.artifacts.packetJsonPath);
  return {
    jsonPath: resolve(packetDir, "latest.check.json"),
    markdownPath: resolve(packetDir, "latest.check.md"),
  };
}

export function emitCheckSummaryArtifacts(packet: FixPacket): CheckSummaryArtifacts {
  const summary = buildCheckSummary(packet);
  const { jsonPath, markdownPath } = resolveCheckSummaryPaths(packet);

  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
  writeFileSync(markdownPath, `${renderCheckSummaryMarkdown(summary)}\n`, "utf-8");

  return { summary, jsonPath, markdownPath };
}
