import { loadAxintCredentials } from "../core/credentials.js";
import { registryBaseUrl } from "../core/env.js";
import type { FeatureSuggestion, SuggestInput } from "./suggest.js";

export type ProIntelligenceStatus = "disabled" | "unavailable" | "used";

export interface ProIntelligenceResult {
  status: ProIntelligenceStatus;
  reason?: string;
  suggestions: FeatureSuggestion[];
}

export interface ProSuggestionRequest {
  input: SuggestInput;
  localSuggestions: FeatureSuggestion[];
  compiler: {
    surface: "suggest";
    boundary: "open-source-client";
  };
}

const PRO_TIMEOUT_MS = 10000;

/**
 * Public OSS boundary for Axint Pro.
 *
 * The compiler may call an authenticated Pro endpoint and validate the shape of
 * the response, but proprietary strategy packs, private prompts, model routing,
 * and book/framework-derived insight material must live server-side.
 */
export const PRO_INTELLIGENCE_BOUNDARY = {
  clientOwns: [
    "request schema",
    "auth transport",
    "timeout and fallback",
    "response validation",
    "local deterministic baseline",
  ],
  serverOwns: [
    "proprietary strategy packs",
    "model selection and routing",
    "private prompts",
    "feedback learning and ranking",
    "customer-specific insight history",
  ],
} as const;

export async function requestProSuggestions(
  input: SuggestInput,
  localSuggestions: FeatureSuggestion[]
): Promise<ProIntelligenceResult> {
  if (!shouldUsePro(input)) {
    return {
      status: "disabled",
      reason: "Pro intelligence is opt-in. Use mode: 'pro' or AXINT_PRO_INSIGHTS=1.",
      suggestions: [],
    };
  }

  const endpoint = resolveProSuggestEndpoint();
  const credentials = loadAxintCredentials();
  const token =
    process.env.AXINT_PRO_TOKEN ??
    process.env.AXINT_SUGGEST_AI_TOKEN ??
    credentials?.access_token;

  if (!endpoint || !token) {
    return {
      status: "unavailable",
      reason: "Axint Pro suggestions need a signed-in Axint session or AXINT_PRO_TOKEN.",
      suggestions: [],
    };
  }

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildProSuggestionRequest(input, localSuggestions)),
    });

    if (!response.ok) {
      return {
        status: "unavailable",
        reason: `Pro endpoint returned HTTP ${response.status}`,
        suggestions: [],
      };
    }

    const json = (await response.json()) as unknown;
    const suggestions = parseProSuggestions(json, input.limit);
    return {
      status: suggestions.length > 0 ? "used" : "unavailable",
      reason:
        suggestions.length > 0
          ? undefined
          : "Pro endpoint returned no usable suggestions.",
      suggestions,
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason: `Pro endpoint failed: ${(error as Error).message}`,
      suggestions: [],
    };
  }
}

export function buildProSuggestionRequest(
  input: SuggestInput,
  localSuggestions: FeatureSuggestion[]
): ProSuggestionRequest {
  return {
    input: {
      appDescription: input.appDescription,
      domain: input.domain,
      limit: input.limit,
      mode: "pro",
      platform: input.platform,
      audience: input.audience,
      exclude: input.exclude,
      goals: input.goals,
      stage: input.stage,
      constraints: input.constraints,
    },
    localSuggestions: localSuggestions.map((suggestion) => ({
      name: suggestion.name,
      description: suggestion.description,
      surfaces: suggestion.surfaces,
      complexity: suggestion.complexity,
      featurePrompt: suggestion.featurePrompt,
      domain: suggestion.domain,
      rationale: suggestion.rationale,
      confidence: suggestion.confidence,
      source: suggestion.source ?? "local",
    })),
    compiler: {
      surface: "suggest",
      boundary: "open-source-client",
    },
  };
}

function shouldUsePro(input: SuggestInput): boolean {
  const mode = input.mode ?? process.env.AXINT_SUGGEST_MODE ?? "local";
  if (mode === "pro" || mode === "ai") return true;
  if (mode === "auto") {
    return process.env.AXINT_PRO_INSIGHTS === "1" || process.env.AXINT_SUGGEST_AI === "1";
  }
  return process.env.AXINT_PRO_INSIGHTS === "1";
}

function resolveProSuggestEndpoint(): string {
  if (process.env.AXINT_PRO_SUGGEST_URL) return process.env.AXINT_PRO_SUGGEST_URL;
  if (process.env.AXINT_PRO_INSIGHTS_URL) return process.env.AXINT_PRO_INSIGHTS_URL;
  if (process.env.AXINT_SUGGEST_AI_ENDPOINT) {
    return process.env.AXINT_SUGGEST_AI_ENDPOINT;
  }
  return `${registryBaseUrl()}/api/v1/pro/insights/suggest`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRO_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseProSuggestions(
  value: unknown,
  requestedLimit?: number
): FeatureSuggestion[] {
  const raw = Array.isArray((value as { suggestions?: unknown })?.suggestions)
    ? (value as { suggestions: unknown[] }).suggestions
    : [];
  const limit = Math.max(1, Math.min(12, Math.floor(requestedLimit ?? 5)));

  return raw
    .map(normalizeProSuggestion)
    .filter((suggestion): suggestion is FeatureSuggestion => Boolean(suggestion))
    .slice(0, limit);
}

function normalizeProSuggestion(value: unknown): FeatureSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = stringValue(record.name);
  const description = stringValue(record.description);
  const featurePrompt = stringValue(record.featurePrompt);
  const surfaces = normalizeSurfaces(record.surfaces);
  if (!name || !description || !featurePrompt || surfaces.length === 0) return null;

  return {
    name,
    description,
    surfaces,
    complexity: normalizeComplexity(record.complexity),
    featurePrompt,
    domain: stringValue(record.domain) || "custom",
    rationale: stringValue(record.rationale) || "Recommended by Axint Pro.",
    confidence: normalizeConfidence(record.confidence) ?? "medium",
    source: "pro",
    impact: stringValue(record.impact) || undefined,
    loop: stringValue(record.loop) || undefined,
    nextStep: stringValue(record.nextStep) || undefined,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSurfaces(value: unknown): FeatureSuggestion["surfaces"] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(["intent", "view", "widget", "component", "app", "store"]);
  return Array.from(
    new Set(
      value
        .filter((surface): surface is string => typeof surface === "string")
        .map((surface) => surface.toLowerCase())
        .filter((surface) => allowed.has(surface))
    )
  ) as FeatureSuggestion["surfaces"];
}

function normalizeComplexity(value: unknown): FeatureSuggestion["complexity"] {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function normalizeConfidence(
  value: unknown
): FeatureSuggestion["confidence"] | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}
