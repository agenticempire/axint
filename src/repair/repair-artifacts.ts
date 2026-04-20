import {
  emitFixPacketArtifacts,
  type FixPacketArtifacts,
  type FixPacketInput,
} from "./fix-packet.js";
import {
  emitCheckSummaryArtifacts,
  type CheckSummaryArtifacts,
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
  writeLine(`\x1b[36m→\x1b[0m Axint Check → ${artifacts.check.jsonPath}`);
  writeLine(`\x1b[36m→\x1b[0m Fix Packet → ${artifacts.packet.jsonPath}`);
}
