import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  AXINT_CONFIG_SCHEMA_URL,
  axintConfigJsonSchema,
  loadAxintConfig,
  validateAxintConfig,
} from "../../src/core/axint-config.js";

const valid = {
  $schema: AXINT_CONFIG_SCHEMA_URL,
  namespace: "@nima",
  slug: "create-event",
  version: "1.0.0",
  name: "Create Event",
  description: "Creates a calendar event from natural language.",
  primary_language: "typescript",
  entry: "intents/create-event.ts",
  license: "Apache-2.0",
  tags: ["calendar", "productivity"],
  surface_areas: ["Calendar"],
};

describe("validateAxintConfig", () => {
  it("accepts the canonical example", () => {
    const result = validateAxintConfig(valid);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing namespace", () => {
    const { namespace, ...rest } = valid;
    void namespace;
    const result = validateAxintConfig(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.find((i) => i.path === "namespace")).toBeDefined();
    }
  });

  it("rejects a namespace without the leading @", () => {
    const result = validateAxintConfig({ ...valid, namespace: "nima" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("namespace");
    }
  });

  it("rejects an UPPERCASE slug", () => {
    const result = validateAxintConfig({ ...valid, slug: "Create-Event" });
    expect(result.ok).toBe(false);
  });

  it("rejects non-semver versions", () => {
    const result = validateAxintConfig({ ...valid, version: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("version");
    }
  });

  it("requires entry — no default at the schema layer", () => {
    const { entry, ...rest } = valid;
    void entry;
    const result = validateAxintConfig(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.find((i) => i.path === "entry")).toBeDefined();
    }
  });

  it("rejects an unsupported license", () => {
    const result = validateAxintConfig({ ...valid, license: "WTFPL" });
    expect(result.ok).toBe(false);
  });

  it("rejects oversized tag arrays", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    const result = validateAxintConfig({ ...valid, tags });
    expect(result.ok).toBe(false);
  });

  it("rejects tags that aren't kebab-case", () => {
    const result = validateAxintConfig({ ...valid, tags: ["Calendar"] });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-URL homepage", () => {
    const result = validateAxintConfig({ ...valid, homepage: "axint.ai" });
    expect(result.ok).toBe(false);
  });

  it("rejects null and arrays as the root value", () => {
    expect(validateAxintConfig(null).ok).toBe(false);
    expect(validateAxintConfig([]).ok).toBe(false);
    expect(validateAxintConfig("nope").ok).toBe(false);
  });
});

describe("loadAxintConfig", () => {
  it("returns missing when axint.json is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "axint-cfg-"));
    const result = await loadAxintConfig(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing");
  });

  it("returns parse errors with the original message", async () => {
    const dir = await mkdtemp(join(tmpdir(), "axint-cfg-"));
    await writeFile(join(dir, "axint.json"), "{ not json", "utf-8");
    const result = await loadAxintConfig(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("parse");
      expect(result.parseError).toBeTruthy();
    }
  });

  it("loads a valid config from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "axint-cfg-"));
    await mkdir(join(dir, "intents"), { recursive: true });
    await writeFile(join(dir, "axint.json"), JSON.stringify(valid), "utf-8");
    const result = await loadAxintConfig(dir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.slug).toBe("create-event");
  });
});

describe("axintConfigJsonSchema", () => {
  it("declares the required fields the validator enforces", () => {
    expect(axintConfigJsonSchema.required).toEqual([
      "namespace",
      "slug",
      "version",
      "name",
      "entry",
    ]);
  });

  it("forbids unknown properties", () => {
    expect(axintConfigJsonSchema.additionalProperties).toBe(false);
  });

  it("declares enum members for primary_language", () => {
    expect(axintConfigJsonSchema.properties.primary_language.enum).toEqual([
      "typescript",
      "python",
      "both",
    ]);
  });
});
