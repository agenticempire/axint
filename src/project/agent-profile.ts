export type AxintAgentProfileName =
  | "all"
  | "claude"
  | "codex"
  | "cowork"
  | "cursor"
  | "xcode";

export const AXINT_AGENT_PROFILE_NAMES = [
  "all",
  "claude",
  "codex",
  "cowork",
  "cursor",
  "xcode",
] as const satisfies readonly AxintAgentProfileName[];

export interface AxintAgentToolProfile {
  agent: AxintAgentProfileName;
  label: string;
  editingMode: "patch-first" | "xcode-guarded" | "detect-host";
  xcodeToolsAllowed: boolean;
  defaultWriteAction: string;
  finishAction: string;
  contextRecoveryAction: string;
  proofAction: string;
  avoid: string[];
}

export function normalizeAxintAgent(value: string | undefined): AxintAgentProfileName {
  if (value && (AXINT_AGENT_PROFILE_NAMES as readonly string[]).includes(value)) {
    return value as AxintAgentProfileName;
  }
  return "all";
}

export function buildAgentToolProfile(
  agent: string | undefined = "all"
): AxintAgentToolProfile {
  const normalized = normalizeAxintAgent(agent);

  if (normalized === "xcode") {
    return {
      agent: "xcode",
      label: "Xcode agent",
      editingMode: "xcode-guarded",
      xcodeToolsAllowed: true,
      defaultWriteAction: "axint.xcode.write",
      finishAction: "axint.xcode.guard(stage=finish)",
      contextRecoveryAction:
        "Call axint.xcode.guard with stage=context-recovery, then axint.session.start and axint.workflow.check.",
      proofAction:
        "Use axint.run or Xcode build/test evidence, then write .axint/guard/latest.* proof before claiming done.",
      avoid: [
        "Do not skip axint.xcode.guard during long Xcode sessions.",
        "Do not claim SwiftUI behavior is fixed from static checks alone.",
      ],
    };
  }

  if (normalized === "codex") {
    return patchFirstProfile({
      agent: "codex",
      label: "Codex",
      writeAction: "apply_patch, then axint.swift.validate",
    });
  }

  if (normalized === "cowork") {
    return patchFirstProfile({
      agent: "cowork",
      label: "Cowork",
      writeAction:
        "use the workspace patch/edit primitive or CLI edits, then axint validate-swift",
    });
  }

  if (normalized === "claude" || normalized === "cursor") {
    return patchFirstProfile({
      agent: normalized,
      label: normalized === "claude" ? "Claude Code" : "Cursor",
      writeAction:
        "use the client-native patch/file edit tool, then axint.swift.validate",
    });
  }

  return {
    agent: "all",
    label: "Auto-detect agent host",
    editingMode: "detect-host",
    xcodeToolsAllowed: false,
    defaultWriteAction:
      "Use the current client's native patch/edit tool; only use axint.xcode.write inside a real Xcode agent session.",
    finishAction:
      "Summarize validation, Cloud Check, build/test proof, and do not call Xcode-only guard tools unless the active host is Xcode.",
    contextRecoveryAction:
      "Call axint.session.start, read local Axint context files, call axint.status, then axint.workflow.check.",
    proofAction:
      "Use axint.swift.validate, axint.cloud.check, and axint.run or shell build/test evidence that the active agent can actually run.",
    avoid: [
      "Do not assume Xcode MCP tools exist in Codex, Claude Code, Cursor, or Cowork.",
      "Do not use full-file axint.xcode.write for dirty existing files in patch-first agents.",
    ],
  };
}

export function renderAgentToolProfile(profile: AxintAgentToolProfile): string {
  return [
    `Agent host: ${profile.label}`,
    `Editing lane: ${profile.editingMode}`,
    `Default write action: ${profile.defaultWriteAction}`,
    `Proof action: ${profile.proofAction}`,
    `Context recovery: ${profile.contextRecoveryAction}`,
    `Xcode-only tools allowed by default: ${profile.xcodeToolsAllowed ? "yes" : "no"}`,
    "Avoid:",
    ...profile.avoid.map((item) => `- ${item}`),
  ].join("\n");
}

function patchFirstProfile(input: {
  agent: AxintAgentProfileName;
  label: string;
  writeAction: string;
}): AxintAgentToolProfile {
  return {
    agent: input.agent,
    label: input.label,
    editingMode: "patch-first",
    xcodeToolsAllowed: false,
    defaultWriteAction: input.writeAction,
    finishAction:
      "Summarize Axint validation, Cloud Check, and build/test proof. Do not call axint.xcode.guard unless this chat is actually running inside Xcode.",
    contextRecoveryAction:
      "Call axint.session.start, read .axint context files, call axint.status, then axint.workflow.check.",
    proofAction:
      "Use axint.swift.validate, axint.cloud.check, and axint.run or shell xcodebuild evidence when available.",
    avoid: [
      "Do not call axint.xcode.write for dirty existing files; patch surgically instead.",
      "Do not call axint.xcode.guard as a routine finish gate outside Xcode.",
      "Do not rely on Xcode packet readers unless Xcode emitted those packets.",
    ],
  };
}
