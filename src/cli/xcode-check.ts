import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCheckSummary,
  renderCheckSummaryMarkdown,
  resolveCheckSummaryPaths,
  type CheckSummary,
} from "../repair/check-summary.js";
import type { FixPacket } from "../repair/fix-packet.js";
import {
  defaultDerivedDataRoot,
  findLatestXcodePacket,
  type XcodePacketKind,
} from "./xcode-packet.js";

export type XcodeCheckOutput = "markdown" | "json" | "prompt" | "path";

interface XcodeCheckOptions {
  root?: string;
  kind: XcodePacketKind;
  format: XcodeCheckOutput;
}

function readExistingSummary(packetPath: string): CheckSummary | null {
  const jsonPath = packetPath.replace(/latest\.json$/, "latest.check.json");
  if (!existsSync(jsonPath)) return null;
  try {
    return JSON.parse(readFileSync(jsonPath, "utf-8")) as CheckSummary;
  } catch {
    return null;
  }
}

function renderCheckOutput(
  packetPath: string,
  packet: FixPacket,
  format: XcodeCheckOutput
): string {
  const summary = readExistingSummary(packetPath) ?? buildCheckSummary(packet);
  switch (format) {
    case "path":
      return readExistingSummary(packetPath)
        ? packetPath.replace(/latest\.json$/, "latest.check.json")
        : resolveCheckSummaryPaths(packet).jsonPath;
    case "json":
      return JSON.stringify(summary, null, 2);
    case "prompt":
      return summary.ai.prompt;
    case "markdown":
    default:
      return renderCheckSummaryMarkdown(summary);
  }
}

export async function runXcodeCheck(options: XcodeCheckOptions): Promise<void> {
  const root = resolve(options.root ?? defaultDerivedDataRoot());
  const candidate = findLatestXcodePacket(root, options.kind);

  if (!candidate) {
    console.error(
      `error: no ${options.kind === "any" ? "" : `${options.kind} `}Axint Check found under ${root}`
    );
    console.error(
      "hint: build in Xcode first, or point --root at a DerivedData or plugin work directory."
    );
    process.exit(1);
  }

  process.stdout.write(
    `${renderCheckOutput(candidate.path, candidate.packet, options.format)}\n`
  );
}
