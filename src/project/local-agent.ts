import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  buildAgentToolProfile,
  normalizeAxintAgent,
  type AxintAgentProfileName,
  type AxintAgentToolProfile,
} from "./agent-profile.js";
import {
  readProjectContextIndex,
  writeProjectContextIndex,
  type ProjectContextIndex,
} from "./context-index.js";
import { writeProjectMemoryIndex } from "./memory-index.js";

export type AxintLocalAgentFormat = "markdown" | "json" | "prompt";
export type AxintLocalAgentPrivacyMode =
  | "local_only"
  | "redacted_cloud"
  | "source_opt_in";
export type AxintLocalAgentProviderMode = "none" | "bring_your_own_key" | "axint_cloud";
export type AxintLocalAgentEventKind =
  | "installed"
  | "advice"
  | "claim_created"
  | "claim_released";

export interface AxintLocalAgentConfig {
  schema: "https://axint.ai/schemas/local-agent.v1.json";
  createdAt: string;
  updatedAt: string;
  projectName: string;
  targetDir: string;
  privacy: {
    mode: AxintLocalAgentPrivacyMode;
    sourceSharing: "never_by_default";
    cloudLearning: "redacted_fingerprints_only";
    userCanInspectBeforeSend: true;
  };
  provider: {
    mode: AxintLocalAgentProviderMode;
    note: string;
  };
  permissions: {
    allow: string[];
    deny: string[];
  };
  lanes: Record<AxintAgentProfileName, AxintAgentToolProfile>;
  commands: {
    advice: string;
    claim: string;
    projectIndex: string;
    proofRun: string;
  };
}

export interface AxintAgentClaim {
  id: string;
  agent: AxintAgentProfileName;
  task: string;
  files: string[];
  createdAt: string;
  expiresAt: string;
  releasedAt?: string;
}

export interface AxintAgentClaimsFile {
  schema: "https://axint.ai/schemas/local-agent-claims.v1.json";
  updatedAt: string;
  claims: AxintAgentClaim[];
}

export interface AxintAgentLedgerEvent {
  id: string;
  kind: AxintLocalAgentEventKind;
  agent: AxintAgentProfileName;
  createdAt: string;
  summary: string;
  files?: string[];
  task?: string;
  artifact?: string;
}

export interface AxintAgentLedger {
  schema: "https://axint.ai/schemas/local-agent-ledger.v1.json";
  updatedAt: string;
  events: AxintAgentLedgerEvent[];
}

export interface AxintAgentInstallInput {
  cwd?: string;
  projectName?: string;
  agent?: AxintAgentProfileName;
  privacyMode?: AxintLocalAgentPrivacyMode;
  providerMode?: AxintLocalAgentProviderMode;
  force?: boolean;
  format?: AxintLocalAgentFormat;
}

export interface AxintAgentAdviceInput {
  cwd?: string;
  issue?: string;
  agent?: AxintAgentProfileName;
  changedFiles?: string[];
  format?: AxintLocalAgentFormat;
  claimTtlMinutes?: number;
}

export interface AxintAgentClaimInput {
  cwd?: string;
  agent?: AxintAgentProfileName;
  task?: string;
  files: string[];
  ttlMinutes?: number;
  format?: AxintLocalAgentFormat;
}

export interface AxintAgentReleaseInput {
  cwd?: string;
  agent?: AxintAgentProfileName;
  files?: string[];
  all?: boolean;
  format?: AxintLocalAgentFormat;
}

export interface AxintAgentInstallReport {
  status: "installed" | "already_installed";
  cwd: string;
  projectName: string;
  agent: AxintAgentProfileName;
  configPath: string;
  contextPath: string;
  claimsPath: string;
  ledgerPath: string;
  written: string[];
  nextCommands: string[];
  config: AxintLocalAgentConfig;
}

export interface AxintAgentAdviceMove {
  title: string;
  priority: "p0" | "p1" | "p2" | "p3";
  detail: string;
  command?: string;
}

export interface AxintAgentAdviceReport {
  status: "ready" | "needs_setup" | "blocked";
  cwd: string;
  agent: AxintAgentProfileName;
  profile: AxintAgentToolProfile;
  projectName: string;
  summary: string[];
  warnings: string[];
  activeClaims: AxintAgentClaim[];
  conflictingClaims: AxintAgentClaim[];
  latestProof?: LatestProofSummary;
  latestRepair?: LatestRepairSummary;
  moves: AxintAgentAdviceMove[];
  artifacts: {
    config?: string;
    context?: string;
    memory?: string;
    claims?: string;
    ledger?: string;
    latestRun?: string;
    latestRepair?: string;
  };
}

export interface AxintAgentClaimReport {
  status: "claimed" | "blocked";
  cwd: string;
  agent: AxintAgentProfileName;
  task: string;
  files: string[];
  claim?: AxintAgentClaim;
  conflicts: AxintAgentClaim[];
  claimsPath: string;
}

export interface AxintAgentReleaseReport {
  status: "released" | "none";
  cwd: string;
  agent: AxintAgentProfileName;
  released: AxintAgentClaim[];
  claimsPath: string;
}

interface LatestProofSummary {
  path: string;
  status: string;
  gate?: string;
  runId?: string;
  updatedAt?: string;
  failingStep?: string;
  nextSteps: string[];
}

interface LatestRepairSummary {
  path: string;
  status: string;
  issueClass?: string;
  priority?: string;
  filesToInspect: string[];
  commands: string[];
}

const AGENT_NAMES: AxintAgentProfileName[] = [
  "all",
  "claude",
  "codex",
  "cowork",
  "cursor",
  "xcode",
];

const DEFAULT_ALLOW = [
  "read_project",
  "write_project_files",
  "run_validation",
  "run_build",
  "run_tests",
];
const DEFAULT_DENY = [
  "publish_packages",
  "spend_money",
  "read_secrets",
  "post_social",
  "deploy_live",
  "destructive_git",
];

export function installAxintLocalAgent(
  input: AxintAgentInstallInput = {}
): AxintAgentInstallReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const now = new Date().toISOString();
  const configPath = agentConfigPath(cwd);
  const force = input.force ?? false;
  const existing = readAgentConfig(cwd);

  if (existing && !force) {
    return {
      status: "already_installed",
      cwd,
      projectName: existing.projectName,
      agent: normalizeAxintAgent(input.agent),
      configPath,
      contextPath: projectContextPath(cwd),
      claimsPath: claimsPath(cwd),
      ledgerPath: ledgerPath(cwd),
      written: [],
      nextCommands: nextAgentCommands(cwd, normalizeAxintAgent(input.agent)),
      config: existing,
    };
  }

  const context = writeProjectContextIndex({
    targetDir: cwd,
    projectName: input.projectName,
  }).index;
  const memory = writeProjectMemoryIndex({
    cwd,
    projectName: input.projectName ?? context.projectName,
  });
  const config = buildLocalAgentConfig({
    cwd,
    projectName: input.projectName ?? context.projectName,
    now,
    privacyMode: input.privacyMode ?? "local_only",
    providerMode: input.providerMode ?? "none",
  });
  writeJson(configPath, config);
  ensureClaimsFile(cwd);
  appendLedgerEvent(cwd, {
    kind: "installed",
    agent: normalizeAxintAgent(input.agent),
    summary:
      "Axint local multi-agent brain installed. Project context, claims, and ledger are ready.",
  });

  return {
    status: "installed",
    cwd,
    projectName: config.projectName,
    agent: normalizeAxintAgent(input.agent),
    configPath,
    contextPath: projectContextPath(cwd),
    claimsPath: claimsPath(cwd),
    ledgerPath: ledgerPath(cwd),
    written: [
      relativeOrAbsolute(cwd, configPath),
      ".axint/context/latest.json",
      ".axint/context/latest.md",
      ...memory.written,
      ".axint/coordination/claims.json",
      ".axint/coordination/ledger.json",
    ],
    nextCommands: nextAgentCommands(cwd, normalizeAxintAgent(input.agent)),
    config,
  };
}

export function buildAxintAgentAdvice(
  input: AxintAgentAdviceInput = {}
): AxintAgentAdviceReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const agent = normalizeAxintAgent(input.agent);
  const profile = buildAgentToolProfile(agent);
  const config = readAgentConfig(cwd);
  const context = loadOrCreateContext(cwd, config?.projectName, input.changedFiles);
  const memory = writeProjectMemoryIndex({
    cwd,
    projectName: config?.projectName ?? context.projectName,
    changedFiles: input.changedFiles,
  }).index;
  const claimsFile = ensureClaimsFile(cwd);
  const activeClaims = activeAgentClaims(claimsFile, input.claimTtlMinutes);
  const changedFiles = normalizeFiles(cwd, input.changedFiles ?? []);
  const conflictingClaims = findConflictingClaims({
    claims: activeClaims,
    agent,
    files: changedFiles,
  });
  const latestProof = readLatestProof(cwd);
  const latestRepair = readLatestRepair(cwd);
  const warnings = buildAdviceWarnings({
    config,
    conflictingClaims,
    latestProof,
    latestRepair,
    changedFiles,
    agent,
  });
  const moves = buildAdviceMoves({
    cwd,
    issue: input.issue,
    agent,
    profile,
    context,
    config,
    changedFiles,
    conflictingClaims,
    latestProof,
    latestRepair,
  });
  const status =
    conflictingClaims.length > 0 ? "blocked" : config ? "ready" : "needs_setup";

  appendLedgerEvent(cwd, {
    kind: "advice",
    agent,
    summary: input.issue
      ? `Advice requested for: ${input.issue}`
      : "General Axint agent advice requested.",
    files: changedFiles,
  });

  return {
    status,
    cwd,
    agent,
    profile,
    projectName: context.projectName,
    summary: [
      `${context.projectName}: ${context.files.swift} Swift files, ${context.files.swiftUI} SwiftUI files, ${context.files.inputCapable} input-capable files.`,
      `Agent lane: ${profile.label} (${profile.editingMode}).`,
      latestProof
        ? `Latest proof: ${latestProof.status}${latestProof.gate ? ` · ${latestProof.gate}` : ""}.`
        : "No Axint run proof found yet.",
      activeClaims.length > 0
        ? `${activeClaims.length} active file/task claim${activeClaims.length === 1 ? "" : "s"} in the project.`
        : "No active file/task claims.",
      memory.learningPackets.length > 0
        ? `${memory.learningPackets.length} privacy-safe learning packet${memory.learningPackets.length === 1 ? "" : "s"} available for Axint to learn from.`
        : "No local learning packets yet.",
    ],
    warnings,
    activeClaims,
    conflictingClaims,
    latestProof,
    latestRepair,
    moves,
    artifacts: {
      config: existsSync(agentConfigPath(cwd)) ? agentConfigPath(cwd) : undefined,
      context: projectContextPath(cwd),
      memory: resolve(cwd, ".axint/memory/latest.json"),
      claims: claimsPath(cwd),
      ledger: ledgerPath(cwd),
      latestRun: latestProof?.path,
      latestRepair: latestRepair?.path,
    },
  };
}

export function claimAxintAgentFiles(input: AxintAgentClaimInput): AxintAgentClaimReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const agent = normalizeAxintAgent(input.agent);
  const files = normalizeFiles(cwd, input.files);
  if (files.length === 0) {
    throw new Error("axint agent claim requires at least one file.");
  }
  const claimsFile = ensureClaimsFile(cwd);
  const activeClaims = activeAgentClaims(claimsFile);
  const conflicts = findConflictingClaims({ claims: activeClaims, agent, files });
  const task = input.task?.trim() || "Unspecified Axint agent task";

  if (conflicts.length > 0) {
    return {
      status: "blocked",
      cwd,
      agent,
      task,
      files,
      conflicts,
      claimsPath: claimsPath(cwd),
    };
  }

  const now = new Date();
  const claim: AxintAgentClaim = {
    id: `axclaim_${hashString(`${agent}:${task}:${files.join("|")}:${now.toISOString()}`)}`,
    agent,
    task,
    files,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + minutes(input.ttlMinutes ?? 30)).toISOString(),
  };
  const nextClaims: AxintAgentClaimsFile = {
    schema: "https://axint.ai/schemas/local-agent-claims.v1.json",
    updatedAt: now.toISOString(),
    claims: [...claimsFile.claims, claim],
  };
  writeJson(claimsPath(cwd), nextClaims);
  appendLedgerEvent(cwd, {
    kind: "claim_created",
    agent,
    summary: `${agent} claimed ${files.join(", ")} for ${task}.`,
    files,
    task,
  });

  return {
    status: "claimed",
    cwd,
    agent,
    task,
    files,
    claim,
    conflicts: [],
    claimsPath: claimsPath(cwd),
  };
}

export function releaseAxintAgentClaims(
  input: AxintAgentReleaseInput = {}
): AxintAgentReleaseReport {
  const cwd = resolve(input.cwd ?? process.cwd());
  const agent = normalizeAxintAgent(input.agent);
  const files = normalizeFiles(cwd, input.files ?? []);
  const claimsFile = ensureClaimsFile(cwd);
  const now = new Date().toISOString();
  const released: AxintAgentClaim[] = [];
  const claims = claimsFile.claims.map((claim) => {
    const sameAgent = claim.agent === agent || agent === "all";
    const fileMatch =
      input.all || files.length === 0 || files.some((file) => claim.files.includes(file));
    if (!claim.releasedAt && sameAgent && fileMatch) {
      const releasedClaim = { ...claim, releasedAt: now };
      released.push(releasedClaim);
      return releasedClaim;
    }
    return claim;
  });
  writeJson(claimsPath(cwd), {
    schema: "https://axint.ai/schemas/local-agent-claims.v1.json",
    updatedAt: now,
    claims,
  } satisfies AxintAgentClaimsFile);

  if (released.length > 0) {
    appendLedgerEvent(cwd, {
      kind: "claim_released",
      agent,
      summary: `${agent} released ${released.length} Axint claim${released.length === 1 ? "" : "s"}.`,
      files: uniqueStrings(released.flatMap((claim) => claim.files)),
    });
  }

  return {
    status: released.length > 0 ? "released" : "none",
    cwd,
    agent,
    released,
    claimsPath: claimsPath(cwd),
  };
}

export function renderAxintAgentInstallReport(
  report: AxintAgentInstallReport,
  format: AxintLocalAgentFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "prompt") {
    return [
      `Axint local brain is ${report.status} for ${report.projectName}.`,
      `Use: axint agent advice --dir ${quote(report.cwd)} --agent ${report.agent}`,
      "Before editing, claim risky files with axint agent claim.",
    ].join("\n");
  }

  return [
    `# Axint Local Agent: ${report.status}`,
    "",
    `- Project: ${report.projectName}`,
    `- Agent lane: ${report.agent}`,
    `- Config: ${report.configPath}`,
    `- Context: ${report.contextPath}`,
    `- Claims: ${report.claimsPath}`,
    `- Ledger: ${report.ledgerPath}`,
    `- Privacy: ${report.config.privacy.mode}; source sharing is ${report.config.privacy.sourceSharing}`,
    "",
    "## Written",
    ...(report.written.length > 0
      ? report.written.map((item) => `- ${item}`)
      : ["- Existing install reused."]),
    "",
    "## Next Commands",
    ...report.nextCommands.map((command) => `- \`${command}\``),
    "",
  ].join("\n");
}

export function renderAxintAgentAdviceReport(
  report: AxintAgentAdviceReport,
  format: AxintLocalAgentFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "prompt") {
    return [
      `Axint agent advice for ${report.profile.label}: ${report.status}.`,
      ...report.warnings.map((warning) => `Warning: ${warning}`),
      "Next moves:",
      ...report.moves.map((move, index) => {
        const command = move.command ? ` Command: ${move.command}` : "";
        return `${index + 1}. ${move.title}: ${move.detail}${command}`;
      }),
    ].join("\n");
  }

  return [
    `# Axint Agent Advice: ${report.status}`,
    "",
    `- Project: ${report.projectName}`,
    `- Agent: ${report.profile.label}`,
    `- Editing lane: ${report.profile.editingMode}`,
    "",
    "## Summary",
    ...report.summary.map((item) => `- ${item}`),
    "",
    "## Warnings",
    ...(report.warnings.length > 0
      ? report.warnings.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Next Moves",
    ...report.moves.map(
      (move) =>
        `- ${move.priority.toUpperCase()} ${move.title}: ${move.detail}${move.command ? ` Command: \`${move.command}\`` : ""}`
    ),
    "",
    "## Active Claims",
    ...(report.activeClaims.length > 0
      ? report.activeClaims.map(
          (claim) =>
            `- ${claim.agent}: ${claim.files.join(", ")} — ${claim.task} (expires ${claim.expiresAt})`
        )
      : ["- None."]),
    "",
  ].join("\n");
}

export function renderAxintAgentClaimReport(
  report: AxintAgentClaimReport,
  format: AxintLocalAgentFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "prompt") {
    if (report.status === "blocked") {
      return `Axint claim blocked for ${report.files.join(", ")}. Another active agent claim exists.`;
    }
    return `Axint claim created for ${report.files.join(", ")}. Release it when done with axint agent release.`;
  }

  return [
    `# Axint Agent Claim: ${report.status}`,
    "",
    `- Agent: ${report.agent}`,
    `- Task: ${report.task}`,
    `- Files: ${report.files.join(", ")}`,
    `- Claims file: ${report.claimsPath}`,
    "",
    ...(report.conflicts.length > 0
      ? [
          "## Conflicts",
          ...report.conflicts.map(
            (claim) =>
              `- ${claim.agent}: ${claim.files.join(", ")} — ${claim.task} (expires ${claim.expiresAt})`
          ),
        ]
      : report.claim
        ? ["## Claim", `- ID: ${report.claim.id}`, `- Expires: ${report.claim.expiresAt}`]
        : []),
    "",
  ].join("\n");
}

export function renderAxintAgentReleaseReport(
  report: AxintAgentReleaseReport,
  format: AxintLocalAgentFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "prompt") {
    return report.status === "released"
      ? `Released ${report.released.length} Axint claim${report.released.length === 1 ? "" : "s"}.`
      : "No matching Axint claims were active.";
  }

  return [
    `# Axint Agent Release: ${report.status}`,
    "",
    `- Agent: ${report.agent}`,
    `- Claims file: ${report.claimsPath}`,
    "",
    ...(report.released.length > 0
      ? report.released.map(
          (claim) => `- ${claim.id}: ${claim.files.join(", ")} — ${claim.task}`
        )
      : ["- No matching active claims."]),
    "",
  ].join("\n");
}

function buildLocalAgentConfig(input: {
  cwd: string;
  projectName: string;
  now: string;
  privacyMode: AxintLocalAgentPrivacyMode;
  providerMode: AxintLocalAgentProviderMode;
}): AxintLocalAgentConfig {
  const lanes = Object.fromEntries(
    AGENT_NAMES.map((agent) => [agent, buildAgentToolProfile(agent)])
  ) as Record<AxintAgentProfileName, AxintAgentToolProfile>;

  return {
    schema: "https://axint.ai/schemas/local-agent.v1.json",
    createdAt: input.now,
    updatedAt: input.now,
    projectName: input.projectName,
    targetDir: input.cwd,
    privacy: {
      mode: input.privacyMode,
      sourceSharing: "never_by_default",
      cloudLearning: "redacted_fingerprints_only",
      userCanInspectBeforeSend: true,
    },
    provider: {
      mode: input.providerMode,
      note:
        input.providerMode === "none"
          ? "No model provider is configured. Axint uses local project state, diagnostics, and proof artifacts for advice."
          : "Provider configuration is project-local and should never be committed with secrets.",
    },
    permissions: {
      allow: DEFAULT_ALLOW,
      deny: DEFAULT_DENY,
    },
    lanes,
    commands: {
      advice: "axint agent advice --agent <agent>",
      claim: "axint agent claim <files...> --agent <agent> --task <task>",
      projectIndex: "axint project index",
      proofRun: "axint run --changed <files> --only-testing <focused-selector>",
    },
  };
}

function buildAdviceWarnings(input: {
  config?: AxintLocalAgentConfig;
  conflictingClaims: AxintAgentClaim[];
  latestProof?: LatestProofSummary;
  latestRepair?: LatestRepairSummary;
  changedFiles: string[];
  agent: AxintAgentProfileName;
}): string[] {
  const warnings: string[] = [];
  if (!input.config) {
    warnings.push(
      "Axint local brain is not installed yet. Run `axint agent install` so all tools share one project brain."
    );
  }
  for (const claim of input.conflictingClaims) {
    warnings.push(
      `${claim.agent} already claimed ${claim.files.join(", ")} for ${claim.task}. Do not edit those files until the claim is released or expires.`
    );
  }
  if (input.latestProof?.status === "fail") {
    warnings.push(
      `Freshest Axint run failed${input.latestProof.gate ? ` at ${input.latestProof.gate}` : ""}. Repair that proof before broad new work.`
    );
  }
  if (input.latestProof?.status === "running") {
    warnings.push(
      "An Axint run is still active. Poll `axint run status` before trusting older proof."
    );
  }
  if (input.agent === "xcode" && input.changedFiles.length > 0) {
    warnings.push(
      "Xcode lane should write guard proof before and after broad Swift edits."
    );
  }
  if (input.latestRepair?.status === "fix_required") {
    warnings.push(
      `Latest repair plan is still fix_required for ${input.latestRepair.issueClass ?? "an Apple repair"}.`
    );
  }
  return uniqueStrings(warnings);
}

function buildAdviceMoves(input: {
  cwd: string;
  issue?: string;
  agent: AxintAgentProfileName;
  profile: AxintAgentToolProfile;
  context: ProjectContextIndex;
  config?: AxintLocalAgentConfig;
  changedFiles: string[];
  conflictingClaims: AxintAgentClaim[];
  latestProof?: LatestProofSummary;
  latestRepair?: LatestRepairSummary;
}): AxintAgentAdviceMove[] {
  const moves: AxintAgentAdviceMove[] = [];
  const dir = quote(input.cwd);
  const changed =
    input.changedFiles.length > 0 ? input.changedFiles.map(quote).join(" ") : "<files>";

  if (!input.config) {
    moves.push({
      title: "Install the shared Axint project brain",
      priority: "p0",
      detail:
        "This writes .axint/agent.json, project context, and coordination files so every agent uses the same local truth.",
      command: `axint agent install --dir ${dir} --agent ${input.agent}`,
    });
  }

  if (input.conflictingClaims.length > 0) {
    moves.push({
      title: "Resolve active file claim before editing",
      priority: "p0",
      detail:
        "Another agent has an active claim on one or more changed files. Read the claim or coordinate before patching.",
      command: `axint agent advice --dir ${dir} --agent ${input.agent} --format json`,
    });
    return moves;
  }

  if (input.changedFiles.length > 0) {
    moves.push({
      title: "Claim changed files before patching",
      priority: "p0",
      detail:
        "Create a short-lived claim so Claude/Codex/Cursor/Xcode do not edit the same files at the same time.",
      command: `axint agent claim --dir ${dir} --agent ${input.agent} --task ${quote(input.issue ?? "Apple repair pass")} ${changed}`,
    });
  }

  if (input.latestProof?.status === "running") {
    moves.push({
      title: "Poll active Axint proof",
      priority: "p0",
      detail:
        "A proof run is active. Do not trust stale status until the run resolves or is cancelled.",
      command: `axint run status --dir ${dir}`,
    });
  } else if (input.latestProof?.status === "fail") {
    moves.push({
      title: "Repair the failed proof first",
      priority: "p0",
      detail:
        input.latestProof.failingStep ??
        "The freshest proof failed. Use the latest run and repair report as the next source of truth.",
      command: input.issue
        ? `axint repair ${quote(input.issue)} --dir ${dir} --agent ${input.agent}`
        : `axint repair ${quote("Repair the latest failed Axint proof")} --dir ${dir} --agent ${input.agent}`,
    });
  }

  if (input.issue) {
    moves.push({
      title: "Run project-aware repair advice",
      priority: "p1",
      detail:
        "Convert the issue into likely files, root causes, proof requirements, and host-safe patch instructions.",
      command: `axint repair ${quote(input.issue)} --dir ${dir} --agent ${input.agent}${
        input.changedFiles.length > 0 ? ` --changed ${changed}` : ""
      }`,
    });
  }

  moves.push({
    title: "Refresh project context",
    priority: "p1",
    detail:
      "Keep the local project map current before asking any agent to inspect or patch Apple-native files.",
    command: `axint project index --dir ${dir}${
      input.changedFiles.length > 0 ? ` --changed ${changed}` : ""
    }`,
  });

  moves.push({
    title: "Use the correct host lane",
    priority: "p1",
    detail: `${input.profile.label}: ${input.profile.defaultWriteAction}. ${input.profile.proofAction}`,
  });

  const scheme = input.context.xcode.inferredScheme
    ? ` --scheme ${quote(input.context.xcode.inferredScheme)}`
    : "";
  const container = input.context.xcode.workspace
    ? ` --workspace ${quote(input.context.xcode.workspace)}`
    : input.context.xcode.project
      ? ` --project ${quote(input.context.xcode.project)}`
      : "";
  moves.push({
    title: "Run the smallest proof loop",
    priority: "p2",
    detail:
      "After patching, use focused proof before claiming done. Static validation alone is not runtime/UI proof.",
    command: `axint run --dir ${dir}${container}${scheme}${
      input.changedFiles.length > 0 ? ` --changed ${changed}` : " --changed <files>"
    } --only-testing <focused-selector>`,
  });

  return moves.slice(0, 8);
}

function loadOrCreateContext(
  cwd: string,
  projectName: string | undefined,
  changedFiles: string[] | undefined
): ProjectContextIndex {
  const path = projectContextPath(cwd);
  const context = existsSync(path) ? readProjectContextIndex(path) : undefined;
  if (context && (!changedFiles || changedFiles.length === 0)) return context;
  return writeProjectContextIndex({
    targetDir: cwd,
    projectName,
    changedFiles,
  }).index;
}

function readAgentConfig(cwd: string): AxintLocalAgentConfig | undefined {
  const path = agentConfigPath(cwd);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AxintLocalAgentConfig;
  } catch {
    return undefined;
  }
}

function ensureClaimsFile(cwd: string): AxintAgentClaimsFile {
  const path = claimsPath(cwd);
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as AxintAgentClaimsFile;
    } catch {
      // fall through and rewrite a valid coordination file
    }
  }
  const file: AxintAgentClaimsFile = {
    schema: "https://axint.ai/schemas/local-agent-claims.v1.json",
    updatedAt: new Date().toISOString(),
    claims: [],
  };
  writeJson(path, file);
  return file;
}

function appendLedgerEvent(
  cwd: string,
  event: Omit<AxintAgentLedgerEvent, "id" | "createdAt">
): void {
  const path = ledgerPath(cwd);
  const existing = readLedger(cwd);
  const createdAt = new Date().toISOString();
  const next: AxintAgentLedger = {
    schema: "https://axint.ai/schemas/local-agent-ledger.v1.json",
    updatedAt: createdAt,
    events: [
      ...existing.events.slice(-199),
      {
        id: `axevent_${hashString(`${event.kind}:${event.agent}:${createdAt}:${randomUUID()}`)}`,
        createdAt,
        ...event,
      },
    ],
  };
  writeJson(path, next);
}

function readLedger(cwd: string): AxintAgentLedger {
  const path = ledgerPath(cwd);
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as AxintAgentLedger;
    } catch {
      // fall through and rewrite a valid ledger
    }
  }
  return {
    schema: "https://axint.ai/schemas/local-agent-ledger.v1.json",
    updatedAt: new Date().toISOString(),
    events: [],
  };
}

function activeAgentClaims(
  file: AxintAgentClaimsFile,
  ttlMinutes: number | undefined = undefined
): AxintAgentClaim[] {
  const now = Date.now();
  const ttlMs = ttlMinutes ? minutes(ttlMinutes) : undefined;
  return file.claims.filter((claim) => {
    if (claim.releasedAt) return false;
    if (new Date(claim.expiresAt).getTime() <= now) return false;
    if (!ttlMs) return true;
    return now - new Date(claim.createdAt).getTime() <= ttlMs;
  });
}

function findConflictingClaims(input: {
  claims: AxintAgentClaim[];
  agent: AxintAgentProfileName;
  files: string[];
}): AxintAgentClaim[] {
  if (input.files.length === 0) return [];
  return input.claims.filter(
    (claim) =>
      claim.agent !== input.agent &&
      claim.agent !== "all" &&
      input.files.some((file) => claim.files.includes(file))
  );
}

function readLatestProof(cwd: string): LatestProofSummary | undefined {
  const path = join(cwd, ".axint/run/latest.json");
  const payload = readJsonRecord(path);
  if (!payload) return undefined;
  const nextSteps = stringArray(payload.nextSteps);
  return {
    path,
    status: stringValue(payload.status, "unknown"),
    gate: recordValue(payload.gate)
      ? stringValue(recordValue(payload.gate)?.decision, undefined)
      : undefined,
    runId: stringValue(payload.id, undefined),
    updatedAt: stringValue(payload.createdAt, undefined),
    failingStep: inferFailingStep(payload),
    nextSteps,
  };
}

function readLatestRepair(cwd: string): LatestRepairSummary | undefined {
  const path = join(cwd, ".axint/repair/latest.json");
  const payload = readJsonRecord(path);
  if (!payload) return undefined;
  return {
    path,
    status: stringValue(payload.status, "unknown"),
    issueClass: stringValue(payload.issueClass, undefined),
    priority: stringValue(payload.priority, undefined),
    filesToInspect: arrayOfRecords(payload.filesToInspect)
      .map((item) => stringValue(item.path, undefined))
      .filter((item): item is string => Boolean(item)),
    commands: stringArray(payload.commands),
  };
}

function inferFailingStep(payload: Record<string, unknown>): string | undefined {
  const steps = arrayOfRecords(payload.steps);
  const failed = steps.find((step) => stringValue(step.status, "") === "fail");
  if (failed) {
    return stringValue(failed.detail, undefined) ?? stringValue(failed.name, undefined);
  }
  const cloudChecks = arrayOfRecords(payload.cloudChecks);
  const failedCloud = cloudChecks.find(
    (check) => stringValue(check.status, "") === "fail"
  );
  if (failedCloud) {
    return `Cloud Check failed${stringValue(failedCloud.gate, undefined) ? `: ${String(failedCloud.gate)}` : ""}.`;
  }
  return undefined;
}

function nextAgentCommands(cwd: string, agent: AxintAgentProfileName): string[] {
  const dir = quote(cwd);
  return [
    `axint agent advice --dir ${dir} --agent ${agent}`,
    `axint agent claim --dir ${dir} --agent ${agent} --task ${quote("next Apple repair")} <files...>`,
    `axint run --dir ${dir} --changed <files> --only-testing <focused-selector>`,
  ];
}

function normalizeFiles(cwd: string, files: string[]): string[] {
  return uniqueStrings(
    files
      .filter(Boolean)
      .map((file) => (file.startsWith("/") ? relative(cwd, file) : file))
      .map((file) => file.replace(/\\/g, "/"))
  );
}

function readJsonRecord(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return recordValue(value);
  } catch {
    return undefined;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(recordValue(item)))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringValue(value: unknown, fallback: string): string;
function stringValue(value: unknown, fallback: undefined): string | undefined;
function stringValue(value: unknown, fallback: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function agentConfigPath(cwd: string): string {
  return join(cwd, ".axint/agent.json");
}

function claimsPath(cwd: string): string {
  return join(cwd, ".axint/coordination/claims.json");
}

function ledgerPath(cwd: string): string {
  return join(cwd, ".axint/coordination/ledger.json");
}

function projectContextPath(cwd: string): string {
  return join(cwd, ".axint/context/latest.json");
}

function minutes(value: number): number {
  return Math.max(1, value) * 60 * 1000;
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function relativeOrAbsolute(cwd: string, path: string): string {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
