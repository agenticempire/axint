import type { Surface } from "./feature.js";
import {
  buildAgentToolProfile,
  normalizeAxintAgent,
  type AxintAgentProfileName,
} from "../project/agent-profile.js";
import { validateAxintSessionToken } from "../project/session.js";

export type WorkflowStage =
  | "session-start"
  | "context-recovery"
  | "planning"
  | "before-write"
  | "pre-build"
  | "pre-commit";

export interface WorkflowCheckInput {
  cwd?: string;
  agent?: AxintAgentProfileName;
  sessionStarted?: boolean;
  sessionToken?: string;
  requireSession?: boolean;
  stage?: WorkflowStage;
  surfaces?: Surface[];
  modifiedFiles?: string[];
  ranSuggest?: boolean;
  ranStatus?: boolean;
  readRehydrationContext?: boolean;
  readAgentInstructions?: boolean;
  readDocsContext?: boolean;
  ranFeature?: boolean;
  featureBypassReason?: string;
  ranRepair?: boolean;
  ranSwiftValidate?: boolean;
  ranCloudCheck?: boolean;
  xcodeBuildPassed?: boolean;
  xcodeTestsPassed?: boolean;
  notes?: string;
  availableTools?: string[];
  format?: "markdown" | "json";
}

export interface WorkflowCheckReport {
  status: "ready" | "needs_action";
  stage: WorkflowStage;
  summary: string;
  score: number;
  required: string[];
  recommended: string[];
  nextTool?: string;
  checked: string[];
}

export function runWorkflowCheck(input: WorkflowCheckInput): WorkflowCheckReport {
  const stage = input.stage ?? "pre-build";
  const surfaces = input.surfaces ?? inferSurfaces(input.modifiedFiles ?? []);
  const modifiedFiles = input.modifiedFiles ?? [];
  const required: string[] = [];
  const recommended: string[] = [];
  const checked: string[] = [];
  const requireSession = input.requireSession !== false;
  const agent = normalizeAxintAgent(input.agent);
  const profile = buildAgentToolProfile(agent);
  const patchFirstRepair = looksLikePatchFirstRepair(input);
  const documentOnlyArtifact = looksLikeDocumentOnlyArtifact(input);
  const availableTools = normalizeAvailableTools(input.availableTools);

  checked.push(
    `Agent tool profile: ${profile.label} (${profile.editingMode}). Default write action: ${profile.defaultWriteAction}.`
  );
  if (availableTools) {
    checked.push(
      `Available Axint tools supplied by host: ${availableTools.size} tool${availableTools.size === 1 ? "" : "s"}.`
    );
  }

  if (requireSession) {
    const session = validateAxintSessionToken({
      cwd: input.cwd,
      sessionStarted: input.sessionStarted,
      sessionToken: input.sessionToken,
    });
    if (session.ok) {
      checked.push(session.detail);
    } else {
      required.push(`${session.detail} Call axint.session.start before continuing.`);
    }
  }

  if (input.ranSuggest) checked.push("axint.suggest was used for planning.");
  if (input.ranStatus) checked.push("axint.status confirmed the running MCP version.");
  if (input.readRehydrationContext) {
    checked.push("Axint rehydration contract was read from .axint/AXINT_REHYDRATE.md.");
  }
  if (input.readAgentInstructions) {
    checked.push(
      "Project Axint instructions were read from AGENTS.md, CLAUDE.md, or .axint/project.json."
    );
  }
  if (input.readDocsContext) {
    checked.push(
      "Axint docs context was read from .axint/AXINT_DOCS_CONTEXT.md or axint.context.docs."
    );
  }
  if (input.ranFeature) checked.push("axint.feature was used for scaffolding.");
  if (input.ranRepair) {
    checked.push("axint.repair was used for an existing-code repair plan.");
  }
  if (input.featureBypassReason) {
    checked.push(
      `axint.feature was intentionally bypassed: ${input.featureBypassReason}`
    );
  }
  if (input.ranSwiftValidate) checked.push("axint.swift.validate was run.");
  if (input.ranCloudCheck) checked.push("axint.cloud.check was run.");
  if (input.xcodeBuildPassed) checked.push("Xcode build evidence passed.");
  if (input.xcodeTestsPassed) checked.push("Xcode test evidence passed.");
  if (documentOnlyArtifact) {
    checked.push(
      "Document/web artifact mode detected; Apple compiler gates are not the final proof surface."
    );
  }

  if (looksLikeContextDrift(input.notes)) {
    if (!input.readRehydrationContext || !input.ranStatus) {
      required.push(
        "Notes look like a new chat, compaction, stale MCP, or Axint drift. Run context recovery: call axint.session.start, read .axint/AXINT_REHYDRATE.md, call axint.status, then call axint.workflow.check with stage context-recovery before continuing."
      );
    }
  }

  if (stage === "session-start" || stage === "context-recovery") {
    if (!input.readRehydrationContext) {
      required.push(
        "Read .axint/AXINT_REHYDRATE.md before continuing so a compacted or restarted agent reloads the exact no-drift protocol."
      );
    }
    if (!input.readAgentInstructions) {
      required.push(
        "Read .axint/AXINT_MEMORY.md, AGENTS.md, CLAUDE.md, or .axint/project.json before continuing so the Axint workflow survives new chats and context compaction."
      );
    }
    if (!input.readDocsContext) {
      required.push(
        "Read .axint/AXINT_DOCS_CONTEXT.md or call axint.context.docs before continuing so the Axint docs survive context compaction."
      );
    }
    if (!input.ranStatus) {
      required.push(
        "Call axint.status and report the running MCP server version before planning or editing."
      );
    }
  }

  if (stage === "planning") {
    if (!input.readRehydrationContext) {
      recommended.push(
        "Read .axint/AXINT_REHYDRATE.md once at the start of the planning pass so the checkpoint survives compaction."
      );
    }
    if (!input.ranSuggest && !input.ranRepair && !documentOnlyArtifact) {
      required.push(
        "Run axint.suggest with the current app description before choosing the feature plan. If MCP transport is closed, use the CLI fallback: axint suggest <app-description>."
      );
    }
  }

  if (stage === "before-write") {
    if (!input.ranSuggest && !input.ranRepair && !documentOnlyArtifact) {
      required.push(
        "Run axint.suggest before writing a new Apple-native surface so the plan is not ordinary hand-coded Swift by default. If MCP transport is closed, use the CLI fallback: axint suggest <app-description>."
      );
    }
    if (
      surfaces.some((surface) =>
        ["view", "component", "intent", "widget"].includes(surface)
      )
    ) {
      if (
        !input.ranFeature &&
        !input.featureBypassReason &&
        !input.ranRepair &&
        !documentOnlyArtifact
      ) {
        required.push(
          "Run axint.feature for the new surface, or pass featureBypassReason with a concrete reason this is an edit to existing code and generation is not useful."
        );
      }
    }
    if (patchFirstRepair) {
      checked.push("Existing-code repair is in patch-first mode.");
      recommended.push(
        "Use a small patch edit for the existing dirty SwiftUI file, then run axint.swift.validate and axint.cloud.check on the changed files. Avoid full-file axint.xcode.write unless this is a new file or a clean full-file replacement."
      );
    } else if (profile.editingMode === "patch-first") {
      recommended.push(
        `This is ${profile.label}; use its native patch/edit tool for existing files, then run axint.swift.validate and axint.cloud.check. Do not route normal Codex/Claude/Cowork edits through axint.xcode.write.`
      );
    }
    if (documentOnlyArtifact) {
      recommended.push(
        "For document or web artifacts, use browser/render/link proof instead of an Apple-native generation gate."
      );
    }
  }

  if (stage === "pre-build" || stage === "pre-commit") {
    if (documentOnlyArtifact) {
      recommended.push(
        "Document/web artifact mode: verify the rendered HTML/Markdown route, screenshots, links, or browser console instead of forcing axint.cloud.check."
      );
    } else if (
      modifiedFiles.some((file) => file.endsWith(".swift")) &&
      !input.ranSwiftValidate
    ) {
      required.push(
        "Run axint.swift.validate on each modified Swift file before building."
      );
    }

    if (!documentOnlyArtifact && !input.ranCloudCheck) {
      required.push(
        "Run axint.cloud.check with the modified source and any Xcode/test/runtime evidence."
      );
    }

    if (!documentOnlyArtifact && !input.xcodeBuildPassed) {
      recommended.push(
        "Run the Xcode build after static validation; Cloud Check is not runtime proof by itself."
      );
    }

    if (stage === "pre-commit" && !documentOnlyArtifact && !input.xcodeTestsPassed) {
      recommended.push("Run focused unit/UI tests before calling the pass complete.");
    }
  }

  if (surfaces.includes("view") && !input.ranCloudCheck && !documentOnlyArtifact) {
    recommended.push(
      "For SwiftUI views, include Xcode build or UI-test evidence in Cloud Check so the report can mark runtime coverage honestly."
    );
  }

  const status = required.length === 0 ? "ready" : "needs_action";
  let nextTool =
    status === "needs_action"
      ? nextToolForRequired(required)
      : nextToolForSatisfiedStage({
          stage,
          surfaces,
          modifiedFiles,
          xcodeBuildPassed: Boolean(input.xcodeBuildPassed),
          xcodeTestsPassed: Boolean(input.xcodeTestsPassed),
          agent,
          patchFirstRepair,
          repairMode: Boolean(input.ranRepair),
          documentOnlyArtifact,
        });
  const reconciledNextTool = reconcileNextToolAvailability(nextTool, {
    availableTools,
    profile,
  });
  if (nextTool && reconciledNextTool !== nextTool) {
    recommended.push(
      `${baseAxintTool(nextTool)} is not available in this agent tool surface. Use the available fallback instead of pretending the missing MCP tool can be called.`
    );
    nextTool = reconciledNextTool;
  }
  const score = Math.max(
    0,
    100 - required.length * 30 - recommended.length * 10 - (checked.length === 0 ? 10 : 0)
  );

  return {
    status,
    stage,
    summary:
      status === "ready"
        ? nextTool
          ? `Axint workflow gate is satisfied for this stage. This is not a completion stamp; continue with ${nextTool} before broad Apple-native work.`
          : "Axint workflow gate is satisfied for this stage."
        : "Axint workflow gate needs one or more agent actions before moving on.",
    score,
    required,
    recommended,
    nextTool,
    checked,
  };
}

export function renderWorkflowCheckReport(report: WorkflowCheckReport): string {
  const lines = [
    `# Axint Workflow Check: ${report.status}`,
    "",
    `- Stage: ${report.stage}`,
    `- Score: ${report.score}/100`,
    `- Summary: ${report.summary}`,
    "",
    "## Required",
    ...(report.required.length > 0
      ? report.required.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Recommended",
    ...(report.recommended.length > 0
      ? report.recommended.map((item) => `- ${item}`)
      : ["- None."]),
    "",
    "## Checked",
    ...(report.checked.length > 0
      ? report.checked.map((item) => `- ${item}`)
      : ["- No Axint workflow evidence was supplied."]),
  ];

  if (report.nextTool) {
    const actionHeading = report.nextTool.startsWith("axint.")
      ? "## Next Axint Action"
      : "## Next Action";
    const actionReminder = report.nextTool.startsWith("axint.")
      ? "- Do not treat this workflow check as the only Axint step. Call the next Axint action before continuing with raw Xcode tools or hand-written Swift."
      : "- Do not treat this workflow check as the only gate. Patch surgically, then return to Axint validation before claiming the repair is done.";
    lines.push("", actionHeading, `- ${report.nextTool}`, actionReminder);
  }

  return lines.join("\n");
}

function inferSurfaces(files: string[]): Surface[] {
  const surfaces = new Set<Surface>();
  for (const file of files) {
    if (/Intent\.swift$/i.test(file)) surfaces.add("intent");
    if (/Widget\.swift$/i.test(file)) surfaces.add("widget");
    if (/View\.swift$/i.test(file)) surfaces.add("view");
    if (/Store\.swift$/i.test(file)) surfaces.add("store");
  }
  return [...surfaces];
}

function nextToolForRequired(required: string[]): string | undefined {
  const text = required.join(" ").toLowerCase();
  if (text.includes("axint.session.start")) return "axint.session.start";
  if (
    text.includes("axint_rehydrate") ||
    text.includes("axint_rehydrate.md") ||
    text.includes("context recovery")
  ) {
    return "axint.session.start";
  }
  if (text.includes("axint_docs_context") || text.includes("axint.context.docs")) {
    return "axint.context.docs";
  }
  if (text.includes("axint.suggest")) return "axint.suggest";
  if (text.includes("axint.status")) return "axint.status";
  if (text.includes("axint.feature")) return "axint.feature";
  if (text.includes("axint.swift.validate")) return "axint.swift.validate";
  if (text.includes("axint.cloud.check")) return "axint.cloud.check";
  return undefined;
}

function reconcileNextToolAvailability(
  nextTool: string | undefined,
  input: {
    availableTools?: Set<string>;
    profile: ReturnType<typeof buildAgentToolProfile>;
  }
): string | undefined {
  if (!nextTool || !input.availableTools) return nextTool;
  const base = baseAxintTool(nextTool);
  if (!base.startsWith("axint.")) return nextTool;
  if (input.availableTools.has(base)) return nextTool;

  if (base === "axint.feature") {
    if (input.availableTools.has("axint.suggest")) {
      return "axint.suggest, then patch existing files or use the active editor write tool";
    }
    if (input.availableTools.has("axint.xcode.write")) return "axint.xcode.write";
    return input.profile.defaultWriteAction;
  }
  if (base === "axint.suggest") {
    return "axint suggest <app-description> (CLI fallback), or axint.repair for existing-code repair";
  }
  if (base === "axint.xcode.write") return input.profile.defaultWriteAction;
  if (base === "axint.xcode.guard") {
    if (input.availableTools.has("axint.workflow.check"))
      return "axint.workflow.check(stage=pre-commit)";
    return input.profile.finishAction;
  }
  if (base === "axint.run" && input.availableTools.has("axint.workflow.check")) {
    return "axint.workflow.check(stage=pre-commit), then use shell xcodebuild proof";
  }
  return undefined;
}

function normalizeAvailableTools(tools: string[] | undefined): Set<string> | undefined {
  if (!tools || tools.length === 0) return undefined;
  const normalized = tools
    .map((tool) => tool.trim())
    .filter(Boolean)
    .map((tool) => {
      const direct = tool.match(/axint\.[A-Za-z0-9_.-]+/)?.[0];
      if (direct) return direct;
      return tool;
    });
  return new Set(normalized);
}

function baseAxintTool(tool: string): string {
  return tool.split("(")[0]?.trim() ?? tool;
}

function nextToolForSatisfiedStage(input: {
  stage: WorkflowStage;
  surfaces: Surface[];
  modifiedFiles: string[];
  xcodeBuildPassed: boolean;
  xcodeTestsPassed: boolean;
  agent: AxintAgentProfileName;
  patchFirstRepair: boolean;
  repairMode: boolean;
  documentOnlyArtifact: boolean;
}): string | undefined {
  const {
    stage,
    surfaces,
    modifiedFiles,
    xcodeBuildPassed,
    xcodeTestsPassed,
    agent,
    patchFirstRepair,
    repairMode,
    documentOnlyArtifact,
  } = input;
  const profile = buildAgentToolProfile(agent);
  if (stage === "session-start" || stage === "context-recovery") {
    return "axint.suggest";
  }
  if (documentOnlyArtifact) {
    if (stage === "planning") return "browser/render proof for the document artifact";
    if (stage === "before-write") return profile.defaultWriteAction;
    if (stage === "pre-build" || stage === "pre-commit") {
      return "Summarize rendered artifact verification and link/console proof";
    }
  }
  if (stage === "planning") {
    if (repairMode) return profile.defaultWriteAction;
    return surfaces.some((surface) =>
      ["view", "component", "intent", "widget", "app", "store"].includes(surface)
    )
      ? "axint.feature"
      : profile.xcodeToolsAllowed
        ? "axint.xcode.guard"
        : "axint.workflow.check(stage=before-write)";
  }
  if (stage === "before-write") {
    if (patchFirstRepair || profile.editingMode === "patch-first") {
      return profile.defaultWriteAction;
    }
    return profile.xcodeToolsAllowed ? "axint.xcode.write" : profile.defaultWriteAction;
  }
  if (stage === "pre-build") {
    return xcodeBuildPassed ? "axint.workflow.check(stage=pre-commit)" : "axint.run";
  }
  if (stage === "pre-commit") {
    if (!xcodeTestsPassed) return "axint.run";
    if (modifiedFiles.some((file) => file.endsWith(".swift"))) {
      return profile.xcodeToolsAllowed
        ? "axint.xcode.guard(stage=finish)"
        : profile.finishAction;
    }
  }
  return undefined;
}

function looksLikeContextDrift(notes: string | undefined): boolean {
  if (!notes) return false;
  return /\b(compacted|compaction|summarized|summary|new chat|restarted|restart|forgot|forget|drift|stale|ordinary xcode|not using axint|axint unavailable|missing axint|mcp missing|long block|long coding|lost context)\b/i.test(
    notes
  );
}

function looksLikePatchFirstRepair(input: WorkflowCheckInput): boolean {
  if (input.ranRepair) return true;

  const text = [input.featureBypassReason, input.notes, ...(input.modifiedFiles ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const patchMode =
    /\b(codex|apply_patch|patch|surgical|small edit|dirty|existing|hand-written|handwritten|repair|bug|ux|swiftui)\b/.test(
      text
    );
  const fullFileRisk = /\b(3000\+?|large|dirty|already changed|full-file|rewrite)\b/.test(
    text
  );
  const existingBypass = Boolean(input.featureBypassReason);

  return patchMode && (existingBypass || fullFileRisk || text.includes(".swift"));
}

function looksLikeDocumentOnlyArtifact(input: WorkflowCheckInput): boolean {
  const files = input.modifiedFiles ?? [];
  if (files.length > 0 && files.every(isDocumentArtifactPath)) return true;

  const text = [input.featureBypassReason, input.notes, ...files]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return false;

  return (
    /\b(document-only|docs-only|audit|sprint|html report|markdown report|north star|north-star|browser proof|rendered artifact)\b/.test(
      text
    ) && !/\.(swift|intent\.ts|view\.ts|widget\.ts)\b/.test(text)
  );
}

function isDocumentArtifactPath(file: string): boolean {
  return /\.(html?|md|mdx|txt)$/i.test(file);
}
