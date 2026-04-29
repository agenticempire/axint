import { InvalidArgumentError, type Command } from "commander";
import {
  normalizeAxintAgent,
  type AxintAgentProfileName,
} from "../project/agent-profile.js";
import type { Surface } from "../mcp/feature.js";
import {
  renderWorkflowCheckReport,
  runWorkflowCheck,
  type WorkflowStage,
} from "../mcp/workflow-check.js";

export type WorkflowCliFormat = "markdown" | "json";

const WORKFLOW_STAGES = [
  "session-start",
  "context-recovery",
  "planning",
  "before-write",
  "pre-build",
  "pre-commit",
] as const satisfies readonly WorkflowStage[];

const SURFACES = [
  "intent",
  "view",
  "widget",
  "component",
  "app",
  "store",
] as const satisfies readonly Surface[];

export function registerWorkflow(program: Command) {
  const workflow = program
    .command("workflow")
    .description(
      "Run Axint workflow gates from the CLI when MCP is stale, closed, or unavailable"
    );

  workflow
    .command("check")
    .description(
      "Check session/context/planning/write/build gates without relying on an MCP transport"
    )
    .option(
      "--dir <dir>",
      "Project directory containing .axint/session/current.json",
      "."
    )
    .option(
      "--agent <agent>",
      "Agent host/tool lane: codex, claude, cowork, cursor, xcode, or all",
      parseAgent,
      "all" as AxintAgentProfileName
    )
    .option("--session-token <token>", "Token returned by axint.session.start")
    .option("--session-started", "Mark that axint.session.start ran in this pass")
    .option(
      "--no-session",
      "Allow a legacy/manual check without requiring .axint/session/current.json"
    )
    .option(
      "--stage <stage>",
      `Workflow stage: ${WORKFLOW_STAGES.join(", ")}`,
      parseStage,
      "pre-build" as WorkflowStage
    )
    .option("--surface <surface...>", `Touched surfaces: ${SURFACES.join(", ")}`)
    .option("--modified <file...>", "Modified files in this pass")
    .option("--ran-suggest", "Mark that axint.suggest was used")
    .option("--ran-status", "Mark that axint.status was used")
    .option("--read-rehydration-context", "Mark that .axint/AXINT_REHYDRATE.md was read")
    .option(
      "--read-agent-instructions",
      "Mark that AGENTS.md/CLAUDE.md/project.json was read"
    )
    .option("--read-docs-context", "Mark that .axint/AXINT_DOCS_CONTEXT.md was read")
    .option("--ran-feature", "Mark that axint.feature was used")
    .option(
      "--feature-bypass-reason <reason>",
      "Why generation was intentionally bypassed"
    )
    .option("--ran-swift-validate", "Mark that axint.swift.validate was used")
    .option("--ran-cloud-check", "Mark that axint.cloud.check was used")
    .option("--xcode-build-passed", "Mark that Xcode build evidence passed")
    .option("--xcode-tests-passed", "Mark that focused unit/UI tests passed")
    .option(
      "--available-tool <tool>",
      "Axint MCP tool visible in the current host. Repeat or comma-separate tools.",
      collectList,
      [] as string[]
    )
    .option("--notes <notes>", "Human/agent notes for drift or bypass detection")
    .option("--json", "Shortcut for --format json")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseFormat,
      "markdown" as WorkflowCliFormat
    )
    .action(
      (options: {
        dir: string;
        agent: AxintAgentProfileName;
        sessionToken?: string;
        sessionStarted?: boolean;
        session?: boolean;
        stage: WorkflowStage;
        surface?: string[];
        modified?: string[];
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
        availableTool: string[];
        notes?: string;
        json?: boolean;
        format: WorkflowCliFormat;
      }) => {
        const report = runWorkflowCheck({
          cwd: options.dir,
          agent: options.agent,
          sessionStarted: options.sessionStarted,
          sessionToken: options.sessionToken,
          requireSession: options.session !== false,
          stage: options.stage,
          surfaces: parseSurfaces(options.surface),
          modifiedFiles: options.modified,
          ranSuggest: options.ranSuggest,
          ranStatus: options.ranStatus,
          readRehydrationContext: options.readRehydrationContext,
          readAgentInstructions: options.readAgentInstructions,
          readDocsContext: options.readDocsContext,
          ranFeature: options.ranFeature,
          featureBypassReason: options.featureBypassReason,
          ranSwiftValidate: options.ranSwiftValidate,
          ranCloudCheck: options.ranCloudCheck,
          xcodeBuildPassed: options.xcodeBuildPassed,
          xcodeTestsPassed: options.xcodeTestsPassed,
          availableTools: options.availableTool,
          notes: options.notes,
          format: options.json ? "json" : options.format,
        });

        console.log(
          options.json || options.format === "json"
            ? JSON.stringify(report, null, 2)
            : renderWorkflowCheckReport(report)
        );
      }
    );
}

function parseAgent(value: string): AxintAgentProfileName {
  const agent = normalizeAxintAgent(value);
  if (agent === value) return agent;
  throw new InvalidArgumentError(`invalid agent: ${value}`);
}

function parseStage(value: string): WorkflowStage {
  if ((WORKFLOW_STAGES as readonly string[]).includes(value)) {
    return value as WorkflowStage;
  }
  throw new InvalidArgumentError(
    `invalid workflow stage: ${value} (expected one of ${WORKFLOW_STAGES.join(", ")})`
  );
}

function parseFormat(value: string): WorkflowCliFormat {
  if (value === "markdown" || value === "json") return value;
  throw new InvalidArgumentError(`invalid format: ${value}`);
}

function parseSurfaces(values: string[] | undefined): Surface[] | undefined {
  if (!values || values.length === 0) return undefined;
  return values.map((value) => {
    if ((SURFACES as readonly string[]).includes(value)) return value as Surface;
    throw new InvalidArgumentError(
      `invalid surface: ${value} (expected one of ${SURFACES.join(", ")})`
    );
  });
}

function collectList(value: string, previous: string[]): string[] {
  return [
    ...previous,
    ...value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  ];
}
