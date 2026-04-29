import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import type { CloudLearningSignal } from "../cloud/check.js";
import type { AxintRepairFeedbackPacket } from "../repair/project-repair.js";

export type AxintFeedbackFormat = "json" | "markdown";

export type AxintFeedbackPacket =
  | { kind: "repair"; packet: AxintRepairFeedbackPacket }
  | { kind: "cloud"; packet: CloudLearningSignal };

export interface AxintFeedbackBundle {
  schema: "https://axint.ai/schemas/feedback-bundle.v1.json";
  id: string;
  createdAt: string;
  compilerVersion?: string;
  projectLabel?: string;
  contact?: string;
  privacy: {
    redaction: "source_not_included";
    sourceSharing: "never_by_default";
    userCanInspectBeforeSending: true;
    transport: "manual_export" | "manual_import";
  };
  packets: Array<AxintRepairFeedbackPacket | CloudLearningSignal>;
}

export interface AxintFeedbackInboxItem {
  id: string;
  packetType: "repair" | "cloud";
  importedAt: string;
  projectLabel?: string;
  contact?: string;
  sourceFile: string;
  compilerVersion?: string;
  priority: string;
  issueClass: string;
  status?: string;
  confidence?: string;
  diagnostics: string[];
  signals: string[];
  suggestedOwner?: string;
  suggestedAction?: string;
  privacy: "source_not_included";
  warnings: string[];
}

export interface AxintFeedbackCluster {
  key: string;
  count: number;
  priority: string;
  issueClass: string;
  diagnostics: string[];
  signals: string[];
  suggestedOwner?: string;
  suggestedAction?: string;
  packetIds: string[];
  projects: string[];
}

export interface AxintFeedbackExportReport {
  cwd: string;
  outPath: string;
  bundle: AxintFeedbackBundle;
  packetCount: number;
  warnings: string[];
}

export interface AxintFeedbackImportReport {
  cwd: string;
  inboxDir: string;
  imported: AxintFeedbackInboxItem[];
  skipped: Array<{ file: string; reason: string }>;
  warnings: string[];
}

export interface AxintFeedbackInboxReport {
  cwd: string;
  inboxDir: string;
  items: AxintFeedbackInboxItem[];
  clusters: AxintFeedbackCluster[];
  nextMoves: string[];
  privacy: {
    redaction: "source_not_included";
    sourceSharing: "never_by_default";
  };
}

type ExportOptions = {
  cwd?: string;
  out?: string;
  projectLabel?: string;
  contact?: string;
  latestOnly?: boolean;
};

type ImportOptions = {
  cwd?: string;
  projectLabel?: string;
  contact?: string;
};

type ListOptions = {
  cwd?: string;
};

export function exportAxintFeedback(
  options: ExportOptions = {}
): AxintFeedbackExportReport {
  const cwd = resolve(options.cwd ?? process.cwd());
  const latestPackets = options.latestOnly ? readLatestFeedbackPacket(cwd) : [];
  const packets =
    options.latestOnly && latestPackets.length > 0
      ? latestPackets
      : readLocalFeedbackPackets(cwd);
  const createdAt = new Date().toISOString();
  const warnings: string[] = [];

  if (packets.length === 0) {
    warnings.push(
      "No local feedback packets found. Run `axint run`, `axint repair`, or `axint feedback create` first."
    );
  }

  const packetPayloads = packets.map((entry) => entry.packet);
  for (const packet of packetPayloads) {
    warnings.push(...privacyWarningsForPacket(packet));
  }

  const bundleId = `feedback-bundle-${hashString(
    [cwd, createdAt, packetPayloads.map(packetStableId).join("|")].join(":")
  )}`;
  const bundle: AxintFeedbackBundle = {
    schema: "https://axint.ai/schemas/feedback-bundle.v1.json",
    id: bundleId,
    createdAt,
    compilerVersion: firstCompilerVersion(packetPayloads),
    projectLabel: options.projectLabel,
    contact: options.contact,
    privacy: {
      redaction: "source_not_included",
      sourceSharing: "never_by_default",
      userCanInspectBeforeSending: true,
      transport: "manual_export",
    },
    packets: packetPayloads,
  };

  const outPath = resolve(
    cwd,
    options.out ?? join(".axint/feedback/outbox", `${bundle.id}.json`)
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8");

  return { cwd, outPath, bundle, packetCount: packetPayloads.length, warnings };
}

export function importAxintFeedback(
  files: string[],
  options: ImportOptions = {}
): AxintFeedbackImportReport {
  const cwd = resolve(options.cwd ?? process.cwd());
  const inboxDir = resolve(cwd, ".axint/feedback/inbox");
  mkdirSync(inboxDir, { recursive: true });
  const imported: AxintFeedbackInboxItem[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  const warnings: string[] = [];

  for (const file of files) {
    const abs = resolve(file);
    if (!existsSync(abs)) {
      skipped.push({ file, reason: "file_not_found" });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(abs, "utf-8"));
    } catch {
      skipped.push({ file, reason: "invalid_json" });
      continue;
    }

    const packets = expandFeedbackPayload(parsed);
    if (packets.length === 0) {
      skipped.push({ file, reason: "no_source_free_feedback_packets" });
      continue;
    }

    for (const entry of packets) {
      const packetWarnings = privacyWarningsForPacket(entry.packet);
      warnings.push(...packetWarnings.map((warning) => `${basename(file)}: ${warning}`));
      const item = itemFromPacket(entry, {
        importedAt: new Date().toISOString(),
        projectLabel: options.projectLabel ?? bundleProjectLabel(parsed),
        contact: options.contact ?? bundleContact(parsed),
        sourceFile: abs,
        warnings: packetWarnings,
      });
      const target = join(inboxDir, `${item.id}.json`);
      writeFileSync(
        target,
        `${JSON.stringify({ ...item, packet: entry.packet }, null, 2)}\n`,
        "utf-8"
      );
      imported.push(item);
    }

    const archivePath = join(inboxDir, "_imports", basename(abs));
    mkdirSync(resolve(archivePath, ".."), { recursive: true });
    copyFileSync(abs, archivePath);
  }

  return { cwd, inboxDir, imported, skipped, warnings };
}

export function listAxintFeedbackInbox(
  options: ListOptions = {}
): AxintFeedbackInboxReport {
  const cwd = resolve(options.cwd ?? process.cwd());
  const inboxDir = resolve(cwd, ".axint/feedback/inbox");
  const items = readInboxItems(inboxDir);
  const clusters = clusterInboxItems(items);
  const nextMoves = clusters.slice(0, 8).map((cluster) => {
    const diagnostics = cluster.diagnostics.length
      ? ` (${cluster.diagnostics.slice(0, 4).join(", ")})`
      : "";
    const owner = cluster.suggestedOwner ? ` for ${cluster.suggestedOwner}` : "";
    return `${cluster.priority.toUpperCase()} · ${cluster.count} packet${cluster.count === 1 ? "" : "s"} · ${cluster.issueClass}${diagnostics}${owner}: ${cluster.suggestedAction ?? "Cluster repeated packets into a new Axint diagnostic, repair heuristic, or proof rule."}`;
  });

  return {
    cwd,
    inboxDir,
    items,
    clusters,
    nextMoves,
    privacy: {
      redaction: "source_not_included",
      sourceSharing: "never_by_default",
    },
  };
}

export function renderFeedbackExportReport(
  report: AxintFeedbackExportReport,
  format: AxintFeedbackFormat
): string {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  return [
    "# Axint Feedback Export",
    "",
    `- Packets: ${report.packetCount}`,
    `- Bundle: ${report.outPath}`,
    "- Privacy: source not included; source sharing is never enabled by default",
    ...(report.bundle.projectLabel
      ? [`- Project label: ${report.bundle.projectLabel}`]
      : []),
    ...(report.warnings.length
      ? ["", "## Warnings", ...report.warnings.map((w) => `- ${w}`)]
      : []),
    "",
    "Send this JSON bundle to the Axint maintainer, or import it into an Axint feedback inbox.",
  ].join("\n");
}

export function renderFeedbackImportReport(
  report: AxintFeedbackImportReport,
  format: AxintFeedbackFormat
): string {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  return [
    "# Axint Feedback Import",
    "",
    `- Imported: ${report.imported.length}`,
    `- Skipped: ${report.skipped.length}`,
    `- Inbox: ${report.inboxDir}`,
    "- Privacy: imported packets are source-free",
    "",
    ...(report.imported.length
      ? [
          "## Imported Packets",
          ...report.imported.map(
            (item) =>
              `- ${item.priority.toUpperCase()} · ${item.issueClass} · ${item.id}${item.projectLabel ? ` · ${item.projectLabel}` : ""}`
          ),
        ]
      : ["No packets imported."]),
    ...(report.skipped.length
      ? [
          "",
          "## Skipped",
          ...report.skipped.map((item) => `- ${item.file}: ${item.reason}`),
        ]
      : []),
    ...(report.warnings.length
      ? ["", "## Privacy Warnings", ...report.warnings.map((warning) => `- ${warning}`)]
      : []),
  ].join("\n");
}

export function renderFeedbackInboxReport(
  report: AxintFeedbackInboxReport,
  format: AxintFeedbackFormat
): string {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  return [
    "# Axint Feedback Inbox",
    "",
    `- Packets: ${report.items.length}`,
    `- Clusters: ${report.clusters.length}`,
    `- Inbox: ${report.inboxDir}`,
    "- Privacy: source not included; source sharing is never enabled by default",
    "",
    "## Next Axint Fixes",
    ...(report.nextMoves.length
      ? report.nextMoves.map((move) => `- ${move}`)
      : ["- No imported feedback yet."]),
    "",
    "## Clusters",
    ...(report.clusters.length
      ? report.clusters.map(
          (cluster) =>
            `- ${cluster.priority.toUpperCase()} · ${cluster.count}x · ${cluster.issueClass} · ${cluster.diagnostics.join(", ") || "no diagnostics"}`
        )
      : ["- No clusters yet."]),
    "",
    "## Recent Packets",
    ...(report.items.length
      ? report.items.slice(0, 20).map((item) => {
          const project = item.projectLabel ? ` · ${item.projectLabel}` : "";
          const diagnostics = item.diagnostics.length
            ? ` · ${item.diagnostics.join(", ")}`
            : "";
          return `- ${item.priority.toUpperCase()} · ${item.issueClass}${diagnostics}${project} · ${item.id}`;
        })
      : ["- No packets yet."]),
  ].join("\n");
}

function readLatestFeedbackPacket(cwd: string): AxintFeedbackPacket[] {
  const latest = resolve(cwd, ".axint/feedback/latest.json");
  if (!existsSync(latest)) return [];
  try {
    return expandFeedbackPayload(JSON.parse(readFileSync(latest, "utf-8"))).slice(0, 1);
  } catch {
    return [];
  }
}

function readLocalFeedbackPackets(cwd: string): AxintFeedbackPacket[] {
  const dir = resolve(cwd, ".axint/feedback");
  if (!existsSync(dir)) return [];
  const packets: AxintFeedbackPacket[] = [];
  const seen = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    try {
      for (const packet of expandFeedbackPayload(
        JSON.parse(readFileSync(path, "utf-8"))
      )) {
        const id = packetStableId(packet.packet);
        if (seen.has(id)) continue;
        seen.add(id);
        packets.push(packet);
      }
    } catch {
      // Ignore corrupt local scratch packets; import/list reports are stricter.
    }
  }
  return packets;
}

function expandFeedbackPayload(payload: unknown): AxintFeedbackPacket[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (record.schema === "https://axint.ai/schemas/feedback-bundle.v1.json") {
    const packets = Array.isArray(record.packets) ? record.packets : [];
    return packets.flatMap(expandFeedbackPayload);
  }
  if (isRepairFeedbackPacket(record)) {
    return [{ kind: "repair", packet: record as unknown as AxintRepairFeedbackPacket }];
  }
  if (isCloudLearningSignal(record)) {
    return [{ kind: "cloud", packet: record as unknown as CloudLearningSignal }];
  }
  if (record.packet && typeof record.packet === "object") {
    return expandFeedbackPayload(record.packet);
  }
  return [];
}

function readInboxItems(inboxDir: string): AxintFeedbackInboxItem[] {
  if (!existsSync(inboxDir)) return [];
  const items: AxintFeedbackInboxItem[] = [];
  for (const file of readdirSync(inboxDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(inboxDir, file), "utf-8"));
      if (isInboxItem(parsed)) items.push(parsed);
    } catch {
      // Ignore corrupt inbox scratch files in list mode.
    }
  }
  return items.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

function clusterInboxItems(items: AxintFeedbackInboxItem[]): AxintFeedbackCluster[] {
  const clusters = new Map<string, AxintFeedbackCluster>();
  for (const item of items) {
    const key = [
      item.issueClass,
      item.diagnostics.slice(0, 4).join(","),
      item.signals.slice(0, 3).join(","),
    ].join(":");
    const existing = clusters.get(key);
    if (existing) {
      existing.count += 1;
      existing.packetIds.push(item.id);
      existing.projects = uniqueStrings(
        [...existing.projects, item.projectLabel].filter(Boolean) as string[]
      );
      existing.diagnostics = uniqueStrings([
        ...existing.diagnostics,
        ...item.diagnostics,
      ]);
      existing.signals = uniqueStrings([...existing.signals, ...item.signals]);
      existing.priority = highestPriority(existing.priority, item.priority);
      continue;
    }
    clusters.set(key, {
      key,
      count: 1,
      priority: item.priority,
      issueClass: item.issueClass,
      diagnostics: item.diagnostics,
      signals: item.signals,
      suggestedOwner: item.suggestedOwner,
      suggestedAction: item.suggestedAction,
      packetIds: [item.id],
      projects: item.projectLabel ? [item.projectLabel] : [],
    });
  }
  return [...clusters.values()].sort((a, b) => {
    const priority = priorityRank(b.priority) - priorityRank(a.priority);
    if (priority !== 0) return priority;
    return b.count - a.count;
  });
}

function itemFromPacket(
  entry: AxintFeedbackPacket,
  meta: {
    importedAt: string;
    projectLabel?: string;
    contact?: string;
    sourceFile: string;
    warnings: string[];
  }
): AxintFeedbackInboxItem {
  if (entry.kind === "repair") {
    const packet = entry.packet;
    return {
      id: packetStableId(packet),
      packetType: "repair",
      importedAt: meta.importedAt,
      projectLabel: meta.projectLabel,
      contact: meta.contact,
      sourceFile: meta.sourceFile,
      compilerVersion: packet.compilerVersion,
      priority: packet.classification.priority,
      issueClass: packet.classification.issueClass,
      status: packet.classification.status,
      confidence: packet.classification.confidence,
      diagnostics: packet.diagnostics.map((diagnostic) => diagnostic.code),
      signals: packet.signals,
      suggestedOwner: packet.suggestedAxintOwner,
      suggestedAction: packet.suggestedProductAction,
      privacy: "source_not_included",
      warnings: meta.warnings,
    };
  }
  const packet = entry.packet;
  return {
    id: packetStableId(packet),
    packetType: "cloud",
    importedAt: meta.importedAt,
    projectLabel: meta.projectLabel,
    contact: meta.contact,
    sourceFile: meta.sourceFile,
    compilerVersion: packet.compilerVersion,
    priority: packet.priority,
    issueClass: packet.kind,
    status: packet.status,
    confidence: undefined,
    diagnostics: packet.diagnosticCodes,
    signals: packet.signals,
    suggestedOwner: packet.suggestedOwner,
    suggestedAction: packet.suggestedAction,
    privacy: "source_not_included",
    warnings: meta.warnings,
  };
}

function isRepairFeedbackPacket(value: Record<string, unknown>): boolean {
  return (
    value.schema === "https://axint.ai/schemas/repair-feedback.v1.json" &&
    typeof value.id === "string" &&
    typeof value.privacy === "object" &&
    (value.privacy as Record<string, unknown>).redaction === "source_not_included"
  );
}

function isCloudLearningSignal(value: Record<string, unknown>): boolean {
  return (
    typeof value.fingerprint === "string" &&
    value.redaction === "source_not_included" &&
    Array.isArray(value.diagnosticCodes) &&
    typeof value.suggestedAction === "string"
  );
}

function isInboxItem(value: unknown): value is AxintFeedbackInboxItem {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as AxintFeedbackInboxItem).id === "string" &&
    typeof (value as AxintFeedbackInboxItem).issueClass === "string" &&
    (value as AxintFeedbackInboxItem).privacy === "source_not_included"
  );
}

function packetStableId(packet: AxintRepairFeedbackPacket | CloudLearningSignal): string {
  if ("fingerprint" in packet) return packet.fingerprint;
  return packet.id;
}

function firstCompilerVersion(
  packets: Array<AxintRepairFeedbackPacket | CloudLearningSignal>
): string | undefined {
  return packets.find((packet) => packet.compilerVersion)?.compilerVersion;
}

function privacyWarningsForPacket(
  packet: AxintRepairFeedbackPacket | CloudLearningSignal
): string[] {
  const warnings: string[] = [];
  const text = JSON.stringify(packet);
  if (!text.includes("source_not_included")) {
    warnings.push("packet does not declare source_not_included redaction");
  }
  if (/\bimport\s+(SwiftUI|AppIntents|Foundation)\b/.test(text)) {
    warnings.push(
      "packet appears to contain raw Swift import text; inspect before sharing"
    );
  }
  if (/\bstruct\s+\w+\s*:\s*(View|AppIntent)\b/.test(text)) {
    warnings.push(
      "packet appears to contain raw Swift declaration text; inspect before sharing"
    );
  }
  return uniqueStrings(warnings);
}

function bundleProjectLabel(payload: unknown): string | undefined {
  return typeof payload === "object" && payload
    ? stringValue((payload as Record<string, unknown>).projectLabel)
    : undefined;
}

function bundleContact(payload: unknown): string | undefined {
  return typeof payload === "object" && payload
    ? stringValue((payload as Record<string, unknown>).contact)
    : undefined;
}

function highestPriority(a: string, b: string): string {
  return priorityRank(b) > priorityRank(a) ? b : a;
}

function priorityRank(value: string): number {
  if (value === "p0") return 4;
  if (value === "p1") return 3;
  if (value === "p2") return 2;
  if (value === "p3") return 1;
  return 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
