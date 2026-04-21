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
  writeLine: (line: string) => void
) {
  for (const line of renderRepairArtifactLines(artifacts, {
    signedIn: getAxintLoginState().signedIn,
  })) {
    writeLine(line);
  }
}

export function renderRepairArtifactLines(
  artifacts: RepairArtifacts,
  options: { signedIn?: boolean } = {}
): string[] {
  const lines = [
    `\x1b[36m→\x1b[0m Axint Check → ${artifacts.check.jsonPath}`,
    `\x1b[36m→\x1b[0m Fix Packet → ${artifacts.packet.jsonPath}`,
  ];

  if (options.signedIn) {
    lines.push(...renderSignedInSummaryLines(artifacts.check.summary));
  } else {
    lines.push(
      "  \x1b[2mTip:\x1b[0m Run `axint login` to unlock richer terminal reports, publish, and hosted Axint features when available."
    );
  }

  return lines;
}

function renderSignedInSummaryLines(summary: CheckSummary): string[] {
  const verdict =
    summary.outcome.verdict === "needs_review"
      ? "Needs review"
      : summary.outcome.verdict[0]!.toUpperCase() + summary.outcome.verdict.slice(1);
  const topFinding = summary.topFindings[0];

  const lines = [
    "  \x1b[35m↳\x1b[0m Signed in · richer terminal report enabled",
    `    Verdict: ${verdict} · ${summary.outcome.headline}`,
  ];

  if (topFinding) {
    lines.push(`    Top finding: ${topFinding.code} · ${topFinding.message}`);
  }

  lines.push(`    Next: ${summary.nextAction}`);
  return lines;
}
