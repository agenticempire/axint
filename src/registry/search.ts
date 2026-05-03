/**
 * Axint Registry — local search.
 *
 * Walks the sibling `axint-registry/first-party/` directory (or a path
 * supplied via AXINT_REGISTRY_PATH), reads each package's manifest.json,
 * and ranks matches against a free-form query.
 *
 * The agent-lookup loop (added in 0.4.19) calls this from `axint.suggest`
 * and the new `axint.registry.search` MCP tool. The point: before an agent
 * generates fresh Swift for a feature, it queries the registry to see if
 * a known-good package already exists. If yes, install instead of regenerate.
 *
 * Search is intentionally simple — scoring is token-overlap with light
 * field weighting. No tantivy, no Lucene; the registry is small enough
 * (low hundreds of packages even at scale) that a full scan is < 5ms.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface RegistryManifest {
  schema_version?: string;
  name: string;
  namespace?: string;
  version: string;
  description?: string;
  license?: string;
  primary_language?: string;
  languages?: string[];
  compiler_version?: string;
  surface_areas?: string[];
  tags?: string[];
  siri_phrases?: string[];
  min_ios_version?: string;
  min_macos_version?: string;
  author?: { github_login?: string };
}

export interface RegistrySearchHit {
  name: string;
  namespace?: string;
  version: string;
  description: string;
  score: number;
  /** What field(s) drove the score, surfaced for explainability. */
  matchedOn: string[];
  surfaceAreas: string[];
  tags: string[];
  installCommand: string;
  /** Filesystem path to the package directory (for tooling that wants to read source). */
  path: string;
}

export interface RegistrySearchOptions {
  query: string;
  /** Filter by surface area (e.g. "app-intent", "view", "widget"). */
  kind?: string;
  /** Filter by minimum platform support (e.g. "iOS", "macOS"). */
  platform?: string;
  /** Hard cap on returned hits. Defaults to 10. */
  limit?: number;
  /** Minimum score below which results are dropped. Defaults to 0.1. */
  minScore?: number;
  /** Override for the registry root. Falls back to AXINT_REGISTRY_PATH or sibling. */
  registryPath?: string;
}

const SKIP_FIRSTPARTY_ENTRIES = new Set([".DS_Store", "README.md", ".git"]);

export function locateRegistryRoot(override?: string): string | null {
  const candidates = [
    override,
    process.env.AXINT_REGISTRY_PATH,
    // When running from the axint repo's checkout.
    resolve(process.cwd(), "..", "axint-registry"),
    resolve(process.cwd(), "..", "..", "axint-registry"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "first-party"))) return candidate;
  }
  return null;
}

export function loadRegistryManifests(
  registryPath: string
): Array<{ manifest: RegistryManifest; path: string }> {
  const firstParty = resolve(registryPath, "first-party");
  if (!existsSync(firstParty)) return [];

  const out: Array<{ manifest: RegistryManifest; path: string }> = [];
  for (const name of readdirSync(firstParty)) {
    if (SKIP_FIRSTPARTY_ENTRIES.has(name)) continue;
    const dir = resolve(firstParty, name);
    let stat;
    try {
      stat = statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const manifestPath = resolve(dir, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw) as RegistryManifest;
      if (!manifest.name || !manifest.version) continue;
      out.push({ manifest, path: dir });
    } catch {
      // Skip unreadable / malformed manifests rather than failing the whole search.
      continue;
    }
  }
  return out;
}

/**
 * Tokenize a string for matching: lowercase, split on non-alphanum,
 * drop short tokens. Used for both the query and every searchable field.
 */
function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/**
 * Field weights — tags and name are stronger signals than description.
 * Siri phrases are useful because they're literally what a user might say.
 */
const FIELD_WEIGHTS: Record<string, number> = {
  name: 3.0,
  namespace: 1.0,
  description: 1.0,
  tags: 2.5,
  surface_areas: 2.0,
  siri_phrases: 2.0,
};

interface ScoreBreakdown {
  score: number;
  matchedOn: string[];
}

function scoreManifest(
  manifest: RegistryManifest,
  queryTokens: Set<string>
): ScoreBreakdown {
  if (queryTokens.size === 0) return { score: 0, matchedOn: [] };

  const fieldTokens: Record<string, Set<string>> = {
    name: tokenize(manifest.name),
    namespace: tokenize(manifest.namespace ?? ""),
    description: tokenize(manifest.description ?? ""),
    tags: tokenize((manifest.tags ?? []).join(" ")),
    surface_areas: tokenize((manifest.surface_areas ?? []).join(" ")),
    siri_phrases: tokenize((manifest.siri_phrases ?? []).join(" ")),
  };

  let score = 0;
  const matchedFields = new Set<string>();
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const fieldSet = fieldTokens[field];
    if (!fieldSet || fieldSet.size === 0) continue;
    let fieldHits = 0;
    for (const token of queryTokens) {
      if (fieldSet.has(token)) fieldHits++;
    }
    if (fieldHits > 0) {
      score += (fieldHits / queryTokens.size) * weight;
      matchedFields.add(field);
    }
  }

  // Normalize so the maximum reachable score sits near 1.0 — easier for
  // callers to apply minScore thresholds without understanding the weights.
  const maxPossible = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);
  const normalized = score / maxPossible;
  return { score: normalized, matchedOn: [...matchedFields] };
}

function platformMatches(manifest: RegistryManifest, requested: string): boolean {
  const want = requested.toLowerCase();
  if (want === "ios") return Boolean(manifest.min_ios_version);
  if (want === "macos") return Boolean(manifest.min_macos_version);
  if (want === "watchos" || want === "tvos" || want === "visionos") {
    // No explicit min-version field for these yet; assume "yes" until the
    // manifest schema grows them so we don't drop legitimate matches.
    return true;
  }
  return true;
}

function kindMatches(manifest: RegistryManifest, kind: string): boolean {
  const surfaces = (manifest.surface_areas ?? []).map((s) => s.toLowerCase());
  if (surfaces.length === 0) return true;
  const want = kind.toLowerCase();
  // Allow loose matches: "intent" matches "app-intent", "view" matches "swiftui-view".
  return surfaces.some((s) => s === want || s.includes(want) || want.includes(s));
}

export function searchRegistry(options: RegistrySearchOptions): RegistrySearchHit[] {
  const { query, kind, platform, limit = 10, minScore = 0.1 } = options;
  const root = locateRegistryRoot(options.registryPath);
  if (!root) return [];

  const manifests = loadRegistryManifests(root);
  if (manifests.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  const hits: RegistrySearchHit[] = [];
  for (const { manifest, path } of manifests) {
    if (kind && !kindMatches(manifest, kind)) continue;
    if (platform && !platformMatches(manifest, platform)) continue;

    const { score, matchedOn } = scoreManifest(manifest, queryTokens);
    if (score < minScore) continue;

    const ns = manifest.namespace ?? "";
    const fullName = ns ? `${ns}/${manifest.name}` : manifest.name;
    hits.push({
      name: manifest.name,
      namespace: manifest.namespace,
      version: manifest.version,
      description: manifest.description ?? "",
      score,
      matchedOn,
      surfaceAreas: manifest.surface_areas ?? [],
      tags: manifest.tags ?? [],
      installCommand: `axint install ${fullName}@${manifest.version}`,
      path,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
