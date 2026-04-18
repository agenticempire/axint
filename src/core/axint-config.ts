// The on-disk axint.json schema — one canonical definition consumed by
// `axint init` (writes it), `axint publish` (reads + validates it), the
// registry (mirrors the value-shape constraints server-side), and the
// docs site (renders a reference page straight from the schema).
//
// The regexes deliberately mirror axint-registry/packages/shared/src/constants.ts
// which also maps 1:1 to the Postgres CHECK constraints on the registry DB.
// If you change one, change all three.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface AxintConfig {
  $schema?: string;
  namespace: string;
  slug: string;
  version: string;
  name: string;
  description?: string;
  primary_language?: "typescript" | "python" | "both";
  entry: string;
  readme?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  tags?: string[];
  surface_areas?: string[];
}

export const AXINT_CONFIG_SCHEMA_URL = "https://docs.axint.ai/schema/axint.json";

const NAMESPACE_PATTERN = /^@[a-z0-9][a-z0-9-]{0,38}$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,48}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;
const URL_PATTERN = /^https?:\/\/\S+$/;

const PRIMARY_LANGUAGES = ["typescript", "python", "both"] as const;
const SUPPORTED_LICENSES = [
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "0BSD",
  "Unlicense",
] as const;

const MAX_DESCRIPTION = 500;
const MAX_TAGS = 10;
const MAX_SURFACE_AREAS = 5;

export type ValidationIssue = { path: string; message: string };

export type ValidationResult =
  | { ok: true; config: AxintConfig }
  | { ok: false; issues: ValidationIssue[] };

export function validateAxintConfig(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ path: "", message: "axint.json must be a JSON object" }],
    };
  }

  const obj = raw as Record<string, unknown>;

  // Required ————————————————————————————————————————————————————————

  if (typeof obj.namespace !== "string" || !NAMESPACE_PATTERN.test(obj.namespace)) {
    push(
      "namespace",
      `must match ${NAMESPACE_PATTERN} — lowercase, starts with @, 1-39 chars after @`
    );
  }

  if (typeof obj.slug !== "string" || !SLUG_PATTERN.test(obj.slug)) {
    push("slug", `must match ${SLUG_PATTERN} — lowercase kebab-case, 1-49 chars`);
  }

  if (typeof obj.version !== "string" || !SEMVER_PATTERN.test(obj.version)) {
    push("version", "must be valid semver (e.g. 1.0.0, 1.0.0-beta.1)");
  }

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    push("name", "required — human-readable display name");
  }

  if (typeof obj.entry !== "string" || obj.entry.trim().length === 0) {
    push(
      "entry",
      "required — path to the intent source file, relative to the project root"
    );
  }

  // Optional ————————————————————————————————————————————————————————

  if (obj.description !== undefined) {
    if (typeof obj.description !== "string") push("description", "must be a string");
    else if (obj.description.length > MAX_DESCRIPTION) {
      push("description", `must be ≤ ${MAX_DESCRIPTION} characters`);
    }
  }

  if (obj.primary_language !== undefined) {
    if (!PRIMARY_LANGUAGES.includes(obj.primary_language as never)) {
      push("primary_language", `must be one of: ${PRIMARY_LANGUAGES.join(", ")}`);
    }
  }

  if (obj.readme !== undefined && typeof obj.readme !== "string") {
    push("readme", "must be a string path");
  }

  if (obj.license !== undefined) {
    if (typeof obj.license !== "string") push("license", "must be a string");
    else if (!SUPPORTED_LICENSES.includes(obj.license as never)) {
      push("license", `must be one of: ${SUPPORTED_LICENSES.join(", ")}`);
    }
  }

  for (const key of ["homepage", "repository"] as const) {
    const value = obj[key];
    if (value !== undefined) {
      if (typeof value !== "string") push(key, "must be a URL string");
      else if (!URL_PATTERN.test(value)) push(key, "must start with http:// or https://");
    }
  }

  if (obj.tags !== undefined) {
    if (!Array.isArray(obj.tags)) push("tags", "must be an array of strings");
    else {
      if (obj.tags.length > MAX_TAGS) push("tags", `at most ${MAX_TAGS} tags`);
      obj.tags.forEach((t, i) => {
        if (typeof t !== "string" || !/^[a-z][a-z0-9-]*$/.test(t)) {
          push(`tags[${i}]`, "must be lowercase kebab-case");
        }
      });
    }
  }

  if (obj.surface_areas !== undefined) {
    if (!Array.isArray(obj.surface_areas))
      push("surface_areas", "must be an array of strings");
    else if (obj.surface_areas.length > MAX_SURFACE_AREAS) {
      push("surface_areas", `at most ${MAX_SURFACE_AREAS} surface areas`);
    }
  }

  if (obj.$schema !== undefined && typeof obj.$schema !== "string") {
    push("$schema", "must be a string URL");
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, config: obj as unknown as AxintConfig };
}

export async function loadAxintConfig(
  cwd: string
): Promise<
  | { ok: true; config: AxintConfig; path: string }
  | {
      ok: false;
      reason: "missing" | "parse" | "invalid";
      path: string;
      issues?: ValidationIssue[];
      parseError?: string;
    }
> {
  const path = resolve(cwd, "axint.json");

  let text: string;
  try {
    text = await readFile(path, "utf-8");
  } catch {
    return { ok: false, reason: "missing", path };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: "parse", path, parseError: (err as Error).message };
  }

  const result = validateAxintConfig(parsed);
  if (!result.ok) return { ok: false, reason: "invalid", path, issues: result.issues };
  return { ok: true, config: result.config, path };
}

// The published JSON Schema document. Kept in lockstep with the validator
// above — the regexes, enums, and max values all come from the same
// constants so drift can't sneak in.
export const axintConfigJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: AXINT_CONFIG_SCHEMA_URL,
  title: "Axint project configuration",
  description:
    "The axint.json file at the root of an Axint project. Consumed by `axint init`, `axint publish`, and the Axint registry.",
  type: "object",
  required: ["namespace", "slug", "version", "name", "entry"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string", format: "uri" },
    namespace: {
      type: "string",
      pattern: NAMESPACE_PATTERN.source,
      description: "Registry namespace, starts with @ (e.g. @nima).",
    },
    slug: {
      type: "string",
      pattern: SLUG_PATTERN.source,
      description: "URL-safe package slug within the namespace (e.g. create-event).",
    },
    version: {
      type: "string",
      pattern: SEMVER_PATTERN.source,
      description: "Semantic version for this publish.",
    },
    name: {
      type: "string",
      minLength: 1,
      description: "Human-readable display name shown on the registry page.",
    },
    description: {
      type: "string",
      maxLength: MAX_DESCRIPTION,
      description: "One-sentence summary surfaced in search and listings.",
    },
    primary_language: {
      type: "string",
      enum: [...PRIMARY_LANGUAGES],
      description: "Primary source language. Inferred when omitted.",
    },
    entry: {
      type: "string",
      minLength: 1,
      description:
        "Path to the intent source file, relative to the project root. `axint init` sets this; publish reads it.",
    },
    readme: {
      type: "string",
      description: "Path to a README. Contents are uploaded with the publish.",
    },
    license: {
      type: "string",
      enum: [...SUPPORTED_LICENSES],
      description: "SPDX identifier from the supported set.",
    },
    homepage: { type: "string", format: "uri" },
    repository: { type: "string", format: "uri" },
    tags: {
      type: "array",
      maxItems: MAX_TAGS,
      items: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
    },
    surface_areas: {
      type: "array",
      maxItems: MAX_SURFACE_AREAS,
      items: { type: "string" },
    },
  },
} as const;
