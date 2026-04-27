import type { FeatureFile, FeatureInput, Surface } from "./feature.js";

export interface SemanticComponentArchetype {
  name: string;
  kind: string;
  description: string;
  terms: string[];
}

const COMPONENT_SUFFIXES = [
  "Card",
  "Row",
  "Pill",
  "Panel",
  "View",
  "Component",
  "Tile",
  "Cell",
  "Banner",
  "Bar",
  "Rail",
  "Column",
  "List",
  "Grid",
  "Toolbar",
  "Sheet",
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "apple",
  "archetype",
  "archetypes",
  "basic",
  "build",
  "card",
  "cards",
  "component",
  "components",
  "create",
  "design",
  "distinct",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "kind",
  "make",
  "native",
  "of",
  "on",
  "one",
  "or",
  "surface",
  "surfaces",
  "swift",
  "swiftui",
  "that",
  "the",
  "three",
  "to",
  "two",
  "ui",
  "usable",
  "use",
  "with",
]);

const UI_SIGNAL_WORDS = [
  "approval",
  "avatar",
  "badge",
  "bar",
  "board",
  "button",
  "card",
  "chart",
  "chip",
  "column",
  "composer",
  "dashboard",
  "detail",
  "empty",
  "feed",
  "filter",
  "grid",
  "hero",
  "image",
  "inbox",
  "inspector",
  "list",
  "media",
  "metric",
  "modal",
  "panel",
  "picker",
  "pill",
  "preview",
  "queue",
  "rail",
  "row",
  "search",
  "section",
  "sheet",
  "sidebar",
  "split",
  "status",
  "summary",
  "tab",
  "table",
  "tag",
  "timeline",
  "toggle",
  "toolbar",
  "widget",
];

export function inferSemanticComponentArchetypes(
  description: string,
  baseName: string,
  componentKind?: string
): SemanticComponentArchetype[] {
  const haystack = `${componentKind ?? ""} ${baseName} ${description}`;
  const lower = haystack.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, "");
  const wantsMany =
    compact.includes("componentkit") ||
    compact.includes("cardkit") ||
    compact.includes("cardarchetypes") ||
    /\b(two|three|four|five|[2-9])\s+(distinct\s+)?(card|component|row|panel|view)s?\b/.test(
      lower
    ) ||
    /\b(card|component|view|row)\s+archetypes?\b/.test(lower) ||
    /\b(component|card|view)\s+kit\b/.test(lower);

  const explicitNames = extractComponentNames(description);
  const explicitKind = normalizeSemanticKind(componentKind);

  if (explicitNames.length > 0 && (wantsMany || explicitNames.length > 1)) {
    return uniqueComponentNames(explicitNames).map((name) =>
      buildComponentArchetype(name, description, explicitKind)
    );
  }

  if (!wantsMany) return [];

  const inferredNames = inferNamesFromPhrases(description);
  if (inferredNames.length > 1) {
    return uniqueComponentNames(inferredNames).map((name) =>
      buildComponentArchetype(name, description, explicitKind)
    );
  }

  return defaultComponentKit(description);
}

export function inferSemanticComponentKind(
  description: string,
  name: string,
  explicitKind?: string
): string | undefined {
  const normalized = normalizeSemanticKind(explicitKind);
  if (normalized) return normalized;
  return inferKindFromText(`${name} ${description}`);
}

export function usesSemanticLayout(description: string): boolean {
  const lower = description.toLowerCase();
  return UI_SIGNAL_WORDS.some((word) => hasWord(lower, word));
}

export function semanticLabels(description: string, limit = 4): string[] {
  const tokens = meaningfulTokens(description).filter(
    (token) => !UI_SIGNAL_WORDS.includes(token)
  );
  const labels = unique(tokens)
    .slice(0, limit)
    .map((token) => titleCase(token.replace(/[-_]+/g, " ")));
  return labels.length > 0 ? labels : ["Overview", "Active", "Needs Review"];
}

export function auditGeneratedFeature(
  input: FeatureInput,
  files: FeatureFile[]
): string[] {
  const diagnostics: string[] = [];
  const description = `${input.description} ${input.context ?? ""}`;
  const surfaces = input.surfaces ?? (["intent"] as Surface[]);
  const swiftFiles = files.filter((file) => file.type === "swift");
  const swiftText = swiftFiles.map((file) => file.content).join("\n\n");
  const normalizedSwift = normalizeForCoverage(swiftText);
  const tokens = meaningfulTokens(description).filter(
    (token) => token.length > 3 && !UI_SIGNAL_WORDS.includes(token)
  );
  const uniqueTokens = unique(tokens).slice(0, 18);
  const covered = uniqueTokens.filter((token) => normalizedSwift.includes(token));
  const coverage = uniqueTokens.length === 0 ? 1 : covered.length / uniqueTokens.length;

  const requestedComponents = inferSemanticComponentArchetypes(
    description,
    input.name ?? "",
    input.componentKind
  );
  if (surfaces.includes("component") && requestedComponents.length > 1) {
    for (const component of requestedComponents) {
      if (!files.some((file) => file.path.endsWith(`${component.name}.swift`))) {
        diagnostics.push(
          `[AX850] error: Generated feature missed requested component ${component.name}\n  help: Split multi-component requests into one Swift file per named component.`
        );
      }
    }
  }

  if (
    (surfaces.includes("view") || surfaces.includes("component")) &&
    input.tokenNamespace &&
    swiftFiles.length > 0 &&
    !swiftText.includes(input.tokenNamespace)
  ) {
    diagnostics.push(
      `[AX851] warning: Generated UI did not reference token namespace ${input.tokenNamespace}\n  help: Use the supplied design tokens for colors, radii, spacing, and layout constants.`
    );
  }

  if (
    (surfaces.includes("view") || surfaces.includes("component")) &&
    hasGenericPlaceholder(swiftText)
  ) {
    diagnostics.push(
      `[AX852] error: Generated UI still looks like a generic placeholder\n  help: Replace placeholder Text/VStack output with structure that reflects the requested product surface.`
    );
  }

  if (
    (surfaces.includes("view") || surfaces.includes("component")) &&
    uniqueTokens.length >= 6 &&
    coverage < 0.22
  ) {
    const missing = uniqueTokens.filter((token) => !covered.includes(token)).slice(0, 6);
    diagnostics.push(
      `[AX853] warning: Generated UI has low semantic coverage of the prompt (${Math.round(
        coverage * 100
      )}%)\n  help: Incorporate the requested concepts into the generated names, labels, or component structure: ${missing.join(
        ", "
      )}.`
    );
  }

  return diagnostics;
}

function extractComponentNames(description: string): string[] {
  const names = new Set<string>();
  const suffixPattern = COMPONENT_SUFFIXES.join("|");
  const pascalRe = new RegExp(`\\b[A-Z][A-Za-z0-9]*(?:${suffixPattern})\\b`, "g");
  for (const match of description.matchAll(pascalRe)) {
    names.add(match[0]);
  }

  const phraseSource = description.replace(pascalRe, " ");
  const phraseRe = new RegExp(
    `\\b([a-z][a-z0-9]*(?:[\\s-]+[a-z][a-z0-9]*){0,3})\\s+(${suffixPattern.toLowerCase()})s?\\b`,
    "gi"
  );
  for (const match of phraseSource.matchAll(phraseRe)) {
    const name = phraseToComponentName(match[1] ?? "", match[2] ?? "");
    if (name.length > 4) names.add(name);
  }

  return Array.from(names).filter(
    (name) =>
      ![
        "AppIntent",
        "SwiftUI",
        "WidgetKit",
        "NavigationSplitView",
        "HSplitView",
      ].includes(name)
  );
}

function inferNamesFromPhrases(description: string): string[] {
  const lower = description.toLowerCase();
  const names: string[] = [];
  const phraseMap: Array<[RegExp, string]> = [
    [/\bfeed|post|reaction|comment\b/, "FeedPostCard"],
    [/\bmedia|image|asset|cover|gallery|preview\b/, "ProjectMediaCard"],
    [/\butility|quick action|status row|compact row\b/, "CompactUtilityRow"],
    [/\bapproval|review|sign[-\s]?off\b/, "ApprovalCard"],
    [/\bagent|operator|worker\b/, "AgentRow"],
    [/\bmission|task|handoff\b/, "MissionCard"],
    [/\bcontext|memory|north star\b/, "ContextPanel"],
    [/\bsignal|trend|alert\b/, "SignalCard"],
  ];
  for (const [pattern, name] of phraseMap) {
    if (pattern.test(lower)) names.push(name);
  }
  return names;
}

function buildComponentArchetype(
  name: string,
  description: string,
  explicitKind?: string
): SemanticComponentArchetype {
  const terms = semanticLabels(`${name} ${description}`, 5);
  return {
    name,
    kind:
      explicitKind ??
      inferKindFromText(name) ??
      inferKindFromText(description) ??
      "semanticCard",
    description: `${humanizeName(name)} generated from the requested product vocabulary: ${terms.join(
      ", "
    )}.`,
    terms,
  };
}

function defaultComponentKit(description: string): SemanticComponentArchetype[] {
  const defaults = inferNamesFromPhrases(description);
  const names =
    defaults.length >= 2
      ? defaults
      : ["PrimaryContentCard", "SupportingMediaCard", "CompactActionRow"];
  return uniqueComponentNames(names).map((name) =>
    buildComponentArchetype(name, description)
  );
}

function inferKindFromText(text: string): string | undefined {
  const normalized = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const compact = normalized.replace(/[\s_-]+/g, "").toLowerCase();
  const lower = normalized.toLowerCase();
  if (/\bfeed|post|reaction|comment|share\b/.test(lower)) return "feedCard";
  if (/\bmedia|image|photo|asset|cover|gallery|preview|nsimage\b/.test(lower))
    return "mediaCard";
  if (/\butility|quick action|status row|compact row\b/.test(lower)) return "utilityRow";
  if (/\bapproval|approve|review|risk|sign[-\s]?off\b/.test(lower)) return "approvalCard";
  if (/\bmission|task|handoff|milestone\b/.test(lower)) return "missionCard";
  if (/\bagent|operator|worker|teammate\b/.test(lower)) return "agentRow";
  if (/\bchannel|room|conversation\b/.test(lower)) return "channelRow";
  if (/\bstatus|progress|ring\b/.test(lower)) return "statusRing";
  if (/\bavatar|profile photo|initials\b/.test(lower)) return "avatar";
  if (/\bcontext|north star|memory\b/.test(lower)) return "contextPanel";
  if (/\bsignal|trend|alert|intel\b/.test(lower)) return "signalCard";
  if (/\bprofile|swipe|dating\b/.test(lower)) return "profileCard";
  if (compact.endsWith("row")) return "semanticRow";
  if (compact.endsWith("pill") || compact.endsWith("badge")) return "semanticPill";
  if (compact.endsWith("panel") || compact.endsWith("sheet")) return "semanticPanel";
  if (compact.endsWith("bar") || compact.endsWith("toolbar")) return "semanticBar";
  if (compact.endsWith("list") || compact.endsWith("grid")) return "semanticList";
  if (compact.endsWith("card") || compact.endsWith("tile") || compact.endsWith("cell"))
    return "semanticCard";
  return undefined;
}

function normalizeSemanticKind(kind: string | undefined): string | undefined {
  if (!kind) return undefined;
  const compact = kind.replace(/[\s_-]+/g, "").toLowerCase();
  const map: Record<string, string> = {
    semanticcard: "semanticCard",
    generativecard: "semanticCard",
    semanticrow: "semanticRow",
    generativerow: "semanticRow",
    semanticpill: "semanticPill",
    semanticbadge: "semanticPill",
    semanticpanel: "semanticPanel",
    generativepanel: "semanticPanel",
    semanticbar: "semanticBar",
    semantictoolbar: "semanticBar",
    semanticlist: "semanticList",
    semanticgrid: "semanticList",
  };
  return map[compact];
}

function meaningfulTokens(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function normalizeForCoverage(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ");
}

function hasGenericPlaceholder(swiftText: string): boolean {
  return [
    /Text\("Hello"\)/,
    /Text\("Input:\s*\\\(input\)"\)/,
    /VStack\s*\{\s*Text\("[^"]+"\)\s*\}/s,
  ].some((pattern) => pattern.test(swiftText));
}

function uniqueComponentNames(names: string[]): string[] {
  return unique(names.map(cleanComponentName).filter(Boolean));
}

function cleanComponentName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function toPascalName(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function phraseToComponentName(lead: string, suffix: string): string {
  const componentWords = COMPONENT_SUFFIXES.map((value) => value.toLowerCase());
  const words = lead
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter(
      (word) =>
        ![
          "add",
          "a",
          "an",
          "basic",
          "build",
          "create",
          "distinct",
          "first",
          "generic",
          "make",
          "new",
          "primary",
          "real",
          "reusable",
          "second",
          "swiftui",
          "third",
        ].includes(word)
    );
  if (words.length === 0) return "";
  let normalizedSuffix = suffix.toLowerCase();
  if (
    ["component", "view"].includes(normalizedSuffix) &&
    componentWords.includes(words[words.length - 1] ?? "")
  ) {
    normalizedSuffix = words.pop() ?? normalizedSuffix;
  }
  return toPascalName([...words, normalizedSuffix].join(" "));
}

function humanizeName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`, "i").test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
