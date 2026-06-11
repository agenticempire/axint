import { getAxintLoginState } from "../core/credentials.js";
import {
  emitFixPacketArtifacts,
  type FixPacketArtifacts,
  type FixPacketInput,
} from "./fix-packet.js";
import {
  emitCheckSummaryArtifacts,
  type CheckSummaryArtifacts,
  type CheckSummary,
} from "./check-summary.js";

export interface RepairArtifacts {
  packet: FixPacketArtifacts;
  check: CheckSummaryArtifacts;
}

export function emitRepairArtifacts(
  input: FixPacketInput,
  cwd: string = process.cwd()
): RepairArtifacts {
  const packet = emitFixPacketArtifacts(input, cwd);
  const check = emitCheckSummaryArtifacts(packet.packet);
  return { packet, check };
}

export function tryEmitRepairArtifacts(
  input: FixPacketInput,
  cwd: string = process.cwd()
): { artifacts: RepairArtifacts | null; error: Error | null } {
  try {
    return { artifacts: emitRepairArtifacts(input, cwd), error: null };
  } catch (error: unknown) {
    return {
      artifacts: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function printRepairArtifactLines(
  artifacts: RepairArtifacts,
  writeLine: (line: string) => void,
  options: { color?: boolean } = {}
) {
  for (const line of renderRepairArtifactLines(artifacts, {
    signedIn: getAxintLoginState().signedIn,
    color: options.color,
  })) {
    writeLine(line);
  }
}

export function renderRepairArtifactLines(
  artifacts: RepairArtifacts,
  options: { signedIn?: boolean; color?: boolean } = {}
): string[] {
  const color = options.color ?? true;
  const paint = (ansi: string, text: string) => (color ? `${ansi}${text}\x1b[0m` : text);

  const lines = [
    `${paint("\x1b[36m", "→")} Axint Check → ${artifacts.check.jsonPath}`,
    `${paint("\x1b[36m", "→")} Fix Packet → ${artifacts.packet.jsonPath}`,
  ];

  if (options.signedIn) {
    lines.push(...renderSignedInSummaryLines(artifacts.check.summary, paint));
  } else {
    lines.push(
      `  ${paint("\x1b[2m", "Tip:")} Run \`axint login\` to unlock fuller repair summaries in terminal, \`axint publish\`, and Axint Cloud features like saved runs, reopenable history, and shareable links as they roll out.`
    );
  }

  return lines;
}

function renderSignedInSummaryLines(
  summary: CheckSummary,
  paint: (ansi: string, text: string) => string
): string[] {
  const verdict =
    summary.outcome.verdict === "needs_review"
      ? "Needs review"
      : summary.outcome.verdict[0]!.toUpperCase() + summary.outcome.verdict.slice(1);
  const topFinding = summary.topFindings[0];

  const lines = [
    `  ${paint("\x1b[35m", "↳")} Signed in · fuller repair report enabled`,
    `    Verdict: ${verdict} · ${summary.outcome.headline}`,
  ];

  if (topFinding) {
    lines.push(`    Top finding: ${topFinding.code} · ${topFinding.message}`);
  }

  lines.push(`    Next: ${summary.nextAction}`);
  return lines;
}
