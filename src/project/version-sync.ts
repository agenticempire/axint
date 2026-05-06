import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type ProjectVersionSyncFormat = "markdown" | "json";
export type ProjectVersionSyncFileStatus =
  | "updated"
  | "unchanged"
  | "missing"
  | "skipped"
  | "error";

export interface ProjectVersionSyncChange {
  label: string;
  before?: string;
  after: string;
}

export interface ProjectVersionSyncFile {
  path: string;
  status: ProjectVersionSyncFileStatus;
  detail: string;
  changes: ProjectVersionSyncChange[];
}

export interface ProjectVersionSyncResult {
  targetDir: string;
  version: string;
  dryRun: boolean;
  files: ProjectVersionSyncFile[];
  updated: string[];
  unchanged: string[];
  missing: string[];
  skipped: string[];
  errors: string[];
}

export interface ProjectVersionSyncOptions {
  targetDir?: string;
  version: string;
  dryRun?: boolean;
}

const PROJECT_JSON_PATH = ".axint/project.json";
const AXINT_OWNED_MARKDOWN_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".axint/AXINT_MEMORY.md",
  ".axint/AXINT_REHYDRATE.md",
  ".axint/AXINT_DOCS_CONTEXT.md",
  ".axint/README.md",
];

export function syncProjectVersion(
  options: ProjectVersionSyncOptions
): ProjectVersionSyncResult {
  const targetDir = resolve(options.targetDir ?? process.cwd());
  const version = options.version.trim();
  const dryRun = Boolean(options.dryRun);
  const files: ProjectVersionSyncFile[] = [
    syncProjectJson({ targetDir, version, dryRun }),
    ...AXINT_OWNED_MARKDOWN_FILES.map((path) =>
      syncMarkdownFile({ targetDir, path, version, dryRun })
    ),
  ];

  return {
    targetDir,
    version,
    dryRun,
    files,
    updated: files.filter((file) => file.status === "updated").map((file) => file.path),
    unchanged: files
      .filter((file) => file.status === "unchanged")
      .map((file) => file.path),
    missing: files.filter((file) => file.status === "missing").map((file) => file.path),
    skipped: files.filter((file) => file.status === "skipped").map((file) => file.path),
    errors: files.filter((file) => file.status === "error").map((file) => file.path),
  };
}

export function renderProjectVersionSync(
  result: ProjectVersionSyncResult,
  format: ProjectVersionSyncFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(result, null, 2);

  const lines = [
    "# Axint Project Version Sync",
    "",
    `- Target: ${result.targetDir}`,
    `- Version: ${result.version}`,
    `- Dry run: ${result.dryRun ? "yes" : "no"}`,
    `- Updated: ${result.updated.length}`,
    `- Unchanged: ${result.unchanged.length}`,
    `- Missing: ${result.missing.length}`,
    `- Skipped: ${result.skipped.length}`,
    `- Errors: ${result.errors.length}`,
    "",
    "## Files",
  ];

  for (const file of result.files) {
    const changes = file.changes
      .map((change) =>
        change.before
          ? `${change.label}: ${change.before} -> ${change.after}`
          : `${change.label}: ${change.after}`
      )
      .join("; ");
    lines.push(
      `- ${file.status.toUpperCase()} ${file.path}: ${file.detail}${
        changes ? ` (${changes})` : ""
      }`
    );
  }

  if (result.updated.length > 0 && !result.dryRun) {
    lines.push(
      "",
      "Next: call `axint.status`, then `axint.workflow.check` so the active agent proves it is using the refreshed project truth."
    );
  }

  return lines.join("\n");
}

function syncProjectJson(input: {
  targetDir: string;
  version: string;
  dryRun: boolean;
}): ProjectVersionSyncFile {
  const fullPath = resolve(input.targetDir, PROJECT_JSON_PATH);
  if (!existsSync(fullPath)) {
    return fileResult(PROJECT_JSON_PATH, "missing", "file does not exist");
  }

  try {
    const text = readFileSync(fullPath, "utf-8");
    const data = JSON.parse(text) as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return fileResult(PROJECT_JSON_PATH, "error", "expected a JSON object");
    }

    const changes: ProjectVersionSyncChange[] = [];
    setVersionField(data, "axintVersion", input.version, changes);
    if (Object.prototype.hasOwnProperty.call(data, "expectedVersion")) {
      setVersionField(data, "expectedVersion", input.version, changes);
    }

    if (changes.length === 0) {
      return fileResult(PROJECT_JSON_PATH, "unchanged", "already on target version");
    }

    if (!input.dryRun) {
      writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    }

    return fileResult(
      PROJECT_JSON_PATH,
      "updated",
      input.dryRun
        ? "would update machine-readable project version"
        : "updated machine-readable project version",
      changes
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fileResult(PROJECT_JSON_PATH, "error", message);
  }
}

function setVersionField(
  data: Record<string, unknown>,
  field: string,
  version: string,
  changes: ProjectVersionSyncChange[]
): void {
  const before = typeof data[field] === "string" ? data[field] : undefined;
  if (before === version) return;
  data[field] = version;
  changes.push({ label: field, before, after: version });
}

function syncMarkdownFile(input: {
  targetDir: string;
  path: string;
  version: string;
  dryRun: boolean;
}): ProjectVersionSyncFile {
  const fullPath = resolve(input.targetDir, input.path);
  if (!existsSync(fullPath)) {
    return fileResult(input.path, "missing", "file does not exist");
  }

  try {
    const before = readFileSync(fullPath, "utf-8");
    const changes: ProjectVersionSyncChange[] = [];
    const hasOwnedMarker =
      /^(?:\s*(?:[-*]\s*)?Expected Axint version:\s*.+?)\s*$/m.test(before) ||
      /^.*Expected Axint package version from this project pack:\s*.+?\.\s*$/m.test(
        before
      );
    let after = replaceVersionLine(
      before,
      /^(?<prefix>\s*(?:[-*]\s*)?Expected Axint version:\s*)(?<value>.+?)\s*$/gm,
      "Expected Axint version",
      input.version,
      changes
    );
    after = replaceVersionLine(
      after,
      /^(?<prefix>.*Expected Axint package version from this project pack:\s*)(?<value>.+?)(?<suffix>\.)\s*$/gm,
      "Expected Axint package version from this project pack",
      input.version,
      changes
    );

    if (changes.length === 0) {
      return fileResult(
        input.path,
        hasOwnedMarker ? "unchanged" : "skipped",
        hasOwnedMarker
          ? "already on target version"
          : "no Axint-owned version marker found"
      );
    }

    if (after === before) {
      return fileResult(input.path, "unchanged", "already on target version");
    }

    if (!input.dryRun) {
      writeFileSync(fullPath, after, "utf-8");
    }

    return fileResult(
      input.path,
      "updated",
      input.dryRun
        ? "would update Axint-owned version markers"
        : "updated Axint-owned version markers",
      changes
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fileResult(input.path, "error", message);
  }
}

function replaceVersionLine(
  text: string,
  pattern: RegExp,
  label: string,
  version: string,
  changes: ProjectVersionSyncChange[]
): string {
  return text.replace(pattern, (match: string, ...args: unknown[]) => {
    const groups = args[args.length - 1] as
      | { prefix?: string; value?: string; suffix?: string }
      | undefined;
    if (!groups?.prefix || !groups.value) return match;
    const before = groups.value.trim();
    if (before === version) return match;
    changes.push({ label, before, after: version });
    return `${groups.prefix}${version}${groups.suffix ?? ""}`;
  });
}

function fileResult(
  path: string,
  status: ProjectVersionSyncFileStatus,
  detail: string,
  changes: ProjectVersionSyncChange[] = []
): ProjectVersionSyncFile {
  return { path, status, detail, changes };
}
