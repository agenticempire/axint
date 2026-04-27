import type { Surface } from "./feature.js";
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
  ranSwiftValidate?: boolean;
  ranCloudCheck?: boolean;
  xcodeBuildPassed?: boolean;
  xcodeTestsPassed?: boolean;
  notes?: string;
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
  if (input.featureBypassReason) {
    checked.push(
      `axint.feature was intentionally bypassed: ${input.featureBypassReason}`
    );
  }
  if (input.ranSwiftValidate) checked.push("axint.swift.validate was run.");
  if (input.ranCloudCheck) checked.push("axint.cloud.check was run.");
  if (input.xcodeBuildPassed) checked.push("Xcode build evidence passed.");
  if (input.xcodeTestsPassed) checked.push("Xcode test evidence passed.");

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
    if (!input.ranSuggest) {
      required.push(
        "Run axint.suggest with the current app description before choosing the feature plan."
      );
    }
  }

  if (stage === "before-write") {
    if (!input.ranSuggest) {
      required.push(
        "Run axint.suggest before writing a new Apple-native surface so the plan is not ordinary hand-coded Swift by default."
      );
    }
    if (
      surfaces.some((surface) =>
        ["view", "component", "intent", "widget"].includes(surface)
      )
    ) {
      if (!input.ranFeature && !input.featureBypassReason) {
        required.push(
          "Run axint.feature for the new surface, or pass featureBypassReason with a concrete reason this is an edit to existing code and generation is not useful."
        );
      }
    }
  }

  if (stage === "pre-build" || stage === "pre-commit") {
    if (
      modifiedFiles.some((file) => file.endsWith(".swift")) &&
      !input.ranSwiftValidate
    ) {
      required.push(
        "Run axint.swift.validate on each modified Swift file before building."
      );
    }

    if (!input.ranCloudCheck) {
      required.push(
        "Run axint.cloud.check with the modified source and any Xcode/test/runtime evidence."
      );
    }

    if (!input.xcodeBuildPassed) {
      recommended.push(
        "Run the Xcode build after static validation; Cloud Check is not runtime proof by itself."
      );
    }

    if (stage === "pre-commit" && !input.xcodeTestsPassed) {
      recommended.push("Run focused unit/UI tests before calling the pass complete.");
    }
  }

  if (surfaces.includes("view") && !input.ranCloudCheck) {
    recommended.push(
      "For SwiftUI views, include Xcode build or UI-test evidence in Cloud Check so the report can mark runtime coverage honestly."
    );
  }

  const status = required.length === 0 ? "ready" : "needs_action";
  const nextTool =
    status === "needs_action"
      ? nextToolForRequired(required)
      : nextToolForSatisfiedStage(stage, surfaces, modifiedFiles);
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
          ? `Axint workflow gate is satisfied for this stage. This is not a completion stamp; continue with ${nextTool} before ordinary Xcode work.`
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
    lines.push(
      "",
      "## Next Axint Action",
      `- ${report.nextTool}`,
      "- Do not treat this workflow check as the only Axint step. Call the next Axint action before continuing with raw Xcode tools or hand-written Swift."
    );
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

function nextToolForSatisfiedStage(
  stage: WorkflowStage,
  surfaces: Surface[],
  modifiedFiles: string[]
): string | undefined {
  if (stage === "session-start" || stage === "context-recovery") {
    return "axint.suggest";
  }
  if (stage === "planning") {
    return surfaces.some((surface) =>
      ["view", "component", "intent", "widget", "app", "store"].includes(surface)
    )
      ? "axint.feature"
      : "axint.xcode.guard";
  }
  if (stage === "before-write") {
    return "axint.xcode.write";
  }
  if (stage === "pre-build") {
    return "axint.run";
  }
  if (stage === "pre-commit" && modifiedFiles.some((file) => file.endsWith(".swift"))) {
    return "axint.cloud.check";
  }
  return undefined;
}

function looksLikeContextDrift(notes: string | undefined): boolean {
  if (!notes) return false;
  return /\b(compacted|compaction|summarized|summary|new chat|restarted|restart|forgot|forget|drift|stale|ordinary xcode|not using axint|axint unavailable|missing axint|mcp missing|long block|long coding|lost context)\b/i.test(
    notes
  );
}
