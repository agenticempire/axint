import { InvalidArgumentError, type Command } from "commander";
import {
  suggestFeaturesSmart,
  type FeatureSuggestion,
  type SuggestInput,
} from "../mcp/suggest.js";

const SUGGEST_MODES = ["local", "auto", "ai", "pro"] as const;
const SUGGEST_PLATFORMS = ["iOS", "macOS", "watchOS", "visionOS", "multi"] as const;
const STAGES = ["idea", "prototype", "mvp", "growth", "enterprise", "unknown"] as const;

export function registerSuggest(program: Command) {
  program
    .command("suggest")
    .description(
      "Suggest Apple-native features from the CLI when MCP suggest is stale, closed, or unavailable"
    )
    .argument("<app-description...>", "Current app, bug, or product description")
    .option("--domain <domain>", "Weak domain hint. The app description still wins.")
    .option("--limit <count>", "Maximum suggestions to return", parsePositiveInt, 5)
    .option(
      "--mode <mode>",
      `Suggestion mode: ${SUGGEST_MODES.join(", ")}`,
      parseSuggestMode,
      "local" as SuggestInput["mode"]
    )
    .option(
      "--platform <platform>",
      `Target platform: ${SUGGEST_PLATFORMS.join(", ")}`,
      parseSuggestPlatform
    )
    .option("--audience <audience>", "Primary user or buyer")
    .option(
      "--exclude <term>",
      "Concept to avoid. Repeat or comma-separate terms.",
      collectList,
      [] as string[]
    )
    .option(
      "--goal <goal>",
      "Product goal. Repeat or comma-separate goals.",
      collectList,
      [] as string[]
    )
    .option(
      "--constraint <constraint>",
      "Implementation constraint. Repeat or comma-separate constraints.",
      collectList,
      [] as string[]
    )
    .option(
      "--stage <stage>",
      `Product stage: ${STAGES.join(", ")}`,
      parseStage,
      "unknown" as SuggestInput["stage"]
    )
    .option("--json", "Emit suggestions as JSON")
    .action(async (descriptionParts: string[], options: SuggestOptions) => {
      try {
        const input = buildSuggestInput(descriptionParts, options);
        const suggestions = await suggestFeaturesSmart(input);

        if (options.json) {
          console.log(JSON.stringify({ input, suggestions }, null, 2));
          return;
        }

        console.log(renderSuggestReport(input, suggestions));
      } catch (err: unknown) {
        console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    });
}

type SuggestOptions = {
  domain?: string;
  limit: number;
  mode: SuggestInput["mode"];
  platform?: SuggestInput["platform"];
  audience?: string;
  exclude: string[];
  goal: string[];
  constraint: string[];
  stage: SuggestInput["stage"];
  json?: boolean;
};

function buildSuggestInput(
  descriptionParts: string[],
  options: SuggestOptions
): SuggestInput {
  const appDescription = descriptionParts.join(" ").trim();
  if (!appDescription) throw new Error("suggest requires an app description");

  return {
    appDescription,
    domain: options.domain,
    limit: options.limit,
    mode: options.mode,
    platform: options.platform,
    audience: options.audience,
    exclude: options.exclude,
    goals: options.goal,
    constraints: options.constraint,
    stage: options.stage,
  };
}

function renderSuggestReport(
  input: SuggestInput,
  suggestions: FeatureSuggestion[]
): string {
  const lines = [
    "# Axint Suggestions",
    "",
    `- App: ${input.appDescription}`,
    input.platform ? `- Platform: ${input.platform}` : null,
    input.domain ? `- Domain hint: ${input.domain}` : null,
    input.exclude?.length ? `- Excluding: ${input.exclude.join(", ")}` : null,
    "",
    "Use these before `axint feature` or as the planning proof for `axint workflow check --ran-suggest` when MCP transport is closed.",
    "",
  ].filter(Boolean) as string[];

  suggestions.forEach((suggestion, index) => {
    const suggestionLines = [
      `## ${index + 1}. ${suggestion.name}`,
      "",
      `- Domain: ${suggestion.domain}`,
      `- Surfaces: ${suggestion.surfaces.join(", ")}`,
      `- Complexity: ${suggestion.complexity}`,
      suggestion.confidence ? `- Confidence: ${suggestion.confidence}` : null,
      suggestion.rationale ? `- Rationale: ${suggestion.rationale}` : null,
      suggestion.impact ? `- Impact: ${suggestion.impact}` : null,
      suggestion.loop ? `- Loop: ${suggestion.loop}` : null,
      suggestion.nextStep ? `- Next step: ${suggestion.nextStep}` : null,
      `- Feature prompt: ${suggestion.featurePrompt}`,
      "",
    ].filter(Boolean) as string[];
    lines.push(...suggestionLines);
  });

  if (suggestions.length === 0) {
    lines.push(
      "No suggestions were produced. Add a more specific app description and rerun."
    );
  }

  return lines.join("\n");
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

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new InvalidArgumentError(`invalid limit: ${value}`);
}

function parseSuggestMode(value: string): SuggestInput["mode"] {
  if ((SUGGEST_MODES as readonly string[]).includes(value)) {
    return value as SuggestInput["mode"];
  }
  throw new InvalidArgumentError(
    `invalid mode: ${value} (expected one of ${SUGGEST_MODES.join(", ")})`
  );
}

function parseSuggestPlatform(value: string): SuggestInput["platform"] {
  if ((SUGGEST_PLATFORMS as readonly string[]).includes(value)) {
    return value as SuggestInput["platform"];
  }
  throw new InvalidArgumentError(
    `invalid platform: ${value} (expected one of ${SUGGEST_PLATFORMS.join(", ")})`
  );
}

function parseStage(value: string): SuggestInput["stage"] {
  if ((STAGES as readonly string[]).includes(value)) {
    return value as SuggestInput["stage"];
  }
  throw new InvalidArgumentError(
    `invalid stage: ${value} (expected one of ${STAGES.join(", ")})`
  );
}
