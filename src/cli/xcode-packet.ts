import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import {
  renderFixPacketMarkdown,
  type FixPacket,
  type FixPacketFormat,
} from "../repair/fix-packet.js";

export type XcodePacketKind = "any" | "compile" | "validate";
export type XcodePacketOutput = FixPacketFormat | "path";

interface XcodePacketOptions {
  root?: string;
  kind: XcodePacketKind;
  format: XcodePacketOutput;
}

interface PacketCandidate {
  path: string;
  packet: FixPacket;
  kind: Exclude<XcodePacketKind, "any">;
  mtimeMs: number;
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".build",
  "Index.noindex",
  "ModuleCache.noindex",
  "SDKStatCaches.noindex",
  "TextIndex",
  "Logs",
  "checkouts",
  "artifacts",
]);

function defaultDerivedDataRoot(): string {
  return resolve(homedir(), "Library/Developer/Xcode/DerivedData");
}

function packetKindFrom(
  candidatePath: string,
  packet: FixPacket
): Exclude<XcodePacketKind, "any"> {
  if (
    packet.command === "validate_swift" ||
    candidatePath.includes(`${sep}fix${sep}validate${sep}`)
  ) {
    return "validate";
  }
  return "compile";
}

function isFixPacketPath(candidatePath: string): boolean {
  return (
    candidatePath.endsWith(`${sep}latest.json`) &&
    candidatePath.includes(`${sep}fix${sep}`)
  );
}

function safeStat(pathArg: string) {
  try {
    return statSync(pathArg);
  } catch {
    return null;
  }
}

function readPacketCandidate(candidatePath: string): PacketCandidate | null {
  try {
    const packet = JSON.parse(readFileSync(candidatePath, "utf-8")) as FixPacket;
    const stat = statSync(candidatePath);
    return {
      path: candidatePath,
      packet,
      kind: packetKindFrom(candidatePath, packet),
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

function collectPacketCandidates(root: string, out: PacketCandidate[]) {
  const stat = safeStat(root);
  if (!stat) return;

  if (stat.isFile()) {
    if (basename(root) === "latest.json") {
      const candidate = readPacketCandidate(root);
      if (candidate) out.push(candidate);
    }
    return;
  }

  const directPacket = join(root, "latest.json");
  if (existsSync(directPacket) && isFixPacketPath(directPacket)) {
    const candidate = readPacketCandidate(directPacket);
    if (candidate) out.push(candidate);
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    collectPacketCandidates(join(root, entry.name), out);
  }
}

export function findLatestXcodePacket(
  root: string,
  kind: XcodePacketKind
): PacketCandidate | null {
  const candidates: PacketCandidate[] = [];
  collectPacketCandidates(resolve(root), candidates);

  const filtered =
    kind === "any"
      ? candidates
      : candidates.filter((candidate) => candidate.kind === kind);

  if (filtered.length === 0) return null;

  filtered.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs;
    return right.path.localeCompare(left.path);
  });

  return filtered[0];
}

function renderPacket(candidate: PacketCandidate, format: XcodePacketOutput): string {
  switch (format) {
    case "path":
      return candidate.path;
    case "json":
      return JSON.stringify(candidate.packet, null, 2);
    case "prompt":
      return candidate.packet.ai.prompt;
    case "markdown":
    default:
      return renderFixPacketMarkdown(candidate.packet);
  }
}

export async function runXcodePacket(options: XcodePacketOptions): Promise<void> {
  const root = resolve(options.root ?? defaultDerivedDataRoot());
  const candidate = findLatestXcodePacket(root, options.kind);

  if (!candidate) {
    console.error(
      `error: no ${options.kind === "any" ? "" : `${options.kind} `}Fix Packet found under ${root}`
    );
    console.error(
      "hint: build in Xcode first, or point --root at a DerivedData or plugin work directory."
    );
    process.exit(1);
  }

  process.stdout.write(`${renderPacket(candidate, options.format)}\n`);
}
