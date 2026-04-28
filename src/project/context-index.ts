import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

export type ProjectContextIndexFormat = "markdown" | "json";
export type ProjectContextFocus = "generic" | "interactive-input" | "runtime";

export interface ProjectContextIndexInput {
  targetDir?: string;
  projectName?: string;
  changedFiles?: string[];
  includeGit?: boolean;
}

export interface ProjectContextFileSummary {
  path: string;
  lines: number;
  imports: string[];
  symbols: string[];
  swiftUI: boolean;
  appIntent: boolean;
  hasInputControls: boolean;
  hasOverlay: boolean;
  hasDisabledState: boolean;
  hasGestureCapture: boolean;
  hasFocusState: boolean;
  hasModalPresentation: boolean;
  hasListOrScroll: boolean;
  riskScore: number;
  reasons: string[];
}

export interface ProjectContextIndex {
  schema: string;
  createdAt: string;
  targetDir: string;
  projectName: string;
  xcode: {
    workspace?: string;
    project?: string;
    schemes: string[];
    inferredScheme?: string;
  };
  files: {
    swift: number;
    swiftUI: number;
    appIntents: number;
    inputCapable: number;
    withInteractionRisk: number;
    catalog: ProjectContextFileSummary[];
  };
  git: {
    available: boolean;
    changedFiles: string[];
  };
  artifacts: {
    sessionPath?: string;
    latestRunReport?: string;
  };
  topInteractionRiskFiles: ProjectContextFileSummary[];
}

export interface WriteProjectContextIndexOptions extends ProjectContextIndexInput {
  dryRun?: boolean;
}

export interface WriteProjectContextIndexResult {
  index: ProjectContextIndex;
  jsonPath: string;
  markdownPath: string;
  written: string[];
}

export interface ProjectContextHint {
  path?: string;
  summary: string[];
  relatedFiles: ProjectContextFileSummary[];
  changedFiles: string[];
  currentFile?: ProjectContextFileSummary;
}

const EXCLUDED_DIRS = new Set([
  ".axint",
  ".build",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "DerivedData",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

export function buildProjectContextIndex(
  input: ProjectContextIndexInput = {}
): ProjectContextIndex {
  const targetDir = resolve(input.targetDir ?? process.cwd());
  const projectName = input.projectName ?? basename(targetDir) ?? "AppleApp";
  const workspace = findFirstChildWithExtension(targetDir, ".xcworkspace");
  const project = findFirstChildWithExtension(targetDir, ".xcodeproj");
  const schemes = uniqueStrings([
    ...listSchemes(workspace ? join(targetDir, workspace) : undefined),
    ...listSchemes(project ? join(targetDir, project) : undefined),
  ]);
  const catalog = walkFiles(targetDir)
    .filter((file) => extname(file).toLowerCase() === ".swift")
    .map((file) => summarizeSwiftFile(targetDir, file))
    .sort((a, b) => a.path.localeCompare(b.path));
  const changedFiles = resolveChangedFiles(
    targetDir,
    input.changedFiles,
    input.includeGit
  );
  const topInteractionRiskFiles = [...catalog]
    .filter((file) => file.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore || a.path.localeCompare(b.path))
    .slice(0, 12);

  return {
    schema: "https://axint.ai/schemas/project-context-index.v1.json",
    createdAt: new Date().toISOString(),
    targetDir,
    projectName,
    xcode: {
      workspace,
      project,
      schemes,
      inferredScheme:
        schemes[0] ??
        stripXcodeExtension(workspace) ??
        stripXcodeExtension(project) ??
        undefined,
    },
    files: {
      swift: catalog.length,
      swiftUI: catalog.filter((file) => file.swiftUI).length,
      appIntents: catalog.filter((file) => file.appIntent).length,
      inputCapable: catalog.filter((file) => file.hasInputControls).length,
      withInteractionRisk: catalog.filter((file) => file.riskScore > 0).length,
      catalog,
    },
    git: {
      available: existsSync(join(targetDir, ".git")) || isGitWorktree(targetDir),
      changedFiles,
    },
    artifacts: {
      sessionPath: existsSync(join(targetDir, ".axint/session/current.json"))
        ? ".axint/session/current.json"
        : undefined,
      latestRunReport: existsSync(join(targetDir, ".axint/run/latest.json"))
        ? ".axint/run/latest.json"
        : undefined,
    },
    topInteractionRiskFiles,
  };
}

export function writeProjectContextIndex(
  input: WriteProjectContextIndexOptions = {}
): WriteProjectContextIndexResult {
  const index = buildProjectContextIndex(input);
  const jsonPath = resolve(index.targetDir, ".axint/context/latest.json");
  const markdownPath = resolve(index.targetDir, ".axint/context/latest.md");
  const written: string[] = [];

  if (!input.dryRun) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
    writeFileSync(markdownPath, renderProjectContextIndex(index, "markdown"), "utf-8");
  }

  written.push(".axint/context/latest.json", ".axint/context/latest.md");
  return { index, jsonPath, markdownPath, written };
}

export function renderProjectContextIndex(
  index: ProjectContextIndex,
  format: ProjectContextIndexFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(index, null, 2);

  const lines = [
    "# Axint Project Context",
    "",
    `- Project: ${index.projectName}`,
    `- Root: ${index.targetDir}`,
    `- Created: ${index.createdAt}`,
    `- Swift files: ${index.files.swift}`,
    `- SwiftUI files: ${index.files.swiftUI}`,
    `- Input-capable files: ${index.files.inputCapable}`,
    `- Changed files: ${index.git.changedFiles.length}`,
    "",
    "## Xcode",
    `- Workspace: ${index.xcode.workspace ?? "not found"}`,
    `- Project: ${index.xcode.project ?? "not found"}`,
    `- Schemes: ${index.xcode.schemes.length > 0 ? index.xcode.schemes.join(", ") : "none detected"}`,
    `- Inferred scheme: ${index.xcode.inferredScheme ?? "not detected"}`,
  ];

  if (index.git.changedFiles.length > 0) {
    lines.push(
      "",
      "## Changed Files",
      ...index.git.changedFiles.map((file) => `- ${file}`)
    );
  }

  lines.push("", "## Interaction Risk Files");
  if (index.topInteractionRiskFiles.length === 0) {
    lines.push("- None detected.");
  } else {
    lines.push(
      ...index.topInteractionRiskFiles.map(
        (file) =>
          `- ${file.path}: score ${file.riskScore}${file.reasons.length > 0 ? ` — ${file.reasons.join(", ")}` : ""}`
      )
    );
  }

  lines.push("", "## File Catalog");
  if (index.files.catalog.length === 0) {
    lines.push("- No Swift files found.");
  } else {
    lines.push(
      ...index.files.catalog.map((file) => {
        const flags = [
          file.swiftUI ? "SwiftUI" : undefined,
          file.appIntent ? "AppIntent" : undefined,
          file.hasInputControls ? "inputs" : undefined,
          file.hasOverlay ? "overlay" : undefined,
          file.hasDisabledState ? "disabled" : undefined,
          file.hasGestureCapture ? "gesture" : undefined,
          file.hasFocusState ? "focus" : undefined,
          file.hasModalPresentation ? "modal" : undefined,
        ].filter(Boolean);
        return `- ${file.path}: ${file.lines} lines${flags.length > 0 ? ` — ${flags.join(", ")}` : ""}`;
      })
    );
  }

  return `${lines.join("\n")}\n`;
}

export function readProjectContextIndex(path: string): ProjectContextIndex | undefined {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) return undefined;
  try {
    return JSON.parse(readFileSync(fullPath, "utf-8")) as ProjectContextIndex;
  } catch {
    return undefined;
  }
}

export function discoverProjectContextPath(startPath: string): string | undefined {
  let current = resolve(startPath);

  while (true) {
    const candidate = join(current, ".axint/context/latest.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function buildProjectContextHint(input: {
  sourcePath?: string;
  fileName?: string;
  contextPath?: string;
  projectContext?: ProjectContextIndex;
  focus?: ProjectContextFocus;
}): ProjectContextHint | undefined {
  const contextPath =
    input.contextPath ??
    (input.sourcePath
      ? discoverProjectContextPath(dirname(resolve(input.sourcePath)))
      : undefined);
  const projectContext =
    input.projectContext ??
    (contextPath ? readProjectContextIndex(contextPath) : undefined);
  if (!projectContext) return undefined;

  const currentFile = matchCurrentFile(projectContext, input.sourcePath, input.fileName);
  const relatedFiles = rankRelatedFiles(projectContext, currentFile, input.focus);
  const summary = [
    `Project context loaded from ${contextPath ? relativeOrAbsolute(projectContext.targetDir, contextPath) : "inline context"}.`,
    `Indexed ${projectContext.files.swift} Swift files, ${projectContext.files.swiftUI} SwiftUI files, and ${projectContext.files.inputCapable} input-capable files.`,
  ];

  if (projectContext.git.changedFiles.length > 0) {
    summary.push(
      `Changed files: ${projectContext.git.changedFiles.slice(0, 6).join(", ")}${
        projectContext.git.changedFiles.length > 6
          ? `, +${projectContext.git.changedFiles.length - 6} more`
          : ""
      }.`
    );
  }

  if (relatedFiles.length > 0) {
    summary.push(
      `Check these related files next: ${relatedFiles
        .slice(0, 5)
        .map(
          (file) =>
            `${file.path}${file.reasons.length > 0 ? ` (${file.reasons.slice(0, 2).join(", ")})` : ""}`
        )
        .join(", ")}.`
    );
  }

  return {
    path: contextPath,
    summary,
    relatedFiles,
    changedFiles: projectContext.git.changedFiles,
    currentFile,
  };
}

function walkFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".axint" && entry.name !== ".git") {
      if (entry.name !== ".xcode.env") {
        if (entry.isDirectory()) continue;
      }
    }
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function summarizeSwiftFile(
  targetDir: string,
  fullPath: string
): ProjectContextFileSummary {
  const source = readFileSync(fullPath, "utf-8");
  const lines = source.split("\n");
  const imports = uniqueStrings(
    Array.from(source.matchAll(/^\s*import\s+([A-Za-z0-9_]+)/gm)).map((match) => match[1])
  );
  const symbols = uniqueStrings(
    Array.from(
      source.matchAll(
        /\b(?:struct|class|enum|actor|protocol)\s+([A-Za-z_][A-Za-z0-9_]*)/g
      )
    )
      .map((match) => match[1])
      .slice(0, 12)
  );
  const swiftUI =
    imports.includes("SwiftUI") ||
    /\b:\s*View\b/.test(source) ||
    /\bWindowGroup\s*\{/.test(source);
  const appIntent = imports.includes("AppIntents") || /\bAppIntent\b/.test(source);
  const hasInputControls = /\b(TextField|TextEditor|SecureField)\s*\(/.test(source);
  const hasOverlay = /\.overlay\s*(?:\(|\{)/.test(source);
  const hasDisabledState = /\.disabled\s*\(/.test(source);
  const hasGestureCapture =
    /\.highPriorityGesture\s*\(/.test(source) ||
    /\.gesture\s*\(/.test(source) ||
    /\.onTapGesture\b/.test(source);
  const hasFocusState = /\b@FocusState\b|\.focused\s*\(/.test(source);
  const hasModalPresentation =
    /\.sheet\s*\(/.test(source) ||
    /\.fullScreenCover\s*\(/.test(source) ||
    /\.confirmationDialog\s*\(/.test(source) ||
    /\.popover\s*\(/.test(source);
  const hasListOrScroll = /\b(List|ScrollView|LazyVStack|LazyHStack)\b/.test(source);

  let riskScore = 0;
  const reasons: string[] = [];

  if (hasInputControls) {
    riskScore += 3;
    reasons.push("input controls");
  }
  if (hasOverlay) {
    riskScore += 2;
    reasons.push("overlay");
  }
  if (hasDisabledState) {
    riskScore += 2;
    reasons.push("disabled state");
  }
  if (hasGestureCapture) {
    riskScore += 2;
    reasons.push("gesture capture");
  }
  if (hasFocusState) {
    riskScore += 2;
    reasons.push("focus state");
  }
  if (hasModalPresentation) {
    riskScore += 1;
    reasons.push("modal presentation");
  }
  if (hasListOrScroll) {
    riskScore += 1;
    reasons.push("list/scroll container");
  }
  if (/\b(home|feed|composer|comment|reply|post)\b/i.test(basename(fullPath))) {
    riskScore += 1;
    reasons.push("high-risk screen name");
  }

  return {
    path: relative(targetDir, fullPath),
    lines: lines.length,
    imports,
    symbols,
    swiftUI,
    appIntent,
    hasInputControls,
    hasOverlay,
    hasDisabledState,
    hasGestureCapture,
    hasFocusState,
    hasModalPresentation,
    hasListOrScroll,
    riskScore,
    reasons,
  };
}

function findFirstChildWithExtension(
  root: string,
  extension: string
): string | undefined {
  const entries = readdirSync(root, { withFileTypes: true });
  const match = entries.find(
    (entry) => entry.isDirectory() && extname(entry.name) === extension
  );
  return match?.name;
}

function listSchemes(containerPath?: string): string[] {
  if (!containerPath || !existsSync(containerPath)) return [];
  const schemeDir = join(containerPath, "xcshareddata", "xcschemes");
  if (!existsSync(schemeDir)) return [];
  return readdirSync(schemeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".xcscheme")
    .map((entry) => entry.name.replace(/\.xcscheme$/i, ""));
}

function stripXcodeExtension(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/\.(xcworkspace|xcodeproj)$/i, "");
}

function resolveChangedFiles(
  targetDir: string,
  changedFiles: string[] | undefined,
  includeGit: boolean | undefined
): string[] {
  if (Array.isArray(changedFiles) && changedFiles.length > 0) {
    return uniqueStrings(
      changedFiles.map((file) => normalizeRelativePath(targetDir, file))
    );
  }
  if (includeGit === false) return [];
  return readGitChangedFiles(targetDir);
}

function readGitChangedFiles(targetDir: string): string[] {
  try {
    const result = spawnSync("git", ["-C", targetDir, "status", "--porcelain=v1"], {
      encoding: "utf-8",
    });
    if (!result || result.status !== 0 || !result.stdout?.trim()) return [];

    return uniqueStrings(
      result.stdout
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .map((line) => line.slice(3).trim())
        .map((path) => {
          const rename = path.split(" -> ");
          return rename[rename.length - 1] ?? path;
        })
        .map((path) => normalizeRelativePath(targetDir, path))
    );
  } catch {
    return [];
  }
}

function isGitWorktree(targetDir: string): boolean {
  try {
    const result = spawnSync("git", ["-C", targetDir, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
    });
    return Boolean(result && result.status === 0);
  } catch {
    return false;
  }
}

function matchCurrentFile(
  projectContext: ProjectContextIndex,
  sourcePath?: string,
  fileName?: string
): ProjectContextFileSummary | undefined {
  const target = sourcePath
    ? normalizeRelativePath(projectContext.targetDir, sourcePath)
    : fileName
      ? normalizeRelativePath(projectContext.targetDir, fileName)
      : undefined;
  if (!target) return undefined;

  return (
    projectContext.files.catalog.find((file) => file.path === target) ??
    projectContext.files.catalog.find((file) => file.path.endsWith(`/${target}`)) ??
    projectContext.files.catalog.find((file) => basename(file.path) === basename(target))
  );
}

function rankRelatedFiles(
  projectContext: ProjectContextIndex,
  currentFile: ProjectContextFileSummary | undefined,
  focus: ProjectContextFocus = "generic"
): ProjectContextFileSummary[] {
  const catalog = projectContext.files.catalog.filter(
    (file) => file.path !== currentFile?.path
  );
  const currentDir = currentFile ? dirname(currentFile.path) : undefined;
  const changedSet = new Set(projectContext.git.changedFiles);

  return [...catalog]
    .map((file) => ({
      file,
      score: relatedFileScore(file, {
        currentDir,
        changed: changedSet.has(file.path),
        focus,
      }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .slice(0, 8)
    .map((entry) => entry.file);
}

function relatedFileScore(
  file: ProjectContextFileSummary,
  input: {
    currentDir?: string;
    changed: boolean;
    focus: ProjectContextFocus;
  }
): number {
  let score = file.riskScore;
  if (input.currentDir && dirname(file.path) === input.currentDir) score += 3;
  if (input.changed) score += 4;

  if (input.focus === "interactive-input") {
    if (file.hasInputControls) score += 5;
    if (file.hasOverlay) score += 4;
    if (file.hasDisabledState) score += 4;
    if (file.hasGestureCapture) score += 3;
    if (file.hasFocusState) score += 3;
    if (file.hasModalPresentation) score += 2;
  }

  if (input.focus === "runtime") {
    if (file.swiftUI) score += 2;
    if (file.hasModalPresentation) score += 2;
    if (file.hasListOrScroll) score += 1;
  }

  return score;
}

function normalizeRelativePath(root: string, value: string): string {
  const absolute = value.startsWith("/") ? value : resolve(root, value);
  return relative(root, absolute).replace(/\\/g, "/");
}

function relativeOrAbsolute(root: string, value: string): string {
  const rel = relative(root, value).replace(/\\/g, "/");
  return rel && !rel.startsWith("..") ? rel : value;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
